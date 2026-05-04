#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const command = process.argv[2];
const targetArg = process.argv[3];

if (command === "--help" || command === "-h" || !command) {
  printHelp();
  process.exit(0);
}

if (command !== "create") {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

const targetDir = resolve(process.cwd(), targetArg ?? "mikuru-app");
const appName = toPackageName(basename(targetDir));

if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
  console.error(`Target directory is not empty: ${targetDir}`);
  process.exit(1);
}

const templateDir = resolve(dirname(fileURLToPath(import.meta.url)), "../templates/starter");

copyTemplate(templateDir, targetDir, { appName });

console.log(`Created ${appName} in ${targetDir}`);
console.log("");
console.log("Next steps:");
console.log(`  cd ${basename(targetDir)}`);
console.log("  npm install");
console.log("  npm run dev");

function printHelp(): void {
  console.log("Usage:");
  console.log("  mikuru create [project-name]");
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
  return /\.(css|html|json|mikuru|ts)$/.test(path) || path.endsWith("_gitignore");
}

function toPackageName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "mikuru-app";
}
