import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tempRoot = mkdtempSync(join(tmpdir(), "mikuru-pack-smoke-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

try {
  runNpm(["pack", "--pack-destination", tempRoot], root);
  const tarball = join(tempRoot, `mikuru-${packageJson.version}.tgz`);
  const appRoot = join(tempRoot, "app");

  writeFileSync(
    join(tempRoot, "package.json"),
    JSON.stringify(
      {
        type: "module",
        scripts: {
          build: "vite build",
          typecheck: "tsc --noEmit"
        },
        dependencies: {
          mikuru: `file:${tarball.replace(/\\/g, "/")}`
        },
        devDependencies: {
          typescript: "^6.0.3",
          vite: "^8.0.10"
        }
      },
      null,
      2
    )
  );
  runNpm(["install", "--no-audit", "--no-fund"], tempRoot);
  runNpm(["exec", "--", "mikuru", "create", "cli-app", "--template", "starter", "--yes"], tempRoot);
  runNpm(["exec", "--", "mikuru", "create", "basic-cli-app", "--template", "basic", "--yes"], tempRoot);

  const cliAppPackage = JSON.parse(readFileSync(join(tempRoot, "cli-app", "package.json"), "utf8"));
  if (cliAppPackage.name !== "cli-app") {
    throw new Error("Expected installed Mikuru CLI to scaffold cli-app");
  }

  installAndBuildGeneratedApp(join(tempRoot, "cli-app"), tarball);
  installAndBuildGeneratedApp(join(tempRoot, "basic-cli-app"), tarball);

  mkdirSync(appRoot);
  writeFileSync(
    join(tempRoot, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          lib: ["ES2022", "DOM"],
          strict: true,
          skipLibCheck: true
        },
        include: ["app/src/**/*.ts", "app/src/**/*.d.ts"]
      },
      null,
      2
    )
  );
  writeFileSync(
    join(appRoot, "index.html"),
    `<!doctype html><div id="app"></div><script type="module" src="/src/main.ts"></script>`
  );
  mkdirSync(join(appRoot, "src"));
  writeFileSync(join(appRoot, "src", "mikuru-env.d.ts"), `import "mikuru/env";\n`);
  writeFileSync(
    join(appRoot, "src", "main.ts"),
    `import { mount } from "./App.mikuru";

const app = document.querySelector("#app");

if (!app) {
  throw new Error("Missing #app");
}

mount(app);
`
  );
  writeFileSync(
    join(appRoot, "src", "App.mikuru"),
    `<template><button @click="increment">packed: {{ count }}</button></template>
<script>
import { ref } from "mikuru";
const count = ref(1);
function increment() {
  count.value += 1;
}
</script>`
  );
  writeFileSync(
    join(tempRoot, "vite.config.ts"),
    `import { defineConfig } from "vite";\nimport { mikuru } from "mikuru/vite";\nexport default defineConfig({ root: ${JSON.stringify(
      basename(appRoot)
    )}, plugins: [mikuru()] });\n`
  );

  runNpm(["run", "typecheck"], tempRoot);
  runNpm(["run", "build"], tempRoot);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function runNpm(args, cwd) {
  execFileSync(npm, args, { cwd, stdio: "ignore", shell: process.platform === "win32" });
}

function installAndBuildGeneratedApp(appRoot, tarball) {
  const packageJsonPath = join(appRoot, "package.json");
  const appPackageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  appPackageJson.dependencies.mikuru = `file:${tarball.replace(/\\/g, "/")}`;
  writeFileSync(packageJsonPath, `${JSON.stringify(appPackageJson, null, 2)}\n`);
  runNpm(["install", "--no-audit", "--no-fund"], appRoot);
  runNpm(["run", "build"], appRoot);
}
