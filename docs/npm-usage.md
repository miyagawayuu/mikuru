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

Debug mode also registers mounted components with the unstable internal `globalThis.__MIKURU_DEVTOOLS__` hook. The metadata currently includes component id, component name, filename, root element, public props, fallthrough attrs, parent/children links, and mount timestamps. The hook also records component mount/unmount/error events, async pending/resolved/rejected events, hydration warning events, and router navigation/preload/error events when those modules run with a devtools hook present. Warning/error payloads now share a `diagnostic` object with `source`, `level`, `message`, optional `phase`, and available component, filename, route, error, or hydration details. Hydration warnings also include warning `kind`, recovery `action`, inferred `expected` / `actual` values, and `domPath` details in console output and `hydration:warning` event payloads. Treat this hook as experimental; it is a future devtools/debugging foundation, not a stable public API.

Generated DOM updates are synchronous by default. To opt into queued generated DOM effects, use `mikuru({ batchedUpdates: true })`. In that mode, generated DOM effects use the runtime job queue and can be awaited with `nextTick()`.

For experiments, `createDebugInspector()` can read `getComponents()` and `getEvents()`, clear event history with `clearEvents()`, and subscribe to new events with `subscribe(listener)`. `createDebugDiagnostic()` and `emitDebugDiagnostic()` are exported for custom experiments that want to emit the same diagnostic shape.

The dogfood example uses this helper in a small in-app Debug Panel with event filters, payload details, and a Router lab that emits navigation events. It remains an unstable debugging aid, not a production devtools API.

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

Lower-level compiler, runtime, and server entries are also public:

```ts
import { compile, compileHydration, compileSsr } from "mikuru/compiler";
import { effect, flushJobs, isRef, nextTick, queueJob, reactive, readonly, ref, toRef, toRefs, unref, unwrap, watch, watchEffect } from "mikuru/runtime";
import { escapeHtml, hydrateRoute, renderComponentToString, renderRouteToString, renderToStream, renderToString } from "mikuru/server";
import type { MikuruAsyncBoundaryFallbackProps, MikuruErrorBoundaryFallbackProps, MikuruErrorInfo, MikuruErrorPhase } from "mikuru/runtime";
```

`compileSsr(source)` generates an async `renderToString(props?)` module for SSR. It supports escaped text, static and bound attributes, content directives, `v-pre`, `v-cloak`, `v-if` / `v-else-if` / `v-else`, `v-for`, SSR-rendered `v-model` form control state, async child components, props, named/default slots, scoped slot props, component tree context for `provide()` / `inject()`, and Teleport collection. `renderToStream(component, props?)` exposes SSR output as an async iterable for app shells that want stream-shaped integration. `renderRouteToString(router, location, { teleports })` resolves redirects, lazy route components, route props, nested route slots, route component context, and route-level Teleport collection for router SSR.

`compileHydration(source)` generates a client module with `hydrate(target, props?)`. It reuses existing SSR DOM, attaches event listeners, syncs text plus attributes, recovers structural mismatches by remounting the component, hydrates component context/lifecycle hooks, `v-show`, DOM and component `v-model`, initial `v-if` / `v-for` DOM, Teleport target and disabled inline content, and delegates child components to `component.hydrate()` with mount fallback when unavailable. Pass `{ __mikuru_hydration: { recover: false } }` in props to keep structural mismatches as warnings without remounting or replacing the mismatched DOM. Hydration warnings include phase, component, filename, kind, action, expected/actual, and DOM path context where available.

With the Vite plugin, import `.mikuru?ssr` for the generated `renderToString()` module and `.mikuru?hydrate` for the generated hydration component. See `examples/ssr-hydration` for minimal SSR DOM reuse, `renderToStream()`, recovery-on remount behavior, and recovery-off warning-only behavior. See `examples/router-ssr-hydration` for a route tree rendered through `renderRouteToString()` and hydrated through `hydrateRoute()` using generated `<RouterView>` and `<RouterLink>` components.

SSR Teleport content is collected into a caller-provided `__mikuru_teleports` object keyed by selector, and `compileHydration()` reuses the target-side Teleport DOM when those collected fragments are inserted into the app shell. For router SSR, pass the same shape as `renderRouteToString(router, location, { teleports })` and insert `result.teleports[selector]` into the target before `hydrateRoute()`. Disabled Teleports render and hydrate inline.

`hydrateRoute(router, target, location?, options?)` hydrates an SSR-rendered route tree, resolving redirects, lazy route components, route props, route component context, and nested route slots with the same shape as `renderRouteToString()`. Pass `{ listen: true }` to start router history listening after hydration and stop it when the returned instance is unmounted.

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
- Use `ref`, `isRef`, `unref`, `toRef`, `toRefs`, `reactive`, `readonly`, and `computed` from `mikuru`.
- Use `mikuru/vite` for `.mikuru` file transformation.
- Use stable `:key` values for dynamic lists.
- Import `mikuru/env` from a local `.d.ts` file when using TypeScript.
