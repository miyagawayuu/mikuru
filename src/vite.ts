import type { Plugin } from "vite";

import { compile, MikuruCompileError } from "./compiler/index.js";

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
        result = compile(source, { filename: id });
      } catch (error) {
        if (error instanceof MikuruCompileError) {
          this.error({
            message: error.message,
            id,
            loc: {
              line: error.line,
              column: error.column
            },
            frame: error.frame
          });
        }

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

function toGeneratedSourceUrl(id: string): string {
  return `${id.replace(/\\/g, "/")}?mikuru-generated`;
}
