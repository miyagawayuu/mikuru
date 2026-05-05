#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const availableTemplates = ["starter", "basic"] as const;
type TemplateName = (typeof availableTemplates)[number];

type CreateOptions = {
  force: boolean;
  targetArg?: string;
  templateName: TemplateName;
  yes: boolean;
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

if (command === "--list-templates") {
  printTemplates();
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

const { force, targetArg, templateName } = createOptions;
const targetDir = resolve(process.cwd(), targetArg ?? "mikuru-app");
const appName = toPackageName(basename(targetDir));
const packageVersion = readPackageVersion();

if (!force && existsSync(targetDir) && readdirSync(targetDir).length > 0) {
  console.error(`Cannot create a Mikuru app in a non-empty directory: ${targetDir}`);
  console.error("Choose a new directory name, empty the target directory, or pass --force to overwrite template files.");
  process.exit(1);
}

const templateDir = resolve(dirname(fileURLToPath(import.meta.url)), `../templates/${templateName}`);

copyTemplate(templateDir, targetDir, { appName, packageVersion });

console.log(`Created ${appName}`);
console.log(`  Template: ${templateName}`);
console.log(`  Location: ${targetDir}`);
console.log("");
console.log("Next steps:");
const relativeTargetDir = relative(process.cwd(), targetDir);
if (relativeTargetDir && relativeTargetDir !== ".") {
  console.log(`  cd ${relativeTargetDir}`);
}
console.log("  npm install");
console.log("  npm run dev");

function printHelp(): void {
  console.log(`Usage:
  mikuru create [project-name] [--template starter|basic]
  mikuru --version
  mikuru --help
  mikuru --list-templates

Commands:
  create    Create a new Mikuru app.

Options:
  -h, --help          Show help.
  -v, --version       Show the installed Mikuru version.
  --list-templates    List available create templates.`);
}

function printCreateHelp(): void {
  console.log(`Usage:
  mikuru create [project-name] [--template starter|basic]

Options:
  -t, --template <name>  Template to use. Available: ${availableTemplates.join(", ")}.
  --list-templates       List available create templates.
  --force              Create into a non-empty directory and overwrite template files.
  -y, --yes            Use default answers for prompts. Currently accepted for future compatibility.
  -h, --help           Show create help.`);
}

function printTemplates(): void {
  console.log(availableTemplates.join("\n"));
}

function parseCreateArgs(createArgs: string[]): CreateOptions | undefined {
  let force = false;
  let targetArg: string | undefined;
  let templateName = "starter";
  let yes = false;

  for (let i = 0; i < createArgs.length; i++) {
    const arg = createArgs[i];

    if (arg === "--help" || arg === "-h") {
      printCreateHelp();
      process.exit(0);
    }

    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--yes" || arg === "-y") {
      yes = true;
      continue;
    }

    if (arg === "--list-templates") {
      printTemplates();
      process.exit(0);
    }

    if (arg === "--template" || arg === "-t") {
      const nextValue = createArgs[++i];
      if (!nextValue) {
        console.error(`Missing value for ${arg}.`);
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

  if (!isTemplateName(templateName)) {
    console.error(`Unknown template: ${templateName}`);
    console.error(`Available templates: ${availableTemplates.join(", ")}`);
    return undefined;
  }

  return { force, targetArg, templateName, yes };
}

function isTemplateName(value: string): value is TemplateName {
  return (availableTemplates as readonly string[]).includes(value);
}

function copyTemplate(sourceDir: string, targetDir: string, variables: { appName: string; packageVersion: string }): void {
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
      const content = readFileSync(sourcePath, "utf8")
        .replaceAll("__MIKURU_APP_NAME__", variables.appName)
        .replaceAll("__MIKURU_VERSION__", variables.packageVersion);
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
