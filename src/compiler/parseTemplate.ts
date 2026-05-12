import { createCompileError, getSourceLocation } from "./errors.js";
import type { SourceLocation } from "./errors.js";
import type { ElementNode, TemplateAttribute, TemplateNode, TextNode, TextPart } from "./types.js";
import { validateTemplateExpression } from "./parseExpression.js";

type TemplateToken =
  | { type: "text"; value: string; start: number }
  | { type: "tag"; value: string; start: number };

type ParseTemplateOptions = {
  filename?: string;
  source?: string;
  offset?: number;
};

type LocationContext = {
  filename?: string;
  source: string;
  offset: number;
};

const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);

export function parseTemplate(template: string, options: ParseTemplateOptions = {}): ElementNode {
  const context: LocationContext = {
    filename: options.filename,
    source: options.source ?? template,
    offset: options.offset ?? 0
  };
  const root: ElementNode = {
    type: "element",
    tag: "root",
    attrs: [],
    children: []
  };
  const stack: ElementNode[] = [root];

  for (const token of tokenizeTemplate(template, context)) {
    if (token.type === "text") {
      const textNode = isPreMode(stack)
        ? parseRawText(token.value, token.start, context)
        : parseText(token.value, token.start, context);

      if (textNode) {
        currentParent(stack).children.push(textNode);
      }

      continue;
    }

    if (token.value.startsWith("</")) {
      closeElement(token.value, token.start, stack, context);
      continue;
    }

    const { element, selfClosing } = parseElement(token.value, token.start, context);
    currentParent(stack).children.push(element);

    if (!selfClosing && !voidElements.has(element.tag.toLowerCase())) {
      stack.push(element);
    }
  }

  if (stack.length !== 1) {
    const openElement = stack.at(-1);
    throw createCompileError(
      `Unclosed template element <${openElement?.tag ?? "unknown"}>`,
      context.source,
      openElement?.loc?.offset ?? context.offset,
      context.filename
    );
  }

  const children = root.children.filter((node) => node.type !== "text" || hasMeaningfulText(node));

  if (children.length !== 1 || children[0]?.type !== "element") {
    throw createCompileError("Template must contain exactly one root element", context.source, context.offset, context.filename);
  }

  return children[0];
}

function tokenizeTemplate(template: string, context: LocationContext): TemplateToken[] {
  const tokens: TemplateToken[] = [];
  let cursor = 0;

  while (cursor < template.length) {
    const tagStart = template.indexOf("<", cursor);

    if (tagStart === -1) {
      tokens.push({ type: "text", value: template.slice(cursor), start: cursor });
      break;
    }

    if (tagStart > cursor) {
      tokens.push({ type: "text", value: template.slice(cursor, tagStart), start: cursor });
    }

    if (template.startsWith("<!--", tagStart)) {
      const commentEnd = template.indexOf("-->", tagStart + 4);

      if (commentEnd === -1) {
        throw createCompileError("Unclosed HTML comment in template", context.source, context.offset + tagStart, context.filename);
      }

      cursor = commentEnd + 3;
      continue;
    }

    const tagEnd = findTagEnd(template, tagStart);

    if (tagEnd === -1) {
      throw createCompileError(
        `Unclosed template tag near: ${template.slice(tagStart, tagStart + 20)}`,
        context.source,
        context.offset + tagStart,
        context.filename
      );
    }

    tokens.push({ type: "tag", value: template.slice(tagStart, tagEnd + 1), start: tagStart });
    cursor = tagEnd + 1;
  }

  return tokens;
}

function findTagEnd(template: string, tagStart: number): number {
  let quote: "\"" | "'" | undefined;

  for (let index = tagStart + 1; index < template.length; index += 1) {
    const char = template[index];

    if (quote) {
      if (char === quote) {
        quote = undefined;
      }

      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === ">") {
      return index;
    }
  }

  return -1;
}

function parseElement(token: string, tokenStart: number, context: LocationContext): { element: ElementNode; selfClosing: boolean } {
  const inner = token
    .replace(/^</, "")
    .replace(/>$/, "")
    .trim();
  const selfClosing = /\/\s*$/.test(inner);
  const source = selfClosing ? inner.replace(/\/\s*$/, "").trim() : inner;
  const tagMatch = /^([^\s/>]+)/.exec(source);

  if (!tagMatch) {
    throw createCompileError(`Invalid template element: ${token}`, context.source, context.offset + tokenStart, context.filename);
  }

  const tag = tagMatch[1];

  if (!/^[A-Za-z][\w:-]*$/.test(tag)) {
    throw createCompileError(`Invalid template tag name: ${tag}`, context.source, context.offset + tokenStart + 1, context.filename);
  }

  const rawAttrSource = source.slice(tag.length);
  const attrLeadingWhitespace = rawAttrSource.length - rawAttrSource.trimStart().length;
  const attrSource = rawAttrSource.trim();
  const attrSourceStart = tokenStart + 1 + tag.length + attrLeadingWhitespace;

  return {
    element: {
      type: "element",
      tag,
      attrs: parseAttributes(attrSource, attrSourceStart, context),
      children: [],
      loc: toLocation(tokenStart, context)
    },
    selfClosing
  };
}

