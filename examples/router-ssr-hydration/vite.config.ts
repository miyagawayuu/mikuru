import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

import { mikuru } from "../../src/vite.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

export default defineConfig({
  root: resolve(__dirname, "src"),
  plugins: [mikuru()],
  resolve: {
    alias: [
      { find: "mikuru/server", replacement: resolve(repoRoot, "src/server.ts") },
      { find: "mikuru/router", replacement: resolve(repoRoot, "src/router/index.ts") },
      { find: "mikuru/runtime", replacement: resolve(repoRoot, "src/runtime/index.ts") },
      { find: "mikuru", replacement: resolve(repoRoot, "src/index.ts") }
    ]
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true
  }
});
