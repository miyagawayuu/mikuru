import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const templatesRoot = join(root, "templates");
const rootPackageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const cliSource = readFileSync(join(root, "src", "cli.ts"), "utf8");
const templateNames = readdirSync(templatesRoot).sort();
const availableTemplates = parseAvailableTemplates(cliSource).sort();

assert.deepEqual(
  availableTemplates,
  templateNames,
  "availableTemplates should match the templates directory"
);

for (const templateName of templateNames) {
  const packageJsonPath = join(templatesRoot, templateName, "package.json");
  const packageJsonText = readFileSync(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonText);

  assert.equal(
    packageJson.dependencies?.mikuru,
    "^__MIKURU_VERSION__",
    `${templateName} template should use the CLI version placeholder`
  );
  assert.equal(
    packageJsonText.includes(`^${rootPackageJson.version}`),
    false,
    `${templateName} template should not hard-code the current Mikuru version`
  );
}

function parseAvailableTemplates(source) {
  const match = source.match(/const availableTemplates = \[([^\]]+)\] as const;/);
  assert.ok(match, "src/cli.ts should define availableTemplates as a const tuple");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}
