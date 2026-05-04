import { getSourceLocation } from "./errors.js";
import type { SfcDescriptor, SourceMap } from "./types.js";

const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function createSourceMap(code: string, descriptor: SfcDescriptor): SourceMap {
  const source = descriptor.source ?? "";
  const filename = descriptor.filename ?? "anonymous.mikuru";
  const templateLocation = getSourceLocation(source, descriptor.templateOffset ?? 0, filename);
  const scriptLocation = descriptor.scriptOffset === undefined ? templateLocation : getSourceLocation(source, descriptor.scriptOffset, filename);
  const styleLocation = descriptor.styleOffset === undefined ? templateLocation : getSourceLocation(source, descriptor.styleOffset, filename);
  const generatedLines = code.split("\n");
  const mappings: number[][][] = [];
  let previousSourceIndex = 0;
  let previousSourceLine = 0;
  let previousSourceColumn = 0;

  for (const line of generatedLines) {
    const original = pickOriginalLocation(line, templateLocation, scriptLocation, styleLocation);
    const generatedColumn = Math.max(0, line.length - line.trimStart().length);
    const sourceIndex = 0;
    const originalLine = original.line - 1;
    const originalColumn = original.column - 1;
    mappings.push([
      [
        generatedColumn,
        sourceIndex - previousSourceIndex,
        originalLine - previousSourceLine,
        originalColumn - previousSourceColumn
      ]
    ]);
    previousSourceIndex = sourceIndex;
    previousSourceLine = originalLine;
    previousSourceColumn = originalColumn;
  }

  return {
    version: 3,
    file: descriptor.filename ? `${descriptor.filename}.js` : undefined,
    sources: [filename],
    sourcesContent: [source],
    names: [],
    mappings: mappings.map((segments) => segments.map((segment) => segment.map(encodeVlq).join("")).join(",")).join(";")
  };
}

function pickOriginalLocation(
  generatedLine: string,
  templateLocation: ReturnType<typeof getSourceLocation>,
  scriptLocation: ReturnType<typeof getSourceLocation>,
  styleLocation: ReturnType<typeof getSourceLocation>
): ReturnType<typeof getSourceLocation> {
  if (generatedLine.includes("style.") || generatedLine.includes("data-mikuru-style")) {
    return styleLocation;
  }

  if (
    generatedLine.includes("__mikuru_emit") ||
    generatedLine.includes("const ") ||
    generatedLine.includes("function ") ||
    generatedLine.includes("return ")
  ) {
    return scriptLocation;
  }

  return templateLocation;
}

function encodeVlq(value: number): string {
  let vlq = value < 0 ? ((-value) << 1) + 1 : value << 1;
  let encoded = "";

  do {
    let digit = vlq & 31;
    vlq >>>= 5;

    if (vlq > 0) {
      digit |= 32;
    }

    encoded += base64Chars[digit];
  } while (vlq > 0);

  return encoded;
}
