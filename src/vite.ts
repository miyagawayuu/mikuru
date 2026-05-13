import type { Plugin } from "vite";

import { compile, compileHydration, compileSsr, createCodeFrame, getSourceLocation, MikuruCompileError } from "./compiler/index.js";

export type MikuruPluginOptions = {
  debug?: boolean;
  batchedUpdates?: boolean;
  include?: RegExp;
};

export function mikuru(options: MikuruPluginOptions = {}): Plugin {
  const include = options.include ?? /\.mikuru$/;

  return {
    name: "mikuru",
    transform(source, id) {
      const [filename, query = ""] = id.split("?", 2);
      if (!include.test(filename)) {
        return null;
      }

      let result: ReturnType<typeof compile> | ReturnType<typeof compileHydration> | ReturnType<typeof compileSsr>;

      try {
        const compileOptions = {
          filename,
          debug: options.debug === true,
          batchedUpdates: options.batchedUpdates === true
        };
        result = query === "hydrate"
          ? compileHydration(source, compileOptions)
          : query === "ssr"
            ? compileSsr(source, compileOptions)
            : compile(source, compileOptions);
      } catch (error) {
        this.error(formatViteTransformError(error, source, filename));
        throw error;
      }

      const code = options.debug ? `${result.code}\n//# sourceURL=${toGeneratedSourceUrl(id)}\n` : result.code;
      return "map" in result ? { code, map: result.map as any } : { code };
    }
  };
}

export default mikuru;

type ViteTransformError = {
  message: string;
  id: string;
  loc: {
    line: number;
    column: number;
  };
  frame?: string;
};

function formatViteTransformError(error: unknown, source: string, id: string): ViteTransformError {
  if (error instanceof MikuruCompileError) {
    return {
      message: error.message,
      id,
      loc: {
        line: error.line,
        column: error.column
      },
      frame: error.frame
    };
  }

  const location = getSourceLocation(source, 0, id);
  return {
    message: error instanceof Error ? error.message : String(error),
    id,
    loc: {
      line: location.line,
      column: location.column
    },
    frame: createCodeFrame(source, location)
  };
}

function toGeneratedSourceUrl(id: string): string {
  return `${id.replace(/\\/g, "/")}?mikuru-generated`;
}
