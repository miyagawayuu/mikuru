import type { SourceLocation } from "./errors.js";

export type SfcDescriptor = {
  filename?: string;
  source?: string;
  template: string;
  templateOffset?: number;
  script?: string;
  scriptOffset?: number;
  style?: string;
  styleOffset?: number;
  styleScoped?: boolean;
};

export type TemplateNode = ElementNode | TextNode;

export type ElementNode = {
  type: "element";
  tag: string;
  attrs: TemplateAttribute[];
  children: TemplateNode[];
  loc?: SourceLocation;
};

export type TextNode = {
  type: "text";
  parts: TextPart[];
  loc?: SourceLocation;
};

export type TextPart =
  | { type: "static"; value: string }
  | { type: "expression"; value: string; loc?: SourceLocation };

export type TemplateAttribute = {
  name: string;
  value: string | true;
  loc?: SourceLocation;
  valueLoc?: SourceLocation;
};

export type Binding =
  | { type: "text"; expression: string }
  | { type: "event"; event: string; handler: string; modifiers?: string[] }
  | { type: "attribute"; name: string; expression: string }
  | { type: "model"; expression: string }
  | { type: "if"; expression: string }
  | { type: "else-if"; expression: string }
  | { type: "else" }
  | { type: "show"; expression: string }
  | { type: "for"; item: string; index?: string; source: string };

export type CompileOptions = {
  filename?: string;
  debug?: boolean;
  batchedUpdates?: boolean;
};

export type CompileResult = {
  code: string;
  map: SourceMap;
  descriptor: SfcDescriptor;
  ast: ElementNode;
  bindings: Binding[];
};

export type SsrCompileResult = {
  code: string;
  descriptor: SfcDescriptor;
  ast: ElementNode;
  bindings: Binding[];
};

export type SourceMap = {
  version: 3;
  file?: string;
  sources: string[];
  sourcesContent: string[];
  names: string[];
  mappings: string;
};
