import { analyzeTemplate } from "./analyzeTemplate.js";
import { emitCompatDirectiveDiagnostics } from "./compatDiagnostics.js";
import { generateSsr } from "./generateSsr.js";
import { parseSfc } from "./parseSfc.js";
import { parseTemplate } from "./parseTemplate.js";
import { assertTemplateTypeCheck } from "./templateTypeCheck.js";
import type { CompileOptions, SsrCompileResult } from "./types.js";
import { emitDebugDiagnostic } from "../runtime/devtools.js";

export function compileSsr(source: string, options: CompileOptions = {}): SsrCompileResult {
  try {
    const descriptor = parseSfc(source, options.filename);
    const ast = parseTemplate(descriptor.template, {
      filename: options.filename,
      source,
      offset: descriptor.templateOffset
    });
    emitCompatDirectiveDiagnostics(ast, { debug: options.debug === true, filename: options.filename, phase: "compile-ssr" });
    const templateTypeCheck = options.templateTypeCheck === true ? assertTemplateTypeCheck(descriptor, ast) : undefined;
    const bindings = analyzeTemplate(ast, { source, filename: options.filename });
    const code = generateSsr(descriptor, ast);

    return {
      code,
      descriptor,
      ast,
      bindings,
      templateTypeCheck
    };
  } catch (error) {
    emitDebugDiagnostic("compiler", "error", error instanceof Error ? error.message : String(error), {
      phase: "compile-ssr",
      filename: options.filename,
      error
    });
    throw error;
  }
}
