import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tempRoot = mkdtempSync(join(tmpdir(), "mikuru-create-smoke-"));
const node = process.execPath;
const rootPackageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

try {
  const cliPath = join(root, "dist", "cli.js");
  execFileSync(node, [cliPath, "create", "hello-mikuru"], { cwd: tempRoot, stdio: "ignore" });

  const appRoot = join(tempRoot, "hello-mikuru");
  const packageJson = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));
  const appSource = readFileSync(join(appRoot, "src", "App.mikuru"), "utf8");
  const viteConfig = readFileSync(join(appRoot, "vite.config.ts"), "utf8");

  assert.equal(packageJson.name, "hello-mikuru");
  assert.equal(packageJson.dependencies.mikuru, `^${rootPackageJson.version}`);
  assert.match(appSource, /Mikuru is ready/);
  assert.match(appSource, /@click="increment"/);
  assert.match(viteConfig, /mikuru\/vite/);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
