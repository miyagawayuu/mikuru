import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tempRoot = mkdtempSync(join(tmpdir(), "mikuru-create-smoke-"));
const node = process.execPath;
const rootPackageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

try {
  const cliPath = join(root, "dist", "cli.js");
  const versionOutput = runCli(cliPath, ["--version"], tempRoot);
  const rootHelpOutput = runCli(cliPath, ["--help"], tempRoot);
  const createHelpOutput = runCli(cliPath, ["create", "--help"], tempRoot);

  assert.equal(versionOutput.trim(), rootPackageJson.version);
  assert.match(rootHelpOutput, /mikuru create \[project-name\]/);
  assert.match(rootHelpOutput, /starter\|basic/);
  assert.match(createHelpOutput, /--template <name>/);
  assert.match(createHelpOutput, /starter, basic/);
  assert.match(createHelpOutput, /--force/);
  assert.match(createHelpOutput, /--yes/);

  runCli(cliPath, ["create", "hello-mikuru"], tempRoot);

  const appRoot = join(tempRoot, "hello-mikuru");
  const packageJson = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));
  const indexHtml = readFileSync(join(appRoot, "index.html"), "utf8");
  const appSource = readFileSync(join(appRoot, "src", "App.mikuru"), "utf8");
  const viteConfig = readFileSync(join(appRoot, "vite.config.ts"), "utf8");

  assert.equal(packageJson.name, "hello-mikuru");
  assert.equal(packageJson.dependencies.mikuru, `^${rootPackageJson.version}`);
  assert.match(indexHtml, /href="\/favicon\.svg"/);
  assert.equal(existsSync(join(appRoot, "public", "favicon.svg")), true);
  assert.match(appSource, /Mikuru is ready/);
  assert.match(appSource, /@click="increment"/);
  assert.match(viteConfig, /mikuru\/vite/);

  runCli(cliPath, ["create", "--template", "starter", "template-app"], tempRoot);
  assert.equal(existsSync(join(tempRoot, "template-app", "package.json")), true);

  runCli(cliPath, ["create", "basic-app", "--template=basic", "--yes"], tempRoot);
  const basicPackageJson = JSON.parse(readFileSync(join(tempRoot, "basic-app", "package.json"), "utf8"));
  const basicAppSource = readFileSync(join(tempRoot, "basic-app", "src", "App.mikuru"), "utf8");
  const basicMoodBadgeSource = readFileSync(join(tempRoot, "basic-app", "src", "MoodBadge.mikuru"), "utf8");
  assert.equal(basicPackageJson.name, "basic-app");
  assert.equal(basicPackageJson.dependencies.mikuru, `^${rootPackageJson.version}`);
  assert.match(basicAppSource, /Mikuru Counter/);
  assert.match(basicMoodBadgeSource, /defineProps/);

  const nonEmptyRoot = join(tempRoot, "non-empty");
  mkdirSync(nonEmptyRoot);
  writeFileSync(join(nonEmptyRoot, "README.md"), "not empty");
  assert.match(
    runCliError(cliPath, ["create", "non-empty"], tempRoot),
    /Cannot create a Mikuru app in a non-empty directory/
  );
  runCli(cliPath, ["create", "non-empty", "--force", "--yes"], tempRoot);
  assert.equal(existsSync(join(nonEmptyRoot, "package.json")), true);
  assert.equal(existsSync(join(nonEmptyRoot, "README.md")), true);

  assert.match(
    runCliError(cliPath, ["create", "--template", "unknown", "unknown-template"], tempRoot),
    /Unknown template: unknown/
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function runCli(cliPath, args, cwd) {
  return execFileSync(node, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function runCliError(cliPath, args, cwd) {
  try {
    runCli(cliPath, args, cwd);
  } catch (error) {
    return String(error.stderr);
  }

  throw new Error(`Expected CLI command to fail: ${args.join(" ")}`);
}
