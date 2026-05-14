import * as ts from "typescript";

import { createCompileError, getSourceLocation, type SourceLocation } from "./errors.js";
import { compileTemplateExpression, parseForExpression, validateTemplateExpression } from "./parseExpression.js";
import { parseSfc } from "./parseSfc.js";
import { parseTemplate } from "./parseTemplate.js";
import type { ElementNode, SfcDescriptor, TemplateAttribute, TemplateNode } from "./types.js";

export type TemplateTypeCheckDiagnostic = {
  message: string;
  line: number;
  column: number;
  offset: number;
  filename?: string;
  code?: number;
};

export type TemplateTypeCheckResult = {
  ok: boolean;
  diagnostics: TemplateTypeCheckDiagnostic[];
  code: string;
};

type TemplateCheckExpression = {
  expression: string;
  usage: string;
  location?: SourceLocation;
  scopes: ForScope[];
  statement?: boolean;
};

type ForScope = {
  item: string;
  index?: string;
  source: string;
  location?: SourceLocation;
};

type EmittedLine = {
  text: string;
  location?: SourceLocation;
};

export function typeCheckTemplate(source: string, options: { filename?: string } = {}): TemplateTypeCheckResult {
  const descriptor = parseSfc(source, options.filename);
  const ast = parseTemplate(descriptor.template, {
    filename: options.filename,
    source,
    offset: descriptor.templateOffset
  });

  return typeCheckTemplateDescriptor(descriptor, ast);
}

export function typeCheckTemplateDescriptor(descriptor: SfcDescriptor, ast: ElementNode): TemplateTypeCheckResult {
  const source = descriptor.source ?? "";
  const filename = descriptor.filename ?? "anonymous.mikuru";
  const expressions = collectTemplateCheckExpressions(ast, source, filename);
  const emitted = generateTypeCheckLines(descriptor, expressions);
  const code = emitted.map((line) => line.text).join("\n");
  const diagnostics = runTypeScriptCheck(code, filename, emitted);

  return {
    ok: diagnostics.length === 0,
    diagnostics,
    code
  };
}

export function assertTemplateTypeCheck(descriptor: SfcDescriptor, ast: ElementNode): TemplateTypeCheckResult {
  const result = typeCheckTemplateDescriptor(descriptor, ast);

  if (!result.ok) {
    const diagnostic = result.diagnostics[0]!;
    throw createCompileError(
      `Template type check failed: ${diagnostic.message}`,
      descriptor.source ?? "",
      diagnostic.offset,
      descriptor.filename
    );
  }

  return result;
}

function collectTemplateCheckExpressions(root: ElementNode, source: string, filename: string): TemplateCheckExpression[] {
  const expressions: TemplateCheckExpression[] = [];
  visitNode(root, [], expressions, { source, filename }, false);
  return expressions;
}

function visitNode(
  node: TemplateNode,
  scopes: ForScope[],
  expressions: TemplateCheckExpression[],
  context: { source: string; filename: string },
  inPre: boolean
): void {
  if (node.type === "text") {
    if (inPre) {
      return;
    }

    for (const part of node.parts) {
      if (part.type === "expression") {
        expressions.push({ expression: part.value, usage: "interpolation", location: part.loc, scopes });
      }
    }
    return;
  }

  const pre = inPre || hasAttr(node, "v-pre");
  if (pre) {
    for (const child of node.children) {
      visitNode(child, scopes, expressions, context, true);
    }
    return;
  }

  let childScopes = scopes;

  for (const attr of node.attrs) {
    if (attr.name === "v-for" && attr.value !== true) {
      const parsed = parseForExpression(attr.value, toExpressionContext(attr.valueLoc, context));
      const scope = {
        item: parsed.item,
        index: parsed.index,
        source: parsed.source,
        location: attr.valueLoc
      };
      expressions.push({ expression: parsed.source, usage: "v-for source", location: attr.valueLoc, scopes });
      childScopes = [...scopes, scope];
      continue;
    }

    collectAttributeExpression(attr, expressions, childScopes, context);
  }

  for (const child of node.children) {
    visitNode(child, childScopes, expressions, context, false);
  }
}

