#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleCreateCommand } from "./cli/create.js";
import { formatTemplateList } from "./cli/templates.js";

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
    console.log(formatTemplateList());
    process.exit(0);
  }

  if (command !== "create") {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }

  await handleCreateCommand(args.slice(1), readPackageVersion());
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

function readPackageVersion(): string {
  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), "../package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
  return packageJson.version ?? "0.0.0";
}
