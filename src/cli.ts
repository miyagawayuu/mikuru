#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type CreateOptions = {
  targetArg?: string;
  templateName: string;
};

const args = process.argv.slice(2);
const command = args[0];

if (command === "--help" || command === "-h" || !command) {
  printHelp();
  process.exit(0);
}

if (command === "--version" || command === "-v") {
  console.log(readPackageVersion());
  process.exit(0);
}

if (command !== "create") {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

const createOptions = parseCreateArgs(args.slice(1));
if (!createOptions) {
  process.exit(1);
}

const { targetArg, templateName } = createOptions;
const targetDir = resolve(process.cwd(), targetArg ?? "mikuru-app");
const appName = toPackageName(basename(targetDir));

if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
  console.error(`Cannot create a Mikuru app in a non-empty directory: ${targetDir}`);
  console.error("Choose a new directory name or empty the target directory first.");
  process.exit(1);
}

const templateDir = resolve(dirname(fileURLToPath(import.meta.url)), `../templates/${templateName}`);

copyTemplate(templateDir, targetDir, { appName });

console.log(`Created ${appName} in ${targetDir}`);
console.log("");
console.log("Next steps:");
console.log(`  cd ${basename(targetDir)}`);
console.log("  npm install");
console.log("  npm run dev");

function printHelp(): void {
  console.log(`Usage:
  mikuru create [project-name] [--template starter]
  mikuru --version
  mikuru --help

Commands:
  create    Create a new Mikuru app.

Options:
  -h, --help       Show help.
  -v, --version    Show the installed Mikuru version.`);
}

function printCreateHelp(): void {
  console.log(`Usage:
  mikuru create [project-name] [--template starter]

Options:
  --template <name>    Template to use. Available: starter.
  -h, --help           Show create help.`);
}

function parseCreateArgs(createArgs: string[]): CreateOptions | undefined {
  let targetArg: string | undefined;
  let templateName = "starter";

  for (let i = 0; i < createArgs.length; i++) {
    const arg = createArgs[i];

    if (arg === "--help" || arg === "-h") {
      printCreateHelp();
      process.exit(0);
    }

    if (arg === "--template") {
      const nextValue = createArgs[++i];
      if (!nextValue) {
        console.error("Missing value for --template.");
        printCreateHelp();
        return undefined;
      }
      templateName = nextValue;
      continue;
    }

    if (arg.startsWith("--template=")) {
      templateName = arg.slice("--template=".length);
      continue;
    }

    if (arg.startsWith("-")) {
      console.error(`Unknown create option: ${arg}`);
      printCreateHelp();
      return undefined;
    }

    if (targetArg) {
      console.error(`Unexpected extra argument: ${arg}`);
      printCreateHelp();
      return undefined;
    }

    targetArg = arg;
  }

  if (templateName !== "starter") {
    console.error(`Unknown template: ${templateName}`);
    console.error("Available templates: starter");
    return undefined;
  }

  return { targetArg, templateName };
}

function copyTemplate(sourceDir: string, targetDir: string, variables: { appName: string }): void {
  mkdirSync(targetDir, { recursive: true });

  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, entry);
    const targetName = entry === "_gitignore" ? ".gitignore" : entry;
    const targetPath = join(targetDir, targetName);
    const stat = statSync(sourcePath);

    if (stat.isDirectory()) {
      copyTemplate(sourcePath, targetPath, variables);
      continue;
    }

    if (isTextTemplate(sourcePath)) {
      const content = readFileSync(sourcePath, "utf8").replaceAll("__MIKURU_APP_NAME__", variables.appName);
      writeFileSync(targetPath, content);
      continue;
    }

    copyFileSync(sourcePath, targetPath);
  }
}

function isTextTemplate(path: string): boolean {
  return /\.(css|html|json|mikuru|svg|ts)$/.test(path) || path.endsWith("_gitignore");
}

function toPackageName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "mikuru-app";
}

function readPackageVersion(): string {
  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), "../package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
  return packageJson.version ?? "0.0.0";
}