function collectAttributeExpression(
  attr: TemplateAttribute,
  expressions: TemplateCheckExpression[],
  scopes: ForScope[],
  context: { source: string; filename: string }
): void {
  const dynamicBinding = getDynamicBindingArgument(attr.name);
  if (dynamicBinding) {
    expressions.push({ expression: dynamicBinding.expression, usage: attr.name, location: attr.loc, scopes });
  }

  const dynamicEvent = getDynamicEventArgument(attr.name);
  if (dynamicEvent) {
    expressions.push({ expression: dynamicEvent.expression, usage: attr.name, location: attr.loc, scopes });
  }

  if (isExpressionAttribute(attr.name) && attr.value !== true) {
    expressions.push({ expression: attr.value, usage: attr.name, location: attr.valueLoc, scopes });
    return;
  }

  if (isEventAttribute(attr.name) && attr.value !== true) {
    const handler = attr.value.trim().replace(/;\s*$/, "");
    expressions.push({ expression: handler, usage: attr.name, location: attr.valueLoc, scopes, statement: !canParseExpression(handler, attr.valueLoc, context) });
  }
}

function generateTypeCheckLines(descriptor: SfcDescriptor, expressions: TemplateCheckExpression[]): EmittedLine[] {
  const lines: EmittedLine[] = [
    { text: `type __MikuruRefValue<T> = T extends { value: infer V } ? V : T;` },
    { text: `declare const __mikuru_template_target: Element;` },
    { text: `declare function unwrap<T>(value: T): __MikuruRefValue<T>;` },
    { text: `declare function __mikuru_unwrap<T>(value: T): __MikuruRefValue<T>;` },
    { text: `declare function __mikuru_for_entries<T>(source: T): Array<[number, __MikuruIterableItem<__MikuruRefValue<T>>]>;` },
    { text: `type __MikuruIterableItem<T> = T extends readonly (infer U)[] ? U : T extends Iterable<infer U> ? U : T extends Record<string, infer V> ? V : never;` },
    { text: `type __MikuruInferProp<T> = T extends StringConstructor ? string : T extends NumberConstructor ? number : T extends BooleanConstructor ? boolean : unknown;` },
    { text: `declare function defineProps<T extends Record<string, unknown> = Record<string, unknown>>(): T;` },
    { text: `declare function defineProps<const T extends Record<string, unknown>>(props: T): { [K in keyof T]: __MikuruInferProp<T[K]> };` },
    { text: `declare function defineEmits<T extends Record<string, unknown> = Record<string, unknown>>(...args: unknown[]): (name: keyof T | string, ...payload: unknown[]) => void;` },
    { text: `declare function defineOptions(options: Record<string, unknown>): void;` },
    { text: `declare function useAttrs(): Record<string, unknown>;` },
    { text: "" }
  ];

  if (descriptor.script?.trim()) {
    lines.push(...descriptor.script.split(/\r?\n/).map((text) => ({ text })));
    lines.push({ text: "" });
  }

  lines.push({ text: "function __mikuru_template_type_check() {" });
  lines.push({ text: "  void __mikuru_template_target;" });

  for (const expression of expressions) {
    emitExpressionCheck(lines, expression, 1);
  }

  lines.push({ text: "}" });
  return lines;
}

function emitExpressionCheck(lines: EmittedLine[], expression: TemplateCheckExpression, indent: number): void {
  let depth = indent;

  for (const scope of expression.scopes) {
    const sourceExpression = compileTemplateExpression(scope.source, "v-for source", toExpressionContextFromLocation(scope.location));
    lines.push({ text: `${"  ".repeat(depth)}for (const [__mikuru_index, __mikuru_item] of __mikuru_for_entries(${sourceExpression})) {`, location: scope.location });
    depth += 1;
    lines.push({ text: `${"  ".repeat(depth)}const ${scope.item} = __mikuru_item;`, location: scope.location });
    if (scope.index) {
      lines.push({ text: `${"  ".repeat(depth)}const ${scope.index} = __mikuru_index;`, location: scope.location });
    }
  }

  const indentText = "  ".repeat(depth);

  if (expression.statement) {
    lines.push({ text: `${indentText}(() => { ${expression.expression}; });`, location: expression.location });
  } else {
    const compiled = compileTemplateExpression(expression.expression, expression.usage, toExpressionContextFromLocation(expression.location));
    lines.push({ text: `${indentText}void (${compiled});`, location: expression.location });
  }

  for (let index = expression.scopes.length - 1; index >= 0; index -= 1) {
    depth -= 1;
    lines.push({ text: `${"  ".repeat(depth)}}`, location: expression.scopes[index]?.location });
  }
}

