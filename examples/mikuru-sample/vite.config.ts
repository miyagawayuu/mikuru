import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, "src"),
  server: {
    port: 5174
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true
  },
  resolve: {
    alias: {
      // allow imports from the repo `src` during development
      "@mikuru-src": path.resolve(__dirname, "..", "..", "src")
    }
  }
});
