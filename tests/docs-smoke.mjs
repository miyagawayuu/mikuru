import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readme = readFileSync(join(root, "README.md"), "utf8");
const npmUsage = readFileSync(join(root, "docs", "npm-usage.md"), "utf8");
const releaseChecklist = readFileSync(join(root, "docs", "release-checklist.md"), "utf8");

for (const [name, content] of [
  ["README.md", readme],
  ["docs/npm-usage.md", npmUsage]
]) {
  assert.match(content, /--list-templates/, `${name} should document template listing`);
  assert.match(content, /starter - minimal Vite app/, `${name} should document the starter template`);
  assert.match(content, /basic - component composition example/, `${name} should document the basic template`);
  assert.match(content, /-t basic/, `${name} should document the template shorthand`);
  assert.match(content, /--dry-run/, `${name} should document dry-run`);
  assert.match(content, /skip interactive prompts/, `${name} should explain --yes behavior`);
  assert.match(content, /npm run typecheck/, `${name} should document generated app typecheck`);
}

assert.match(releaseChecklist, /Push `master`/, "release checklist should mention pushing master");
assert.match(releaseChecklist, /GitHub Release/, "release checklist should mention GitHub Release creation");
assert.match(releaseChecklist, /Delete merged release or Codex work branches/, "release checklist should mention branch cleanup");
