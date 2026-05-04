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
npm run dev
```

The generated starter includes Vite, TypeScript, the package-provided `.mikuru` module declaration, and a welcome component at `src/App.mikuru`.

Use the `basic` template when you want a small component composition example:

```sh
npx mikuru create my-basic-app --template basic
```

`mikuru create` also accepts `--force` for non-empty directories and `--yes` / `-y` to use default answers for prompts.

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
- DOM events with `@click`, `v-on:click`, `.prevent`, and `.stop`
- Attribute bindings with `:class` and `v-bind:class`
- `v-if`, `v-else-if`, `v-else`, `v-show`, and `v-for`
- `v-model` for common form controls and child components
- Component props, events, `defineProps`, `defineEmits`, and default slots
- Runtime helpers including `ref`, `computed`, `effect`, `watch`, `nextTick`, lifecycle callbacks, `provide`, and `inject`
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
npx mikuru create my-basic-app --template basic
```

## Not Included in v1

Mikuru does not claim Vue compatibility. The v1 package does not include SSR, hydration, transitions, devtools, named slots, slot props, dynamic components, `v-html`, object-form `v-bind` / `v-on`, or full template type checking.

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
- `docs/v1-api-contract.md` describes the v1 compatibility boundary used by this repository.
