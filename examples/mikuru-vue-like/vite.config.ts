import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, "src"),
  server: { port: 5175 },
  build: { outDir: path.resolve(__dirname, "dist"), emptyOutDir: true },
  resolve: {
    alias: {
      "@mikuru-src": path.resolve(__dirname, "..", "..", "src")
    }
  }
});