function parseAttributes(source: string, sourceStart: number, context: LocationContext): TemplateAttribute[] {
  const attrs: TemplateAttribute[] = [];
  const seen = new Set<string>();
  let cursor = 0;

  while (cursor < source.length) {
    cursor = skipWhitespace(source, cursor);

    if (cursor >= source.length) {
      break;
    }

    const nameStart = cursor;

    while (cursor < source.length && !/[\s=]/.test(source[cursor])) {
      cursor += 1;
    }

    const name = source.slice(nameStart, cursor);

    if (!name) {
      break;
    }

    if (!/^[^\s="'<>/]+$/.test(name)) {
      throw createCompileError(`Invalid template attribute name: ${name}`, context.source, context.offset + sourceStart + nameStart, context.filename);
    }

    if (seen.has(name)) {
      throw createCompileError(`Duplicate template attribute: ${name}`, context.source, context.offset + sourceStart + nameStart, context.filename);
    }

    seen.add(name);
    cursor = skipWhitespace(source, cursor);

    if (source[cursor] !== "=") {
      attrs.push({ name, value: true, loc: toLocation(sourceStart + nameStart, context) });
      continue;
    }

    cursor += 1;
    cursor = skipWhitespace(source, cursor);

    const parsedValue = parseAttributeValue(source, cursor, sourceStart, context);
    attrs.push({
      name,
      value: parsedValue.value,
      loc: toLocation(sourceStart + nameStart, context),
      valueLoc: toLocation(sourceStart + parsedValue.valueStart, context)
    });
    cursor = parsedValue.cursor;
  }

  return attrs;
}

function parseAttributeValue(
  source: string,
  cursor: number,
  sourceStart: number,
  context: LocationContext
): { value: string; valueStart: number; cursor: number } {
  const quote = source[cursor];

  if (quote === "\"" || quote === "'") {
    const valueStart = cursor + 1;
    const valueEnd = source.indexOf(quote, valueStart);

    if (valueEnd === -1) {
      throw createCompileError(
        `Unclosed attribute value near: ${source.slice(cursor, cursor + 20)}`,
        context.source,
        context.offset + sourceStart + cursor,
        context.filename
      );
    }

    return {
      value: source.slice(valueStart, valueEnd),
      valueStart,
      cursor: valueEnd + 1
    };
  }

  const valueStart = cursor;

  while (cursor < source.length && !/\s/.test(source[cursor])) {
    cursor += 1;
  }

  return {
    value: source.slice(valueStart, cursor),
    valueStart,
    cursor
  };
}

function skipWhitespace(source: string, cursor: number): number {
  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1;
  }

  return cursor;
}

function parseText(token: string, tokenStart: number, context: LocationContext): TextNode | undefined {
  if (!token.trim()) {
    return undefined;
  }

  const parts: TextPart[] = [];
  const interpolationPattern = /\{\{\s*([\s\S]*?)\s*\}\}/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = interpolationPattern.exec(token))) {
    if (match.index > cursor) {
      parts.push({ type: "static", value: token.slice(cursor, match.index) });
    }

    const rawExpression = match[1];
    const leadingWhitespace = rawExpression.length - rawExpression.trimStart().length;
    const expressionStart = tokenStart + match.index + match[0].indexOf(rawExpression) + leadingWhitespace;
    parts.push({
      type: "expression",
      value: validateTemplateExpression(rawExpression, "interpolation", {
        source: context.source,
        offset: context.offset + expressionStart,
        filename: context.filename
      }),
      loc: toLocation(expressionStart, context)
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < token.length) {
    parts.push({ type: "static", value: token.slice(cursor) });
  }

  return {
    type: "text",
    parts,
    loc: toLocation(tokenStart, context)
  };
}

function parseRawText(token: string, tokenStart: number, context: LocationContext): TextNode | undefined {
  if (!token.trim()) {
    return undefined;
  }

  return {
    type: "text",
    parts: [{ type: "static", value: token }],
    loc: toLocation(tokenStart, context)
  };
}

function closeElement(token: string, tokenStart: number, stack: ElementNode[], context: LocationContext): void {
  const tag = token.replace(/^<\//, "").replace(/>$/, "").trim();
  const current = stack.pop();

  if (!current || current.tag !== tag) {
    throw createCompileError(`Unexpected closing tag </${tag}>`, context.source, context.offset + tokenStart, context.filename);
  }
}

function isPreMode(stack: ElementNode[]): boolean {
  return stack.some((node) => node.attrs.some((attr) => attr.name === "v-pre"));
}

function currentParent(stack: ElementNode[]): ElementNode {
  const parent = stack.at(-1);

  if (!parent) {
    throw new Error("Template parser stack is empty");
  }

  return parent;
}

function hasMeaningfulText(node: TextNode): boolean {
  return node.parts.some((part) => part.type === "expression" || part.value.trim().length > 0);
}

function toLocation(localOffset: number, context: LocationContext): SourceLocation {
  return getSourceLocation(context.source, context.offset + localOffset, context.filename);
}
