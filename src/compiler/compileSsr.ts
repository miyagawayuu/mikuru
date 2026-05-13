import { analyzeTemplate } from "./analyzeTemplate.js";
import { generateSsr } from "./generateSsr.js";
import { parseSfc } from "./parseSfc.js";
import { parseTemplate } from "./parseTemplate.js";
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
    const bindings = analyzeTemplate(ast, { source, filename: options.filename });
    const code = generateSsr(descriptor, ast);

    return {
      code,
      descriptor,
      ast,
      bindings
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
