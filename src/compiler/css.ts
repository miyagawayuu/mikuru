import type { SfcDescriptor } from "./types.js";

export type CssCompileDiagnostic = {
  level: "warning";
  message: string;
  offset?: number;
  line?: number;
  column?: number;
};

export type CssCompileOptions = {
  filename?: string;
  scoped?: boolean;
  scopeAttr?: string;
};

export type CssCompileResult = {
  code: string;
  scoped: boolean;
  scopeAttr?: string;
  diagnostics: CssCompileDiagnostic[];
};

const nestedRuleAtRules = new Set(["media", "supports", "container", "layer", "scope", "starting-style"]);
const rawBlockAtRules = new Set([
  "keyframes",
  "-webkit-keyframes",
  "-moz-keyframes",
  "-o-keyframes",
  "counter-style",
  "font-face",
  "font-feature-values",
  "page",
  "property",
  "viewport"
]);

export function compileStyle(css: string, options: CssCompileOptions = {}): CssCompileResult {
  const diagnostics: CssCompileDiagnostic[] = [];
  const trimmed = css.trim();
  const scoped = options.scoped === true && !!options.scopeAttr;

  if (!scoped) {
    return {
      code: trimmed,
      scoped: false,
      diagnostics
    };
  }

  return {
    code: scopeCss(trimmed, options.scopeAttr!, diagnostics, trimmed),
    scoped: true,
    scopeAttr: options.scopeAttr,
    diagnostics
  };
}

export function compileDescriptorStyle(descriptor: SfcDescriptor, scopeAttr?: string): CssCompileResult {
  return compileStyle(descriptor.style ?? "", {
    filename: descriptor.filename,
    scoped: descriptor.styleScoped === true,
    scopeAttr
  });
}

function scopeCss(
  css: string,
  scopeAttr: string,
  diagnostics: CssCompileDiagnostic[],
  rootCss: string,
  offset = 0
): string {
  let result = "";
  let index = 0;

  while (index < css.length) {
    const openIndex = findNextTopLevelChar(css, "{", index);
    if (openIndex === -1) {
      result += css.slice(index);
      break;
    }

    const closeIndex = findMatchingBrace(css, openIndex);
    if (closeIndex === -1) {
      const diagnosticOffset = offset + openIndex;
      const location = getOffsetLocation(rootCss, diagnosticOffset);
      diagnostics.push({
        level: "warning",
        message: "Could not scope a CSS rule because its block is missing a closing brace.",
        offset: diagnosticOffset,
        line: location.line,
        column: location.column
      });
      result += css.slice(index);
      break;
    }

    const preludeStart = findPreludeStart(css, index, openIndex);
    const beforePrelude = css.slice(index, preludeStart);
    const prelude = css.slice(preludeStart, openIndex);
    const body = css.slice(openIndex + 1, closeIndex);
    const scopedRule = scopeRule(prelude, body, scopeAttr, diagnostics, rootCss, offset + openIndex + 1);

    result += beforePrelude + scopedRule;
    index = closeIndex + 1;
  }

  return result;
}

function scopeRule(
  prelude: string,
  body: string,
  scopeAttr: string,
  diagnostics: CssCompileDiagnostic[],
  rootCss: string,
  bodyOffset: number
): string {
  const trimmedPrelude = prelude.trim();

  if (!trimmedPrelude) {
    return `${prelude}{${body}}`;
  }

  if (trimmedPrelude.startsWith("@")) {
    const atRuleName = readAtRuleName(trimmedPrelude);
    if (nestedRuleAtRules.has(atRuleName)) {
      return `${prelude}{${scopeCss(body, scopeAttr, diagnostics, rootCss, bodyOffset)}}`;
    }

    if (rawBlockAtRules.has(atRuleName)) {
      return `${prelude}{${body}}`;
    }

    return bodyContainsRules(body) ? `${prelude}{${scopeCss(body, scopeAttr, diagnostics, rootCss, bodyOffset)}}` : `${prelude}{${body}}`;
  }

  const scopedBody = bodyContainsRules(body) ? scopeCss(body, scopeAttr, diagnostics, rootCss, bodyOffset) : body;
  return `${scopeSelectorList(prelude, scopeAttr)}{${scopedBody}}`;
}

