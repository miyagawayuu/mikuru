#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const availableTemplates = ["starter", "basic"] as const;
type TemplateName = (typeof availableTemplates)[number];

const templateDescriptions: Record<TemplateName, string> = {
  starter: "minimal Vite app",
  basic: "component composition example"
};

type CreateOptions = {
  dryRun: boolean;
  force: boolean;
  targetArg?: string;
  templateName: TemplateName;
  templateProvided: boolean;
  yes: boolean;
};

await main();

async function main(): Promise<void> {
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

  const resolvedOptions = await resolveCreateOptions(createOptions);
  const { dryRun, force, targetArg, templateName } = resolvedOptions;
  const targetDir = resolve(process.cwd(), targetArg ?? "mikuru-app");
  const appName = toPackageName(basename(targetDir));
  const packageVersion = readPackageVersion();
  const templateDir = resolve(dirname(fileURLToPath(import.meta.url)), `../templates/${templateName}`);

  if (!dryRun && !force && existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    console.error(`Cannot create a Mikuru app in a non-empty directory: ${targetDir}`);
    console.error("Choose a new directory name, empty the target directory, or pass --force to overwrite template files.");
    process.exit(1);
  }

  if (dryRun) {
    printCreateDryRun(templateDir, targetDir, { appName, packageVersion, templateName });
    process.exit(0);
  }

  copyTemplate(templateDir, targetDir, { appName, packageVersion });
  printCreateSuccess(targetDir, appName, templateName);
}

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
  --list-templates    List available create templates with descriptions.`);
}

function printCreateHelp(): void {
  console.log(`Usage:
  mikuru create [project-name] [--template starter|basic]

Options:
  -t, --template <name>  Template to use. Available: ${availableTemplates.join(", ")}.
  --list-templates       List available create templates with descriptions.
  --dry-run              Print the target, template, and files without writing them.
  --force                Create into a non-empty directory and overwrite template files.
  -y, --yes              Use default answers and skip interactive prompts.
  -h, --help             Show create help.`);
}

function printTemplates(): void {
  console.log(availableTemplates.map((name) => `${name} - ${templateDescriptions[name]}`).join("\n"));
}

function printTemplateNextStep(templateName: TemplateName): void {
  if (templateName === "basic") {
    console.log("  edit src/App.mikuru and src/MoodBadge.mikuru");
    return;
  }

  console.log("  edit src/App.mikuru");
}

function parseCreateArgs(createArgs: string[]): CreateOptions | undefined {
  let dryRun = false;
  let force = false;
  let targetArg: string | undefined;
  let templateName = "starter";
  let templateProvided = false;
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

    if (arg === "--dry-run") {
      dryRun = true;
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
      templateProvided = true;
      continue;
    }

    if (arg.startsWith("--template=")) {
      templateName = arg.slice("--template=".length);
      templateProvided = true;
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
    const suggestion = suggestTemplateName(templateName);
    if (suggestion) {
      console.error(`Did you mean ${suggestion}?`);
    }
    console.error("Available templates:");
    console.error(formatTemplatesForError());
    console.error("Run `mikuru create --list-templates` to see template descriptions.");
    return undefined;
  }

  return { dryRun, force, targetArg, templateName, templateProvided, yes };
}

function isTemplateName(value: string): value is TemplateName {
  return (availableTemplates as readonly string[]).includes(value);
}

function formatTemplatesForError(): string {
  return availableTemplates.map((name) => `  ${name} - ${templateDescriptions[name]}`).join("\n");
}

async function resolveCreateOptions(options: CreateOptions): Promise<CreateOptions> {
  if (options.yes || !canPrompt()) {
    return options;
  }

  if (process.env.MIKURU_TEST_FORCE_PROMPTS === "1") {
    return resolveCreateOptionsFromInput(options, readFileSync(0, "utf8").split(/\r?\n/));
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    let targetArg = options.targetArg;
    let templateName = options.templateName;
    let templateProvided = options.templateProvided;

    if (!targetArg) {
      const answer = (await rl.question("Project name (mikuru-app): ")).trim();
      targetArg = answer || "mikuru-app";
    }

    if (!templateProvided) {
      printTemplates();
      const answer = (await rl.question("Template (starter): ")).trim();
      if (answer) {
        const suggestion = isTemplateName(answer) ? undefined : suggestTemplateName(answer);
        if (!isTemplateName(answer)) {
          console.error(`Unknown template: ${answer}`);
          if (suggestion) {
            console.error(`Did you mean ${suggestion}?`);
          }
          console.error("Available templates:");
          console.error(formatTemplatesForError());
          process.exit(1);
        }
        templateName = answer;
        templateProvided = true;
      }
    }

    return { ...options, targetArg, templateName, templateProvided };
  } finally {
    rl.close();
  }
}

function resolveCreateOptionsFromInput(options: CreateOptions, answers: string[]): CreateOptions {
  let targetArg = options.targetArg;
  let templateName = options.templateName;
  let templateProvided = options.templateProvided;

  if (!targetArg) {
    process.stdout.write("Project name (mikuru-app): ");
    targetArg = answers.shift()?.trim() || "mikuru-app";
  }

  if (!templateProvided) {
    printTemplates();
    process.stdout.write("Template (starter): ");
    const answer = answers.shift()?.trim();
    if (answer) {
      if (!isTemplateName(answer)) {
        console.error(`Unknown template: ${answer}`);
        const suggestion = suggestTemplateName(answer);
        if (suggestion) {
          console.error(`Did you mean ${suggestion}?`);
        }
        console.error("Available templates:");
        console.error(formatTemplatesForError());
        process.exit(1);
      }
      templateName = answer;
      templateProvided = true;
    }
  }

  return { ...options, targetArg, templateName, templateProvided };
}

function canPrompt(): boolean {
  return process.env.MIKURU_TEST_FORCE_PROMPTS === "1" || Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function suggestTemplateName(value: string): TemplateName | undefined {
  let bestName: TemplateName | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const templateName of availableTemplates) {
    const distance = levenshtein(value, templateName);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestName = templateName;
    }
  }

  return bestDistance <= 2 ? bestName : undefined;
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function printCreateSuccess(targetDir: string, appName: string, templateName: TemplateName): void {
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
  printTemplateNextStep(templateName);
}

function printCreateDryRun(
  templateDir: string,
  targetDir: string,
  variables: { appName: string; packageVersion: string; templateName: TemplateName }
): void {
  console.log("Dry run: no files will be written.");
  console.log(`  App name: ${variables.appName}`);
  console.log(`  Template: ${variables.templateName} - ${templateDescriptions[variables.templateName]}`);
  console.log(`  Location: ${targetDir}`);
  console.log("");
  console.log("Files:");
  for (const filePath of listTemplateFiles(templateDir, targetDir)) {
    console.log(`  ${relative(process.cwd(), filePath)}`);
  }
}

function listTemplateFiles(sourceDir: string, targetDir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, entry);
    const targetName = entry === "_gitignore" ? ".gitignore" : entry;
    const targetPath = join(targetDir, targetName);
    const stat = statSync(sourcePath);

    if (stat.isDirectory()) {
      files.push(...listTemplateFiles(sourcePath, targetPath));
      continue;
    }

    files.push(targetPath);
  }

  return files;
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
