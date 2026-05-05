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
  const rootTemplateListOutput = runCli(cliPath, ["--list-templates"], tempRoot);
  const createTemplateListOutput = runCli(cliPath, ["create", "--list-templates"], tempRoot);

  assert.equal(versionOutput.trim(), rootPackageJson.version);
  assert.match(rootHelpOutput, /mikuru create \[project-name\]/);
  assert.match(rootHelpOutput, /starter\|basic/);
  assert.match(rootHelpOutput, /--list-templates/);
  assert.match(createHelpOutput, /--template <name>/);
  assert.match(createHelpOutput, /-t, --template <name>/);
  assert.match(createHelpOutput, /starter, basic/);
  assert.match(createHelpOutput, /--list-templates/);
  assert.match(createHelpOutput, /--dry-run/);
  assert.match(createHelpOutput, /--force/);
  assert.match(createHelpOutput, /skip interactive prompts/);
  assert.equal(rootTemplateListOutput.trim(), "starter - minimal Vite app\nbasic - component composition example");
  assert.equal(createTemplateListOutput.trim(), "starter - minimal Vite app\nbasic - component composition example");

  const defaultCreateOutput = runCli(cliPath, ["create", "--yes"], tempRoot);
  assert.match(defaultCreateOutput, /Created mikuru-app/);
  assert.equal(existsSync(join(tempRoot, "mikuru-app", "package.json")), true);

  const promptedCreateOutput = runCliWithInput(cliPath, ["create"], "prompted-app\nbasic\n", tempRoot, {
    MIKURU_TEST_FORCE_PROMPTS: "1"
  });
  assert.match(promptedCreateOutput, /Project name \(mikuru-app\):/);
  assert.match(promptedCreateOutput, /Template \(starter\):/);
  assert.match(promptedCreateOutput, /Created prompted-app/);
  assert.match(promptedCreateOutput, /Template: basic/);
  assert.equal(existsSync(join(tempRoot, "prompted-app", "src", "MoodBadge.mikuru")), true);

  const createOutput = runCli(cliPath, ["create", "hello-mikuru"], tempRoot);
  assert.match(createOutput, /cd hello-mikuru/);
  assert.match(createOutput, /edit src\/App\.mikuru/);

  const appRoot = join(tempRoot, "hello-mikuru");
  const packageJson = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));
  const tsconfig = readFileSync(join(appRoot, "tsconfig.json"), "utf8");
  const indexHtml = readFileSync(join(appRoot, "index.html"), "utf8");
  const appSource = readFileSync(join(appRoot, "src", "App.mikuru"), "utf8");
  const viteConfig = readFileSync(join(appRoot, "vite.config.ts"), "utf8");

  assert.equal(packageJson.name, "hello-mikuru");
  assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
  assert.equal(packageJson.dependencies.mikuru, `^${rootPackageJson.version}`);
  assert.match(tsconfig, /src\/\*\*\/\*\.ts/);
  assert.match(indexHtml, /href="\/favicon\.svg"/);
  assert.equal(existsSync(join(appRoot, "public", "favicon.svg")), true);
  assert.match(appSource, /Mikuru is ready/);
  assert.match(appSource, /@click="increment"/);
  assert.match(viteConfig, /mikuru\/vite/);

  runCli(cliPath, ["create", "-t", "starter", "template-app"], tempRoot);
  assert.equal(existsSync(join(tempRoot, "template-app", "package.json")), true);

  const dryRunRoot = join(tempRoot, "dry-run-app");
  const dryRunOutput = runCli(cliPath, ["create", dryRunRoot, "-t", "basic", "--dry-run"], tempRoot);
  assert.match(dryRunOutput, /Dry run: no files will be written/);
  assert.match(dryRunOutput, /Template: basic - component composition example/);
  assert.match(dryRunOutput, /package\.json/);
  assert.match(dryRunOutput, /src[\\/]MoodBadge\.mikuru/);
  assert.equal(existsSync(dryRunRoot), false);

  const dotRoot = join(tempRoot, "dot-app");
  mkdirSync(dotRoot);
  const dotCreateOutput = runCli(cliPath, ["create", ".", "--force"], dotRoot);
  assert.doesNotMatch(dotCreateOutput, /cd \./);
  assert.equal(JSON.parse(readFileSync(join(dotRoot, "package.json"), "utf8")).name, "dot-app");

  const basicCreateOutput = runCli(cliPath, ["create", "basic-app", "--template=basic", "--yes"], tempRoot);
  assert.match(basicCreateOutput, /edit src\/App\.mikuru and src\/MoodBadge\.mikuru/);
  const basicPackageJson = JSON.parse(readFileSync(join(tempRoot, "basic-app", "package.json"), "utf8"));
  const basicTsconfig = readFileSync(join(tempRoot, "basic-app", "tsconfig.json"), "utf8");
  const basicAppSource = readFileSync(join(tempRoot, "basic-app", "src", "App.mikuru"), "utf8");
  const basicMoodBadgeSource = readFileSync(join(tempRoot, "basic-app", "src", "MoodBadge.mikuru"), "utf8");
  assert.equal(basicPackageJson.name, "basic-app");
  assert.equal(basicPackageJson.scripts.typecheck, "tsc --noEmit");
  assert.equal(basicPackageJson.dependencies.mikuru, `^${rootPackageJson.version}`);
  assert.match(basicTsconfig, /DOM\.Iterable/);
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
    runCliError(cliPath, ["create", "-t", "unknown", "unknown-template"], tempRoot),
    /Unknown template: unknown/
  );
  assert.match(
    runCliError(cliPath, ["create", "--template=unknown", "unknown-template"], tempRoot),
    /starter - minimal Vite app[\s\S]*basic - component composition example[\s\S]*--list-templates/
  );
  assert.match(
    runCliError(cliPath, ["create", "--template=startre", "typo-template"], tempRoot),
    /Did you mean starter\?/
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

function runCliWithInput(cliPath, args, input, cwd, env = {}) {
  return execFileSync(node, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    input,
    stdio: ["pipe", "pipe", "pipe"]
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