function runTypeScriptCheck(code: string, filename: string, emitted: EmittedLine[]): TemplateTypeCheckDiagnostic[] {
  const fileName = `${filename}.template-check.ts`;
  const compilerOptions: ts.CompilerOptions = {
    allowJs: false,
    checkJs: false,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: []
  };
  const defaultHost = ts.createCompilerHost(compilerOptions, true);
  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile) {
      if (normalizePath(name) === normalizePath(fileName)) {
        return ts.createSourceFile(fileName, code, languageVersion, true, ts.ScriptKind.TS);
      }
      return defaultHost.getSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile);
    },
    fileExists(name) {
      return normalizePath(name) === normalizePath(fileName) || defaultHost.fileExists(name);
    },
    readFile(name) {
      return normalizePath(name) === normalizePath(fileName) ? code : defaultHost.readFile(name);
    },
    writeFile() {}
  };
  const program = ts.createProgram([fileName], compilerOptions, host);
  const sourceFile = program.getSourceFile(fileName);
  const diagnostics = ts.getPreEmitDiagnostics(program, sourceFile);

  return diagnostics
    .filter((diagnostic) => diagnostic.file && diagnostic.start !== undefined)
    .map((diagnostic) => {
      const location = diagnostic.file!.getLineAndCharacterOfPosition(diagnostic.start!);
      const original = emitted[location.line]?.location;
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      const fallback = original ?? getSourceLocation(diagnostic.file!.text, diagnostic.start!, filename);
      return {
        message,
        line: fallback.line,
        column: fallback.column,
        offset: fallback.offset,
        filename: fallback.filename ?? filename,
        code: typeof diagnostic.code === "number" ? diagnostic.code : undefined
      };
    });
}

function isExpressionAttribute(name: string): boolean {
  return name === "v-if" ||
    name === "v-else-if" ||
    name === "v-show" ||
    name === "v-html" ||
    name === "v-text" ||
    name === "v-model" ||
    getBindingName(name) !== undefined;
}

function isEventAttribute(name: string): boolean {
  return name.startsWith("@") || name.startsWith("v-on:");
}

function hasAttr(node: ElementNode, name: string): boolean {
  return node.attrs.some((attr) => attr.name === name);
}

function getBindingName(name: string): string | undefined {
  if (getDynamicBindingArgument(name)) {
    return "dynamic";
  }

  const rawName = name.startsWith(":")
    ? name.slice(1)
    : name.startsWith("v-bind:")
      ? name.slice("v-bind:".length)
      : undefined;

  return rawName ? rawName.split(".")[0] : undefined;
}

function getDynamicBindingArgument(name: string): { expression: string } | undefined {
  const dynamic = parseDynamicArgument(name, [":", "v-bind:"]);
  return dynamic ? { expression: dynamic.expression } : undefined;
}

function getDynamicEventArgument(name: string): { expression: string } | undefined {
  const dynamic = parseDynamicArgument(name, ["@", "v-on:"]);
  return dynamic ? { expression: dynamic.expression } : undefined;
}

function parseDynamicArgument(name: string, prefixes: string[]): { expression: string } | undefined {
  for (const prefix of prefixes) {
    if (!name.startsWith(`${prefix}[`)) {
      continue;
    }

    const argumentStart = prefix.length + 1;
    const argumentEnd = name.indexOf("]", argumentStart);
    if (argumentEnd === -1) {
      return undefined;
    }

    const expression = name.slice(argumentStart, argumentEnd).trim();
    if (expression) {
      return { expression };
    }
  }

  return undefined;
}

function canParseExpression(expression: string, location: SourceLocation | undefined, context: { source: string; filename: string }): boolean {
  try {
    validateTemplateExpression(expression, "event handler", location ? { source: context.source, offset: location.offset, filename: context.filename } : undefined);
    return true;
  } catch {
    return false;
  }
}

function toExpressionContext(
  location: SourceLocation | undefined,
  context: { source: string; filename: string }
): { source: string; offset: number; filename?: string } | undefined {
  return location ? { source: context.source, offset: location.offset, filename: context.filename } : undefined;
}

function toExpressionContextFromLocation(location: SourceLocation | undefined): { source: string; offset: number; filename?: string } | undefined {
  return location ? { source: "", offset: 0, filename: location.filename } : undefined;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
