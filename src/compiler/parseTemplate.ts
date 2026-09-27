import { createCompileError, getSourceLocation } from "./errors.js";
import type { SourceLocation } from "./errors.js";
import type { ElementNode, TemplateAttribute, TemplateNode, TextNode, TextPart } from "./types.js";
import { validateTemplateExpression } from "./parseExpression.js";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
type HtmlNode = DefaultTreeAdapterTypes.ChildNode;
type HtmlElement = DefaultTreeAdapterTypes.Element;
type HtmlTemplate = DefaultTreeAdapterTypes.Template;
import type { TemplateRoot } from "./types.js";
import { emitDebugDiagnostic } from "../runtime/devtools.js";

type TemplateToken =
  | { type: "text"; value: string; start: number }
  | { type: "tag"; value: string; start: number };

type ParseTemplateOptions = {
  filename?: string;
  source?: string;
  offset?: number;
  debug?: boolean;
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

export function parseTemplate(template: string, options: ParseTemplateOptions = {}): TemplateRoot {
  const context: LocationContext = {
    filename: options.filename,
    source: options.source ?? template,
    offset: options.offset ?? 0
  };
  // Mask tag-like text inside interpolation without changing source offsets.
  const protectedTemplate = template.replace(/\{\{[\s\S]*?\}\}/g, (match) => match.replace(/[<>]/g, " "));
  const insertions: Array<{ at: number; size: number }> = [];
  let htmlSource = "";
  let previousEnd = 0;
  for (const token of tokenizeTemplate(protectedTemplate, context)) {
    if (token.type !== "tag" || !/\/\s*>$/.test(token.value) || token.value.startsWith("</")) continue;
    const tag = /^<([A-Za-z][\w:-]*)/.exec(token.value)?.[1];
    if (!tag || voidElements.has(tag.toLowerCase())) continue;
    const end = token.start + token.value.length;
    htmlSource += protectedTemplate.slice(previousEnd, end);
    const closingTag = `</${tag}>`;
    insertions.push({ at: end, size: closingTag.length });
    htmlSource += closingTag;
    previousEnd = end;
  }
  htmlSource += protectedTemplate.slice(previousEnd);
  const originalOffset = (offset: number): number => {
    let inserted = 0;
    for (const insertion of insertions) {
      const transformedAt = insertion.at + inserted;
      if (offset <= transformedAt) break;
      if (offset <= transformedAt + insertion.size) return insertion.at;
      inserted += insertion.size;
    }
    return offset - inserted;
  };
  const html = parseFragment(htmlSource, {
    sourceCodeLocationInfo: true,
    onParseError: (error) => {
      if (error.code === "non-void-html-element-start-tag-with-trailing-solidus") return;
      if (options.debug) emitDebugDiagnostic("compiler", "warning", `HTML parser repaired template structure: ${error.code}.`, {
        phase: "template", filename: context.filename, loc: toLocation(originalOffset(error.startOffset), context)
      });
    }
  });
  const convert = (node: HtmlNode, pre = false): TemplateNode | undefined => {
    if (node.nodeName === "#comment" || node.nodeName === "#documentType") return undefined;
    if (node.nodeName === "#text") {
      const start = originalOffset(node.sourceCodeLocation?.startOffset ?? 0);
      const raw = template.slice(start, originalOffset(node.sourceCodeLocation?.endOffset ?? start));
      const text = pre ? parseRawText(raw, start, context) : parseText(raw, start, context);
      if (text) {
        for (const part of text.parts) {
          if (part.type === "static" && part.value.includes("&")) {
            const decoded = parseFragment(part.value);
            part.value = decoded.childNodes.map((child) => child.nodeName === "#text" ? (child as DefaultTreeAdapterTypes.TextNode).value : part.value).join("");
          }
        }
      }
      return text;
    }
    const element = node as HtmlElement;
    const location = element.sourceCodeLocation;
    const transformedStart = location?.startTag?.startOffset ?? location?.startOffset;
    const start = transformedStart === undefined ? undefined : originalOffset(transformedStart);
    let result: ElementNode;
    if (start === undefined) {
      result = { type: "element", tag: element.tagName, attrs: [], children: [] };
      if (options.debug) emitDebugDiagnostic("compiler", "warning", `HTML parser inserted <${element.tagName}>.`, { phase: "template", filename: context.filename });
    } else {
      const end = originalOffset(location?.startTag?.endOffset ?? location?.endOffset ?? start);
      result = parseElement(template.slice(start, end), start, context).element;
      result.namespaceURI = element.namespaceURI;
      for (let index = 0; index < result.attrs.length; index += 1) {
        if (result.attrs[index]?.value !== true && element.attrs[index]) result.attrs[index]!.value = element.attrs[index]!.value;
      }
      if (options.debug && !location?.endTag && !voidElements.has(result.tag.toLowerCase()) && !/\/\s*>$/.test(template.slice(start, end))) {
        emitDebugDiagnostic("compiler", "warning", `HTML parser closed <${result.tag}> implicitly.`, { phase: "template", filename: context.filename, loc: result.loc });
      }
    }
    const children = element.tagName === "template"
      ? (element as HtmlTemplate).content.childNodes
      : element.childNodes;
    const childPre = pre || result.attrs.some((attr) => attr.name === "v-pre");
    result.children = children.map((child) => convert(child, childPre)).filter((child): child is TemplateNode => child !== undefined);
    return result;
  };
  const children = html.childNodes.map((node) => convert(node)).filter((node): node is TemplateNode => node !== undefined)
    .filter((node) => node.type !== "text" || hasMeaningfulText(node));
  if (children.length === 1 && children[0]?.type === "element") return children[0];
  return { type: "fragment", children, loc: toLocation(0, context) };
}

function tokenizeTemplate(template: string, context: LocationContext): TemplateToken[] {
  const tokens: TemplateToken[] = [];
  let cursor = 0;

  while (cursor < template.length) {
    const tagStart = findNextTagStart(template, cursor);

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

function findNextTagStart(template: string, start: number): number {
  for (let index = start; index < template.length; index += 1) {
    if (template.startsWith("{{", index)) {
      const interpolationEnd = template.indexOf("}}", index + 2);
      if (interpolationEnd !== -1) {
        index = interpolationEnd + 1;
        continue;
      }
    }

    if (template[index] !== "<") {
      continue;
    }

    const next = template[index + 1] ?? "";
    if (/[A-Za-z!]/.test(next)
      || (/[0-9]/.test(next) && /^<\d[\w:-]*>/.test(template.slice(index)))
      || (next === "/" && /[A-Za-z]/.test(template[index + 2] ?? ""))) {
      return index;
    }
  }

  return -1;
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

    const rawName = source.slice(nameStart, cursor);
    const name = normalizeDirectiveName(rawName);

    if (!rawName) {
      break;
    }

    if (!/^[^\s="'<>/]+$/.test(rawName)) {
      throw createCompileError(`Invalid template attribute name: ${rawName}`, context.source, context.offset + sourceStart + nameStart, context.filename);
    }

    if (seen.has(name)) {
      throw createCompileError(`Duplicate template attribute: ${name}`, context.source, context.offset + sourceStart + nameStart, context.filename);
    }

    seen.add(name);
    cursor = skipWhitespace(source, cursor);

    if (source[cursor] !== "=") {
      attrs.push({
        name,
        sourceName: directiveSourceName(rawName, name),
        value: true,
        loc: toLocation(sourceStart + nameStart, context)
      });
      continue;
    }

    cursor += 1;
    cursor = skipWhitespace(source, cursor);

    const parsedValue = parseAttributeValue(source, cursor, sourceStart, context);
    attrs.push({
      name,
      sourceName: directiveSourceName(rawName, name),
      value: parsedValue.value,
      loc: toLocation(sourceStart + nameStart, context),
      valueLoc: toLocation(sourceStart + parsedValue.valueStart, context)
    });
    cursor = parsedValue.cursor;
  }

  return attrs;
}

function normalizeDirectiveName(name: string): string {
  return name.startsWith("m-") ? `v-${name.slice("m-".length)}` : name;
}

function directiveSourceName(rawName: string, name: string): string | undefined {
  return rawName.startsWith("v-") || rawName !== name ? rawName : undefined;
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

function hasMeaningfulText(node: TextNode): boolean {
  return node.parts.some((part) => part.type === "expression" || part.value.trim().length > 0);
}

function toLocation(localOffset: number, context: LocationContext): SourceLocation {
  return getSourceLocation(context.source, context.offset + localOffset, context.filename);
}
