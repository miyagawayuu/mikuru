import { analyzeTemplate } from "./analyzeTemplate.js";
import { generate } from "./generate.js";
import { parseSfc } from "./parseSfc.js";
import { parseTemplate } from "./parseTemplate.js";
import { createSourceMap } from "./sourceMap.js";
import type { CompileOptions, CompileResult } from "./types.js";

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const descriptor = parseSfc(source, options.filename);
  const ast = parseTemplate(descriptor.template, {
    filename: options.filename,
    source,
    offset: descriptor.templateOffset
  });
  const bindings = analyzeTemplate(ast, { source, filename: options.filename });
  const code = generate(descriptor, ast);
  const map = createSourceMap(code, descriptor, ast);

  return {
    code,
    map,
    descriptor,
    ast,
    bindings
  };
}
