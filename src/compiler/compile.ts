import { analyzeTemplate } from "./analyzeTemplate.js";
import { emitCompatDirectiveDiagnostics } from "./compatDiagnostics.js";
import { compileDescriptorStyle } from "./css.js";
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
    if (options.debug === true && descriptor.style?.trim()) {
      const styleResult = compileDescriptorStyle(descriptor, descriptor.styleScoped ? `data-mikuru-scope-preview` : undefined);
      for (const diagnostic of styleResult.diagnostics) {
        emitDebugDiagnostic("compiler", diagnostic.level, diagnostic.message, {
          phase: "style",
          filename: options.filename,
          offset: diagnostic.offset,
          line: diagnostic.line,
          column: diagnostic.column,
          frame: diagnostic.frame
        });
      }
    }
    const bindings = analyzeTemplate(ast, { source, filename: options.filename });
    const code = generate(descriptor, ast, {
      debug: options.debug === true,
      batchedUpdates: options.batchedUpdates === true,
      externalStyles: options.externalStyles === true
    });
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
