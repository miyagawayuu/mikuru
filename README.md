# Mikuru

Mikuru is a compile-first JavaScript framework for Vue-like single-file components that generate direct DOM update code instead of using a virtual DOM.

It is intentionally small. Mikuru v1 is a practical validation release for writing `.mikuru` components in Vite apps, not a Vue compatibility layer.

## Requirements

- Node.js 22 or newer
- Vite 8 or newer for app development

## Create a New App

The fastest way to try Mikuru is the package CLI:

```sh
npx mikuru create my-app
cd my-app
npm install
npm run typecheck
npm run dev
```

The generated starter includes Vite, TypeScript, the package-provided `.mikuru` module declaration, and a welcome component at `src/App.mikuru`.

Use the `basic` template when you want a small component composition example:

```sh
npx mikuru create my-basic-app -t basic
```

List available templates:

```sh
npx mikuru --list-templates
starter - minimal Vite app
basic - component composition example
```

Run a dry-run to preview the target, template, and files without writing them:

```sh
npx mikuru create my-app -t basic --dry-run
```

When run in a terminal, `mikuru create` asks for a project name and template if they are omitted. Use `--yes` / `-y` to skip interactive prompts and accept defaults. `mikuru create` also accepts `--force` for non-empty directories.

Generated apps include `npm run typecheck` for a quick TypeScript validation pass before running or building.

## Add Mikuru to a Vite App

Install Mikuru and the Vite tooling:

```sh
npm install mikuru
npm install -D vite typescript
```

Configure Vite:

```ts
import { defineConfig } from "vite";
import { mikuru } from "mikuru/vite";

export default defineConfig({
  plugins: [mikuru()]
});
```

Create a `.mikuru` component:

```mikuru
<template>
  <button @click="increment">count: {{ count }}</button>
</template>

<script>
import { ref } from "mikuru";

const count = ref(0);

function increment() {
  count.value += 1;
}
</script>

<style>
button {
  font: inherit;
}
</style>
```

Mount it from your app entry:

```ts
import { mount } from "./App.mikuru";

const app = document.querySelector("#app");

if (!app) {
  throw new Error("Missing #app");
}

mount(app);
```

## TypeScript Declarations

For TypeScript projects, add a local declaration file such as `src/mikuru-env.d.ts` that imports Mikuru's package-provided `.mikuru` module declaration:

```ts
import "mikuru/env";
```

You can use the exported component types for typed wrappers or hand-written integrations:

```ts
import type { MikuruComponent } from "mikuru/env";

type GreetingProps = {
  name: string;
};

declare const Greeting: MikuruComponent<GreetingProps>;
```

## Supported v1 Surface

- `.mikuru` SFCs with `<template>`, `<script>`, and `<style>`
- Vite plugin support through `mikuru/vite`
- Template interpolation with `{{ value }}`
- DOM events with `@click`, `v-on:click`, `.prevent`, `.stop`, `.self`, `.once`, `.capture`, and `.passive`
- Component events with `@select` and `.once`
- Attribute bindings with normalized `:class` and `:style`
- `v-if`, `v-else-if`, `v-else`, `v-show`, and `v-for`
- `v-model` for common form controls and child components
- Component props, events, `defineProps`, `defineEmits`, default slots, named/dynamic slots, and slot props with simple defaults
- Runtime helpers including `ref`, `computed`, `effect`, `watch` with `immediate` and cleanup callbacks, `nextTick`, lifecycle callbacks, `provide`, and `inject`
- Routing through `mikuru/router` with route matching, history/hash/memory histories, guards, router context helpers, `RouterView`, and `RouterLink`
- Style injection and basic `<style scoped>` selector rewriting
- Compile errors with filenames, line/column information, and code frames

## Package Exports

Application code usually imports from `mikuru`:

```ts
import { computed, ref } from "mikuru";
```

The Vite plugin is available from `mikuru/vite`:

```ts
import { mikuru } from "mikuru/vite";
```

The router is available from `mikuru/router`:

```ts
import { createRouter, createWebHashHistory, provideRouter, RouterLink, RouterView, useRoute, useRouter } from "mikuru/router";
```

The `.mikuru` TypeScript declaration is available from `mikuru/env`:

```ts
import "mikuru/env";
```

Compiler and runtime entries are public for lower-level integrations:

```ts
import { compile } from "mikuru/compiler";
import { effect, nextTick, ref, unwrap, watch } from "mikuru/runtime";
```

The package also provides the `mikuru` binary:

```sh
npx mikuru create my-app
npx mikuru create my-basic-app -t basic
npx mikuru --list-templates
```

## Not Included in v1

Mikuru does not claim Vue compatibility. The v1 package does not include SSR, hydration, transitions, devtools, dynamic components, `v-html`, or full template type checking.

Scoped CSS is a basic selector rewrite, not a full CSS compiler. Avoid relying on `:global()`, deep selectors, complex nesting, CSS Modules, or preprocessors in v1.

## Repository Development

For local framework development:

```sh
npm install
npm run ci
```

Useful targeted checks:

```sh
npm run typecheck
npm test
npm run build
npm run test:create
npm run test:package
npm run test:pack
npm run test:e2e
```

Examples can be run from the repository root:

```sh
npm run dev:basic
npm run dev:realworld
npm run dev:dogfood
npm run dev:mikuru-sample
npm run dev:mikuru-vue-like
```

## Documentation

- `CHANGELOG.md` lists published package changes.
- `docs/npm-usage.md` shows a manual Vite setup for package consumers.
- `docs/app-architecture.md` describes how to keep larger Mikuru apps split across components, API modules, stores, forms, auth, and tests.
- `docs/router.md` documents the runtime router.
- `docs/v1-api-contract.md` describes the v1 compatibility boundary used by this repository.
