import { createCompileError } from "./errors.js";
import type { SfcDescriptor } from "./types.js";

const supportedBlocks = new Set(["template", "script", "style"]);

export function parseSfc(source: string, filename?: string): SfcDescriptor {
  const descriptor: Partial<SfcDescriptor> = { filename, source };
  const seen = new Set<string>();
  const blockPattern = /<([a-zA-Z][\w-]*)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(source))) {
    const [, rawName, attrs, content] = match;
    const name = rawName.toLowerCase();

    if (!supportedBlocks.has(name)) {
      throw createCompileError(`Unsupported SFC block <${rawName}>`, source, match.index, filename);
    }

    if (seen.has(name)) {
      throw createCompileError(`Duplicate SFC block <${rawName}>`, source, match.index, filename);
    }

    seen.add(name);
    const contentStart = match.index + match[0].indexOf(">") + 1;
    const leadingWhitespaceLength = content.length - content.trimStart().length;
    const trimmedContent = content.trim();
    const trimmedContentStart = contentStart + leadingWhitespaceLength;
    descriptor[name as keyof Pick<SfcDescriptor, "template" | "script" | "style">] = trimmedContent;
    descriptor[`${name}Offset` as keyof Pick<SfcDescriptor, "templateOffset" | "scriptOffset" | "styleOffset">] =
      trimmedContentStart;

    if (name === "style") {
      descriptor.styleScoped = hasBooleanAttr(attrs, "scoped");
    }
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
