import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tempRoot = mkdtempSync(join(tmpdir(), "mikuru-pack-smoke-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npmCli = process.env.npm_execpath;
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
    `<template>
  <div>
    <button @click="increment">packed: {{ count }}</button>
    <MikuruEmbedPlayer url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Packed embed" privacy />
    <MikuruVideoPlayer title="Packed video" src="/sample.mp4" />
    <MikuruAudioPlayer title="Packed audio" src="/sample.mp3" />
    <MikuruImageViewer src="/sample.jpg" alt="Packed image" caption="Packed image" />
    <MikuruCarousel title="Packed carousel" :images="slides" />
    <MikuruModal :open="modalOpen" title="Packed modal" body="Modal from package export" @close="closeModal" />
    <MikuruToast :toasts="toasts" @dismiss="dismissToast" />
    <MikuruDropdown label="Packed menu" :items="menuItems" @select="selectItem" />
    <MikuruToolTip text="Packed tooltip" label="?" />
    <MikuruProgress label="Packed progress" :value="count" :max="10" />
    <MikuruCodeBlock language="js" code="const fromPackage = true;" />
    <MikuruTabs :items="tabs" m-model="activeTab" />
    <MikuruAccordion :items="sections" m-model="openSection" />
    <MikuruTextInput label="Packed title" m-model="title" />
    <MikuruTextarea label="Packed notes" m-model="notes" />
    <MikuruCheckbox label="Packed checkbox" m-model="checked" />
    <MikuruSelect label="Packed owner" :options="owners" m-model="owner" />
    <MikuruCombobox label="Packed assignee" :options="owners" m-model="assignee" />
    <MikuruHeader title="Packed shell" logo="M" :items="navItems" m-model="activeShell" />
    <MikuruSideMenu title="Packed menu" :items="navItems" m-model="activeShell" m-model:collapsed="menuCollapsed" />
    <MikuruFooter title="Packed footer" :links="footerLinks" note="Packed layout components" />
  </div>
</template>
<script>
import { ref } from "mikuru";
import MikuruAccordion from "mikuru/components/MikuruAccordion";
import MikuruAudioPlayer from "mikuru/components/MikuruAudioPlayer";
import MikuruCheckbox from "mikuru/components/MikuruCheckbox";
import MikuruCodeBlock from "mikuru/components/MikuruCodeBlock";
import MikuruCarousel from "mikuru/components/MikuruCarousel";
import MikuruCombobox from "mikuru/components/MikuruCombobox";
import MikuruDropdown from "mikuru/components/MikuruDropdown";
import MikuruEmbedPlayer from "mikuru/components/MikuruEmbedPlayer";
import MikuruFooter from "mikuru/components/MikuruFooter";
import MikuruHeader from "mikuru/components/MikuruHeader";
import MikuruImageViewer from "mikuru/components/MikuruImageViewer";
import MikuruModal from "mikuru/components/MikuruModal";
import MikuruProgress from "mikuru/components/MikuruProgress";
import MikuruSelect from "mikuru/components/MikuruSelect";
import MikuruSideMenu from "mikuru/components/MikuruSideMenu";
import MikuruTabs from "mikuru/components/MikuruTabs";
import MikuruTextarea from "mikuru/components/MikuruTextarea";
import MikuruTextInput from "mikuru/components/MikuruTextInput";
import MikuruToast from "mikuru/components/MikuruToast";
import MikuruToolTip from "mikuru/components/MikuruToolTip";
import MikuruVideoPlayer from "mikuru/components/MikuruVideoPlayer";
const count = ref(1);
const modalOpen = ref(false);
const activeTab = ref("one");
const openSection = ref("compile");
const title = ref("Packed title");
const notes = ref("Packed notes");
const checked = ref(true);
const owner = ref("compiler");
const assignee = ref("runtime");
const activeShell = ref("overview");
const menuCollapsed = ref(false);
const toasts = [{ id: "pack", title: "Packed", message: "Toast package export", tone: "success" }];
const menuItems = [{ label: "Open", value: "open", description: "Package dropdown item" }];
const slides = [
  { src: "/slide-one.jpg", alt: "Slide one", title: "Slide one", caption: "First packed slide" },
  { src: "/slide-two.jpg", alt: "Slide two", title: "Slide two", caption: "Second packed slide" }
];
const tabs = [
  { label: "One", value: "one", panel: "Packed first tab" },
  { label: "Two", value: "two", panel: "Packed second tab" }
];
const sections = [
  { label: "Compile", value: "compile", panel: "Packed accordion panel" },
  { label: "Runtime", value: "runtime", panel: "Packed runtime panel" }
];
const owners = [
  { label: "Compiler", value: "compiler" },
  { label: "Runtime", value: "runtime", description: "Runtime package option" }
];
const navItems = [
  { label: "Overview", value: "overview", icon: "O" },
  { label: "Settings", value: "settings", icon: "S" }
];
const footerLinks = [
  { label: "Docs", value: "docs" },
  { label: "Release notes", value: "release-notes" }
];
function increment() {
  count.value += 1;
}
function closeModal() {
  modalOpen.value = false;
}
function dismissToast() {}
function selectItem() {}
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
  const command = npmCli ? process.execPath : npm;
  const commandArgs = npmCli ? [npmCli, ...args] : args;
  runCommand(command, commandArgs, cwd);
}

function runCommand(command, args, cwd) {
  try {
    execFileSync(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (error.stdout?.length) {
      process.stdout.write(error.stdout);
    }
    if (error.stderr?.length) {
      process.stderr.write(error.stderr);
    }
    throw error;
  }
}

function installAndBuildGeneratedApp(appRoot, tarball) {
  const packageJsonPath = join(appRoot, "package.json");
  const appPackageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  appPackageJson.dependencies.mikuru = `file:${tarball.replace(/\\/g, "/")}`;
  writeFileSync(packageJsonPath, `${JSON.stringify(appPackageJson, null, 2)}\n`);
  runNpm(["install", "--no-audit", "--no-fund"], appRoot);
  runNpm(["run", "typecheck"], appRoot);
  runNpm(["run", "build"], appRoot);
}
