import type { Plugin } from "vite";

import {
  compile,
  compileDescriptorStyle,
  compileHydration,
  compileSsr,
  createCodeFrame,
  getSourceLocation,
  MikuruCompileError
} from "./compiler/index.js";
import { createScopeAttr } from "./compiler/generate.js";
import type { SfcDescriptor } from "./compiler/index.js";

export type MikuruPluginOptions = {
  debug?: boolean;
  batchedUpdates?: boolean;
  templateTypeCheck?: boolean;
  include?: RegExp;
};

export function mikuru(options: MikuruPluginOptions = {}): Plugin {
  const include = options.include ?? /\.mikuru$/;
  const styleModules = new Map<string, string>();

  return {
    name: "mikuru",
    resolveId(id) {
      if (isMikuruStyleRequest(id)) {
        return normalizeStyleRequest(id);
      }
      return null;
    },
    load(id) {
      if (!isMikuruStyleRequest(id)) {
        return null;
      }
      return styleModules.get(normalizeStyleRequest(id)) ?? null;
    },
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
          batchedUpdates: options.batchedUpdates === true,
          externalStyles: query !== "ssr",
          templateTypeCheck: options.templateTypeCheck === true
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

      const styleImport = createStyleImport(result.descriptor, filename, styleModules);
      const codeWithoutSourceUrl = `${styleImport}${result.code}`;
      const code = options.debug ? `${codeWithoutSourceUrl}\n//# sourceURL=${toGeneratedSourceUrl(id)}\n` : codeWithoutSourceUrl;
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

function createStyleImport(descriptor: SfcDescriptor, filename: string, styleModules: Map<string, string>): string {
  if (!descriptor.style?.trim()) {
    return "";
  }

  const scopeAttr = descriptor.styleScoped ? createScopeAttr(descriptor) : undefined;
  const styleResult = compileDescriptorStyle(descriptor, scopeAttr);
  const request = createStyleRequest(filename, descriptor, styleResult.code, scopeAttr);
  styleModules.set(request, styleResult.code);

  if (descriptor.styleModule) {
    const localName = descriptor.styleModule === true ? "$style" : descriptor.styleModule;
    if (!isIdentifier(localName)) {
      throw new Error(`<style module> name must be a valid JavaScript identifier, got ${JSON.stringify(localName)}.`);
    }
    return `import ${localName} from ${JSON.stringify(request)};\n`;
  }

  return `import ${JSON.stringify(request)};\n`;
}

function createStyleRequest(filename: string, descriptor: SfcDescriptor, code: string, scopeAttr: string | undefined): string {
  const lang = normalizeStyleLang(descriptor.styleLang);
  const moduleSuffix = descriptor.styleModule ? ".module" : "";
  const normalizedFilename = filename.replace(/\\/g, "/");
  const key = hashStyleRequest(`${normalizedFilename}\n${lang}\n${descriptor.styleModule ?? ""}\n${scopeAttr ?? ""}\n${code}`);
  return normalizeStyleRequest(`/@mikuru-style/${normalizedFilename}${moduleSuffix}.${lang}?mikuru-style=${key}`);
}

function normalizeStyleLang(lang: string | undefined): string {
  const normalized = (lang ?? "css").replace(/^\./, "").toLowerCase();
  return /^[a-z][\w-]*$/.test(normalized) ? normalized : "css";
}

function normalizeStyleRequest(id: string): string {
  return id.replace(/\\/g, "/");
}

function isMikuruStyleRequest(id: string): boolean {
  return normalizeStyleRequest(id).includes("?mikuru-style");
}

function isIdentifier(value: string): boolean {
  return /^[$A-Z_a-z][$\w]*$/.test(value);
}

function hashStyleRequest(value: string): string {
  let result = 5381;

  for (let index = 0; index < value.length; index += 1) {
    result = (result * 33) ^ value.charCodeAt(index);
  }

  return (result >>> 0).toString(36);
}
