import { analyzeTemplate } from "./analyzeTemplate.js";
import { emitCompatDirectiveDiagnostics } from "./compatDiagnostics.js";
import { generate } from "./generate.js";
import { generateHydration } from "./generateHydration.js";
import { parseSfc } from "./parseSfc.js";
import { parseTemplate } from "./parseTemplate.js";
import { createSourceMap } from "./sourceMap.js";
import { assertTemplateTypeCheck } from "./templateTypeCheck.js";
import type { CompileOptions, CompileResult } from "./types.js";
import { emitDebugDiagnostic } from "../runtime/devtools.js";

export function compileHydration(source: string, options: CompileOptions = {}): CompileResult {
  try {
    const descriptor = parseSfc(source, options.filename);
    const ast = parseTemplate(descriptor.template, {
      filename: options.filename,
      source,
      offset: descriptor.templateOffset
    });
    emitCompatDirectiveDiagnostics(ast, { debug: options.debug === true, filename: options.filename, phase: "compile-hydration" });
    const templateTypeCheck = options.templateTypeCheck === true ? assertTemplateTypeCheck(descriptor, ast) : undefined;
    const bindings = analyzeTemplate(ast, { source, filename: options.filename });
    const mountCode = generate(descriptor, ast, {
      debug: options.debug === true,
      batchedUpdates: options.batchedUpdates === true,
      externalStyles: options.externalStyles === true
    });
    const hydrationCode = generateHydration(descriptor, ast, { includeImports: false });
    const code = mountCode.replace("export default __mikuru_component;", `${hydrationCode}\nconst __mikuru_hydrationComponent = { ...__mikuru_component, hydrate };\nexport default __mikuru_hydrationComponent;`);
    const map = createSourceMap(code, descriptor, ast);

    return {
      code,
      map,
      descriptor,
      ast,
      bindings,
      templateTypeCheck
    };
  } catch (error) {
    emitDebugDiagnostic("compiler", "error", error instanceof Error ? error.message : String(error), {
      phase: "compile-hydration",
      filename: options.filename,
      error
    });
    throw error;
  }
}
