import { analyzeTemplate } from "./analyzeTemplate.js";
import { emitCompatDirectiveDiagnostics } from "./compatDiagnostics.js";
import { generate } from "./generate.js";
import { parseSfc } from "./parseSfc.js";
import { parseTemplate } from "./parseTemplate.js";
import { createSourceMap } from "./sourceMap.js";
import type { CompileOptions, CompileResult } from "./types.js";
import { emitDebugDiagnostic } from "../runtime/devtools.js";

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  try {
    const descriptor = parseSfc(source, options.filename);
    const ast = parseTemplate(descriptor.template, {
      filename: options.filename,
      source,
      offset: descriptor.templateOffset
    });
    emitCompatDirectiveDiagnostics(ast, { debug: options.debug === true, filename: options.filename, phase: "compile" });
    const bindings = analyzeTemplate(ast, { source, filename: options.filename });
    const code = generate(descriptor, ast, { debug: options.debug === true, batchedUpdates: options.batchedUpdates === true });
    const map = createSourceMap(code, descriptor, ast);

    return {
      code,
      map,
      descriptor,
      ast,
      bindings
    };
  } catch (error) {
    emitDebugDiagnostic("compiler", "error", error instanceof Error ? error.message : String(error), {
      phase: "compile",
      filename: options.filename,
      error
    });
    throw error;
  }
}
