import { getSourceLocation } from "./errors.js";
import type { ElementNode, SfcDescriptor, SourceMap, TemplateAttribute, TemplateNode, TextNode } from "./types.js";
import type { SourceLocation } from "./errors.js";

const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

type SourceMapCandidate = {
  needle: string;
} & SourceLocation;

type SourceMapSegment = {
  generatedColumn: number;
  sourceIndex: number;
  originalLine: number;
  originalColumn: number;
};

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
    const segments = createLineSegments(line, {
      templateLocation,
      scriptLocation,
      styleLocation,
      scriptLineCandidates,
      styleLineCandidates,
      templateCandidates
    });
    let previousGeneratedColumn = 0;
    const encodedLine: number[][] = [];

    for (const segment of segments) {
      encodedLine.push([
        segment.generatedColumn - previousGeneratedColumn,
        segment.sourceIndex - previousSourceIndex,
        segment.originalLine - previousSourceLine,
        segment.originalColumn - previousSourceColumn
      ]);
      previousGeneratedColumn = segment.generatedColumn;
      previousSourceIndex = segment.sourceIndex;
      previousSourceLine = segment.originalLine;
      previousSourceColumn = segment.originalColumn;
    }

    mappings.push(encodedLine);
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

function createLineSegments(
  generatedLine: string,
  context: {
    templateLocation: ReturnType<typeof getSourceLocation>;
    scriptLocation: ReturnType<typeof getSourceLocation>;
    styleLocation: ReturnType<typeof getSourceLocation>;
    scriptLineCandidates: SourceMapCandidate[];
    styleLineCandidates: SourceMapCandidate[];
    templateCandidates: SourceMapCandidate[];
  }
): SourceMapSegment[] {
  const segments: SourceMapSegment[] = [];

  for (const candidate of [
    ...context.scriptLineCandidates,
    ...context.styleLineCandidates,
    ...context.templateCandidates
  ]) {
    for (const column of findNeedleColumns(generatedLine, candidate.needle)) {
      segments.push({
        generatedColumn: column,
        sourceIndex: 0,
        originalLine: candidate.line - 1,
        originalColumn: candidate.column - 1
      });
    }
  }

  if (segments.length > 0) {
    return dedupeSegments(segments).sort((left, right) => left.generatedColumn - right.generatedColumn);
  }

  const generatedColumn = Math.max(0, generatedLine.length - generatedLine.trimStart().length);
  const original = pickOriginalLocation(generatedLine, context);
  return [
    {
      generatedColumn,
      sourceIndex: 0,
      originalLine: original.line - 1,
      originalColumn: original.column - 1
    }
  ];
}

function findNeedleColumns(line: string, needle: string): number[] {
  const columns: number[] = [];
  let cursor = 0;

  while (cursor < line.length) {
    const index = line.indexOf(needle, cursor);
    if (index === -1) {
      break;
    }

    columns.push(index);
    cursor = index + Math.max(1, needle.length);
  }

  return columns;
}

function dedupeSegments(segments: SourceMapSegment[]): SourceMapSegment[] {
  const seen = new Set<string>();
  const result: SourceMapSegment[] = [];

  for (const segment of segments) {
    const key = `${segment.generatedColumn}:${segment.sourceIndex}:${segment.originalLine}:${segment.originalColumn}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(segment);
  }

  return result;
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
  const normalizeBindName = (rawName: string): string | undefined => {
    const [bindingName, ...modifiers] = rawName.split(".");
    if (!bindingName) {
      return undefined;
    }

    return modifiers.includes("camel") ? bindingName.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase()) : bindingName;
  };

  if (name.startsWith(":")) {
    return name.startsWith(":[") ? undefined : normalizeBindName(name.slice(1));
  }

  if (name.startsWith("v-bind:")) {
    const rawName = name.slice("v-bind:".length);
    return rawName.startsWith("[") ? undefined : normalizeBindName(rawName);
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
