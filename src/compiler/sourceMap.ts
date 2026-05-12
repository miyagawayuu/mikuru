import { getSourceLocation } from "./errors.js";
import type { ElementNode, SfcDescriptor, SourceMap, TemplateAttribute, TemplateNode, TextNode } from "./types.js";
import type { SourceLocation } from "./errors.js";

const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

type SourceMapCandidate = {
  needle: string;
} & SourceLocation;

export function createSourceMap(code: string, descriptor: SfcDescriptor, root?: ElementNode): SourceMap {
  const source = descriptor.source ?? "";
  const filename = descriptor.filename ?? "anonymous.mikuru";
  const templateLocation = getSourceLocation(source, descriptor.templateOffset ?? 0, filename);
  const scriptLocation = descriptor.scriptOffset === undefined ? templateLocation : getSourceLocation(source, descriptor.scriptOffset, filename);
  const styleLocation = descriptor.styleOffset === undefined ? templateLocation : getSourceLocation(source, descriptor.styleOffset, filename);
  const scriptLineCandidates = createBlockLineCandidates(source, descriptor.script ?? "", descriptor.scriptOffset ?? 0, filename);
  const styleLineCandidates = createBlockLineCandidates(source, descriptor.style ?? "", descriptor.styleOffset ?? 0, filename);
  const templateCandidates = root ? createTemplateCandidates(root) : [];
  const generatedLines = code.split("\n");
  const mappings: number[][][] = [];
  let previousSourceIndex = 0;
  let previousSourceLine = 0;
  let previousSourceColumn = 0;

  for (const line of generatedLines) {
    const original = pickOriginalLocation(line, {
      templateLocation,
      scriptLocation,
      styleLocation,
      scriptLineCandidates,
      styleLineCandidates,
      templateCandidates
    });
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
  context: {
    templateLocation: ReturnType<typeof getSourceLocation>;
    scriptLocation: ReturnType<typeof getSourceLocation>;
    styleLocation: ReturnType<typeof getSourceLocation>;
    scriptLineCandidates: SourceMapCandidate[];
    styleLineCandidates: SourceMapCandidate[];
    templateCandidates: SourceMapCandidate[];
  }
): ReturnType<typeof getSourceLocation> {
  const trimmedLine = generatedLine.trim();
  const scriptCandidate = context.scriptLineCandidates.find((candidate) => candidate.needle === trimmedLine);

  if (scriptCandidate) {
    return scriptCandidate;
  }

  const styleCandidate = context.styleLineCandidates.find((candidate) => generatedLine.includes(candidate.needle));

  if (styleCandidate) {
    return styleCandidate;
  }

  const templateCandidate = context.templateCandidates.find((candidate) => generatedLine.includes(candidate.needle));

  if (templateCandidate) {
    return templateCandidate;
  }

  if (generatedLine.includes("style.") || generatedLine.includes("data-mikuru-style")) {
    return context.styleLocation;
  }

  if (
    generatedLine.includes("__mikuru_emit") ||
    generatedLine.includes("const ") ||
    generatedLine.includes("function ") ||
    generatedLine.includes("return ")
  ) {
    return context.scriptLocation;
  }

  return context.templateLocation;
}

function createBlockLineCandidates(source: string, block: string, blockOffset: number, filename: string): SourceMapCandidate[] {
  const candidates: SourceMapCandidate[] = [];
  let localOffset = 0;

  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed) {
      const columnOffset = line.indexOf(trimmed);
      const location = getSourceLocation(source, blockOffset + localOffset + Math.max(0, columnOffset), filename);
      candidates.push({ needle: trimmed, ...location });
    }

    localOffset += line.length + 1;
  }

  return candidates;
}

function createTemplateCandidates(root: ElementNode): SourceMapCandidate[] {
  const candidates: SourceMapCandidate[] = [];
  collectTemplateCandidates(root, candidates);
  candidates.sort((left, right) => right.needle.length - left.needle.length);
  return candidates;
}

function collectTemplateCandidates(node: TemplateNode, candidates: SourceMapCandidate[]): void {
  if (node.type === "text") {
    collectTextCandidates(node, candidates);
    return;
  }

  addCandidate(candidates, `document.createElement(${quote(node.tag)})`, node.loc);
  addCandidate(candidates, `${node.tag}.mount`, node.loc);

  for (const attr of node.attrs) {
    collectAttributeCandidates(attr, candidates);
  }

  for (const child of node.children) {
    collectTemplateCandidates(child, candidates);
  }
}

function collectTextCandidates(node: TextNode, candidates: SourceMapCandidate[]): void {
  for (const part of node.parts) {
    if (part.type === "expression") {
      addCandidate(candidates, part.value, part.loc);
      continue;
    }

    const value = part.value.trim();

    if (value) {
      addCandidate(candidates, quote(value), node.loc);
    }
  }
}

function collectAttributeCandidates(attr: TemplateAttribute, candidates: SourceMapCandidate[]): void {
  if (attr.value !== true && attr.value.trim()) {
    addCandidate(candidates, attr.value.trim(), attr.valueLoc ?? attr.loc);
  }

  const name = normalizeAttributeName(attr.name);

  if (name) {
    addCandidate(candidates, quote(name), attr.loc);
  }
}

function addCandidate(candidates: SourceMapCandidate[], needle: string, location: SourceLocation | undefined): void {
  if (!location || !needle.trim() || needle.length < 2) {
    return;
  }

  candidates.push({ needle, ...location });
}

function normalizeAttributeName(name: string): string | undefined {
  if (name.startsWith(":")) {
    return name.slice(1);
  }

  if (name.startsWith("v-bind:")) {
    return name.slice("v-bind:".length);
  }

  return name.startsWith("v-") || name.startsWith("@") || name.startsWith("#") ? undefined : name;
}

function quote(value: string): string {
  return JSON.stringify(value);
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
