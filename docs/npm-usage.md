# Using Mikuru From npm

This guide explains how to use Mikuru from a published npm package in a Vite application.

## Install

Mikuru requires Node.js 22 or newer.

## Create CLI

For a new application, prefer the starter CLI:

```sh
npx mikuru create my-app
cd my-app
npm install
npm run typecheck
npm run dev
```

For a small component composition example, use the `basic` template:

```sh
npx mikuru create my-basic-app -t basic
```

List available templates:

```sh
npx mikuru --list-templates
starter - minimal Vite app
basic - component composition example
```

Preview a create run without writing files:

```sh
npx mikuru create my-app -t basic --dry-run
```

When run in a terminal, `mikuru create` asks for a project name and template if they are omitted. Use `--yes` / `-y` to skip interactive prompts and accept defaults. `mikuru create` also accepts `--template <name>` and `--force` for non-empty directories.

Generated apps include `npm run typecheck` for a quick TypeScript validation pass before running or building.

For an existing Vite application, install the package manually:

```sh
npm install mikuru
npm install -D vite typescript
```

## Configure Vite

Create or update `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { mikuru } from "mikuru/vite";

export default defineConfig({
  plugins: [mikuru()]
});
```

For debugging generated modules, enable debug mode:

```ts
import { defineConfig } from "vite";
import { mikuru } from "mikuru/vite";

export default defineConfig({
  plugins: [mikuru({ debug: true })]
});
```

## Write a Mikuru Component

Create `src/App.mikuru`:

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
```

## Mount the App

Create `src/main.ts`:

```ts
import { mount } from "./App.mikuru";

const app = document.querySelector("#app");

if (!app) {
  throw new Error("Missing #app");
}

mount(app);
```

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mikuru App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## Add TypeScript Declarations

Add this to `src/mikuru-env.d.ts` in the consuming app:

```ts
import "mikuru/env";
```

For typed wrappers or hand-written integrations, use the exported component types:

```ts
import type { MikuruComponent } from "mikuru/env";

type GreetingProps = {
  name: string;
};

declare const Greeting: MikuruComponent<GreetingProps>;
```

## Available Package Exports

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

Lower-level compiler and runtime entries are also public:

```ts
import { compile } from "mikuru/compiler";
import { effect, nextTick, ref, unwrap, watch } from "mikuru/runtime";
import type { MikuruAsyncBoundaryFallbackProps, MikuruErrorBoundaryFallbackProps, MikuruErrorInfo, MikuruErrorPhase } from "mikuru/runtime";
```

Routing helpers are available from `mikuru/router`:

```ts
import { createRouter, createWebHashHistory, provideRouter, RouterLink, RouterView, useRoute, useRouter } from "mikuru/router";
```

## Run the App

```sh
npx vite
```

For production builds:

```sh
npx vite build
```

## Notes

- Mikuru is not Vue-compatible. It supports a small Vue-like SFC subset.
- Use `ref` and `computed` from `mikuru`.
- Use `mikuru/vite` for `.mikuru` file transformation.
- Use stable `:key` values for dynamic lists.
- Import `mikuru/env` from a local `.d.ts` file when using TypeScript.
