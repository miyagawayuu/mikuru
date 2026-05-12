import { analyzeTemplate } from "./analyzeTemplate.js";
import { generateSsr } from "./generateSsr.js";
import { parseSfc } from "./parseSfc.js";
import { parseTemplate } from "./parseTemplate.js";
import type { CompileOptions, SsrCompileResult } from "./types.js";

export function compileSsr(source: string, options: CompileOptions = {}): SsrCompileResult {
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
}
