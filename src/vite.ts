import type { Plugin } from "vite";

import { compile, createCodeFrame, getSourceLocation, MikuruCompileError } from "./compiler/index.js";

export type MikuruPluginOptions = {
  debug?: boolean;
  include?: RegExp;
};

export function mikuru(options: MikuruPluginOptions = {}): Plugin {
  const include = options.include ?? /\.mikuru$/;

  return {
    name: "mikuru",
    transform(source, id) {
      if (!include.test(id)) {
        return null;
      }

      let result: ReturnType<typeof compile>;

      try {
        result = compile(source, { filename: id, debug: options.debug === true });
      } catch (error) {
        this.error(formatViteTransformError(error, source, id));
        throw error;
      }

      return {
        code: options.debug ? `${result.code}\n//# sourceURL=${toGeneratedSourceUrl(id)}\n` : result.code,
        map: result.map
      };
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
