import { analyzeTemplate } from "./analyzeTemplate.js";
import { generate } from "./generate.js";
import { generateHydration } from "./generateHydration.js";
import { parseSfc } from "./parseSfc.js";
import { parseTemplate } from "./parseTemplate.js";
import { createSourceMap } from "./sourceMap.js";
import type { CompileOptions, CompileResult } from "./types.js";

export function compileHydration(source: string, options: CompileOptions = {}): CompileResult {
  const descriptor = parseSfc(source, options.filename);
  const ast = parseTemplate(descriptor.template, {
    filename: options.filename,
    source,
    offset: descriptor.templateOffset
  });
  const bindings = analyzeTemplate(ast, { source, filename: options.filename });
  const mountCode = generate(descriptor, ast, { debug: options.debug === true, batchedUpdates: options.batchedUpdates === true });
  const hydrationCode = generateHydration(descriptor, ast, { includeImports: false });
  const code = mountCode.replace("export default __mikuru_component;", `${hydrationCode}\nconst __mikuru_hydrationComponent = { ...__mikuru_component, hydrate };\nexport default __mikuru_hydrationComponent;`);
  const map = createSourceMap(code, descriptor, ast);

  return {
    code,
    map,
    descriptor,
    ast,
    bindings
  };
}