function scopeSelectorList(selectorSource: string, scopeAttr: string): string {
  return splitSelectorList(selectorSource)
    .map((selector) => scopeSingleSelector(selector, scopeAttr))
    .join(",");
}

function scopeSingleSelector(selector: string, scopeAttr: string): string {
  const leading = selector.match(/^\s*/)?.[0] ?? "";
  const trailing = selector.match(/\s*$/)?.[0] ?? "";
  let body = selector.trim();

  if (!body || body.includes(`[${scopeAttr}]`)) {
    return selector;
  }

  if (isPureGlobalSelector(selector, "global")) {
    body = unwrapFunctionalPseudo(body, "global");
    return `${leading}${body}${trailing}`;
  }

  const globalMatch = findFunctionalPseudo(body, "global");
  if (globalMatch) {
    const prefix = body.slice(0, globalMatch.start).trimEnd();
    const argument = globalMatch.argument.trim();
    const suffix = body.slice(globalMatch.end).trimStart();
    const scopedPrefix = prefix ? insertScopeAttribute(prefix, scopeAttr) : "";
    return `${leading}${scopedPrefix}${scopedPrefix ? " " : ""}${argument}${suffix ? ` ${suffix}` : ""}${trailing}`;
  }

  const deepMatch = findFunctionalPseudo(body, "deep");
  if (deepMatch) {
    const prefix = body.slice(0, deepMatch.start).trimEnd();
    const argument = deepMatch.argument.trim();
    const suffix = body.slice(deepMatch.end).trimStart();
    const scopedPrefix = prefix ? insertScopeAttribute(prefix, scopeAttr) : `[${scopeAttr}]`;
    return `${leading}${scopedPrefix} ${argument}${suffix ? ` ${suffix}` : ""}${trailing}`;
  }

  return `${leading}${insertScopeAttribute(body, scopeAttr)}${trailing}`;
}

function insertScopeAttribute(selector: string, scopeAttr: string): string {
  const insertIndex = findScopeInsertIndex(selector);
  if (insertIndex === -1) {
    return `${selector}[${scopeAttr}]`;
  }

  return `${selector.slice(0, insertIndex)}[${scopeAttr}]${selector.slice(insertIndex)}`;
}

function findScopeInsertIndex(selector: string): number {
  let depth = 0;
  let quote: string | undefined;
  let lastCombinator = -1;
  let firstPseudoInTarget = -1;

  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    const previous = selector[index - 1];

    if (char === "\\") {
      index += 1;
      continue;
    }

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = undefined;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(" || char === "[") {
      depth += 1;
      continue;
    }

    if (char === ")" || char === "]") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (depth > 0) {
      continue;
    }

    if (isCombinator(char)) {
      lastCombinator = index;
      firstPseudoInTarget = -1;
      continue;
    }

    if (char === ":" && index > lastCombinator && firstPseudoInTarget === -1) {
      firstPseudoInTarget = index;
    }
  }

  return firstPseudoInTarget === -1 ? selector.length : firstPseudoInTarget;
}

function splitSelectorList(selectorSource: string): string[] {
  const selectors: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | undefined;

  for (let index = 0; index < selectorSource.length; index += 1) {
    const char = selectorSource[index];
    const previous = selectorSource[index - 1];

    if (char === "\\") {
      index += 1;
      continue;
    }

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = undefined;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(" || char === "[") {
      depth += 1;
      continue;
    }

    if (char === ")" || char === "]") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (char === "," && depth === 0) {
      selectors.push(selectorSource.slice(start, index));
      start = index + 1;
    }
  }

  selectors.push(selectorSource.slice(start));
  return selectors;
}

function unwrapFunctionalPseudo(selector: string, name: string): string {
  const match = findFunctionalPseudo(selector, name);
  if (!match) {
    return selector;
  }

  return `${selector.slice(0, match.start)}${match.argument}${selector.slice(match.end)}`;
}

function isPureGlobalSelector(selector: string, name: string): boolean {
  const match = findFunctionalPseudo(selector.trim(), name);
  return match?.start === 0 && match.end === selector.trim().length;
}

function findFunctionalPseudo(selector: string, name: string): { start: number; end: number; argument: string } | undefined {
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: string | undefined;

  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    const previous = selector[index - 1];

    if (char === "\\") {
      index += 1;
      continue;
    }

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = undefined;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
      continue;
    }

    if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }

    if (bracketDepth > 0) {
      continue;
    }

    if (char === "(") {
      parenDepth += 1;
      continue;
    }

    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }

    if (char !== ":" || parenDepth > 0 || !matchesFunctionalPseudoName(selector, index, name)) {
      continue;
    }

    const argumentStart = index + name.length + 2;
    const close = findMatchingParen(selector, argumentStart - 1);
    if (close === -1) {
      return undefined;
    }

    return {
      start: index,
      end: close + 1,
      argument: selector.slice(argumentStart, close)
    };
  }

  return undefined;
}

