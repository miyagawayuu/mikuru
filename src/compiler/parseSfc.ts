import { createCompileError } from "./errors.js";
import type { SfcDescriptor } from "./types.js";

const supportedBlocks = new Set(["template", "script", "style"]);

export function parseSfc(source: string, filename?: string): SfcDescriptor {
  const descriptor: Partial<SfcDescriptor> = { filename, source };
  const seen = new Set<string>();
  let cursor = 0;

  while (cursor < source.length) {
    const blockStart = source.indexOf("<", cursor);

    if (blockStart === -1) {
      break;
    }

    if (source.startsWith("<!--", blockStart)) {
      const commentEnd = source.indexOf("-->", blockStart + 4);
      cursor = commentEnd === -1 ? source.length : commentEnd + 3;
      continue;
    }

    if (source.startsWith("</", blockStart)) {
      cursor = blockStart + 2;
      continue;
    }

    const tagEnd = findTagEnd(source, blockStart);

    if (tagEnd === -1) {
      throw createCompileError(`Unclosed SFC block near: ${source.slice(blockStart, blockStart + 20)}`, source, blockStart, filename);
    }

    const openTag = source.slice(blockStart, tagEnd + 1);
    const tagMatch = /^<([a-zA-Z][\w-]*)\b([^>]*)>/.exec(openTag);

    if (!tagMatch) {
      cursor = tagEnd + 1;
      continue;
    }

    const [, rawName, attrs] = tagMatch;
    const name = rawName.toLowerCase();

    if (!supportedBlocks.has(name)) {
      throw createCompileError(`Unsupported SFC block <${rawName}>`, source, blockStart, filename);
    }

    if (seen.has(name)) {
      throw createCompileError(`Duplicate SFC block <${rawName}>`, source, blockStart, filename);
    }

    const contentStart = tagEnd + 1;
    const blockEnd = findBlockEnd(source, name, contentStart, filename);
    const content = source.slice(contentStart, blockEnd.openStart);
    seen.add(name);
    const leadingWhitespaceLength = content.length - content.trimStart().length;
    const trimmedContent = content.trim();
    const trimmedContentStart = contentStart + leadingWhitespaceLength;
    descriptor[name as keyof Pick<SfcDescriptor, "template" | "script" | "style">] = trimmedContent;
    descriptor[`${name}Offset` as keyof Pick<SfcDescriptor, "templateOffset" | "scriptOffset" | "styleOffset">] =
      trimmedContentStart;

    if (name === "style") {
      descriptor.styleScoped = hasBooleanAttr(attrs, "scoped");
    }

    cursor = blockEnd.closeEnd;
  }

  if (!descriptor.template) {
    throw createCompileError("Missing required <template> block", source, 0, filename);
  }

  return descriptor as SfcDescriptor;
}

function hasBooleanAttr(source: string, name: string): boolean {
  const pattern = new RegExp(`(?:^|\\s)${name}(?:\\s|=|$)`);
  return pattern.test(source);
}

function findTagEnd(source: string, tagStart: number): number {
  let quote: "\"" | "'" | undefined;

  for (let index = tagStart + 1; index < source.length; index += 1) {
    const char = source[index];

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

function findBlockEnd(
  source: string,
  name: string,
  contentStart: number,
  filename: string | undefined
): { openStart: number; closeEnd: number } {
  if (name !== "template") {
    const closeTag = `</${name}>`;
    const closeStart = source.toLowerCase().indexOf(closeTag, contentStart);

    if (closeStart === -1) {
      throw createCompileError(`Unclosed SFC block <${name}>`, source, contentStart, filename);
    }

    return {
      openStart: closeStart,
      closeEnd: closeStart + closeTag.length
    };
  }

  const tagPattern = new RegExp(`<\\/?${name}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = contentStart;
  let depth = 1;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(source))) {
    if (match[0].startsWith("</")) {
      depth -= 1;

      if (depth === 0) {
        return {
          openStart: match.index,
          closeEnd: tagPattern.lastIndex
        };
      }
    } else if (!/\/\s*>$/.test(match[0])) {
      depth += 1;
    }
  }

  throw createCompileError(`Unclosed SFC block <${name}>`, source, contentStart, filename);
}
