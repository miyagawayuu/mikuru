import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const templatesRoot = join(root, "templates");
const rootPackageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

for (const templateName of readdirSync(templatesRoot)) {
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
