import type { SfcDescriptor } from "./types.js";
import { createCodeFrame, getSourceLocation } from "./errors.js";
import { scopeCssAst } from "./cssAst.js";

export type CssCompileDiagnostic = {
  level: "warning";
  message: string;
  offset?: number;
  line?: number;
  column?: number;
  frame?: string;
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

export function compileStyle(css: string, options: CssCompileOptions = {}): CssCompileResult {
  const diagnostics: CssCompileDiagnostic[] = [];
  const trimmed = css.trim();
  const scoped = options.scoped === true && !!options.scopeAttr;
  if (!scoped) return { code: trimmed, scoped: false, diagnostics };

  let code = trimmed;
  try {
    code = scopeCssAst(trimmed, options.scopeAttr!);
  } catch (error) {
    const syntax = error && typeof error === "object" ? error as { line?: number; column?: number; reason?: string } : {};
    const lines = trimmed.split("\n");
    const line = Math.max(1, syntax.line ?? 1);
    const column = Math.max(1, syntax.column ?? 1);
    const parsedOffset = lines.slice(0, line - 1).reduce((total, part) => total + part.length + 1, 0) + column - 1;
    const offset = syntax.reason === "Unclosed block" ? findUnclosedBrace(trimmed) : parsedOffset;
    const location = getSourceLocation(trimmed, offset);
    diagnostics.push({
      level: "warning",
      message: syntax.reason === "Unclosed block"
        ? "Could not scope a CSS rule because its block is missing a closing brace."
        : `Could not scope CSS: ${syntax.reason ?? (error instanceof Error ? error.message : String(error))}`,
      offset,
      line: location.line,
      column: location.column,
      frame: createCodeFrame(trimmed, location)
    });
  }
  return { code, scoped: true, scopeAttr: options.scopeAttr, diagnostics };
}

export function compileDescriptorStyle(descriptor: SfcDescriptor, scopeAttr?: string): CssCompileResult {
  return compileStyle(descriptor.style ?? "", {
    filename: descriptor.filename,
    scoped: descriptor.styleScoped === true,
    scopeAttr
  });
}

function findUnclosedBrace(css: string): number {
  const stack: number[] = [];
  let quote: string | undefined;
  let comment = false;
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    const next = css[index + 1];
    if (comment) {
      if (char === "*" && next === "/") { comment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (char === "\\") { index += 1; continue; }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === "/" && next === "*") { comment = true; index += 1; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "{") stack.push(index);
    if (char === "}") stack.pop();
  }
  return stack.at(-1) ?? 0;
}