function matchesFunctionalPseudoName(selector: string, colonIndex: number, name: string): boolean {
  if (selector[colonIndex + 1] === ":") {
    return false;
  }

  const nameStart = colonIndex + 1;
  const nameEnd = nameStart + name.length;
  return selector.slice(nameStart, nameEnd) === name && selector[nameEnd] === "(";
}

function findPreludeStart(css: string, searchStart: number, openIndex: number): number {
  let boundary = searchStart;
  let quote: string | undefined;
  let parenDepth = 0;
  let bracketDepth = 0;
  let inComment = false;

  for (let index = searchStart; index < openIndex; index += 1) {
    const char = css[index];
    const next = css[index + 1];
    const previous = css[index - 1];

    if (char === "\\") {
      index += 1;
      continue;
    }

    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = undefined;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") {
      parenDepth += 1;
      continue;
    }

    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
      continue;
    }

    if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }

    if ((char === "}" || char === ";") && parenDepth === 0 && bracketDepth === 0) {
      boundary = index + 1;
    }
  }

  return skipCssIgnorablePrefix(css, boundary, openIndex);
}

function skipCssIgnorablePrefix(css: string, start: number, end: number): number {
  let index = start;

  while (index < end) {
    while (index < end && /\s/.test(css[index])) {
      index += 1;
    }

    if (css[index] === "/" && css[index + 1] === "*") {
      const commentEnd = css.indexOf("*/", index + 2);
      if (commentEnd === -1 || commentEnd + 2 > end) {
        return start;
      }
      index = commentEnd + 2;
      continue;
    }

    break;
  }

  return index;
}

function findNextTopLevelChar(source: string, target: string, start: number): number {
  let quote: string | undefined;
  let parenDepth = 0;
  let bracketDepth = 0;
  let inComment = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    const previous = source[index - 1];

    if (char === "\\") {
      index += 1;
      continue;
    }

    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = undefined;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") {
      parenDepth += 1;
      continue;
    }

    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
      continue;
    }

    if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }

    if (char === target && parenDepth === 0 && bracketDepth === 0) {
      return index;
    }
  }

  return -1;
}

function findMatchingBrace(source: string, openIndex: number): number {
  return findMatchingPair(source, openIndex, "{", "}");
}

function findMatchingParen(source: string, openIndex: number): number {
  return findMatchingPair(source, openIndex, "(", ")");
}

function findMatchingPair(source: string, openIndex: number, openChar: string, closeChar: string): number {
  let depth = 0;
  let quote: string | undefined;
  let inComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    const previous = source[index - 1];

    if (char === "\\") {
      index += 1;
      continue;
    }

    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = undefined;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function readAtRuleName(prelude: string): string {
  const match = prelude.match(/^@([-\w]+)/);
  return match?.[1].toLowerCase() ?? "";
}

function bodyContainsRules(body: string): boolean {
  return findNextTopLevelChar(body, "{", 0) !== -1;
}

function getOffsetLocation(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;

  for (let index = 0; index < source.length && index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return { line, column };
}

function isCombinator(char: string): boolean {
  return char === ">" || char === "+" || char === "~" || /\s/.test(char);
}
