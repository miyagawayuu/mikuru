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

Use `mikuru({ batchedUpdates: true })` to opt into queued generated DOM effects. In that mode, DOM updates triggered by refs flush through the runtime job queue and can be awaited with `nextTick()`.

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
- DOM events with `@click`, `m-on:click`, inline handlers, object-form option modifiers, `.prevent`, `.stop`, `.self`, `.once`, `.capture`, `.passive`, key, mouse button, system, and `.exact` modifiers
- Component events with `@select` and `.once`
- Attribute bindings with normalized `:class` and `:style`, boolean/form property sync, direct/object `m-bind` modifiers like `.prop`, `.attr`, and `.camel`, plus dynamic arguments like `:[name]` and `@[event]`
- `m-if`, `m-else-if`, `m-else`, `m-show`, `m-for`, `m-html`, `m-text`, `m-pre`, and `m-cloak`
- `m-model` for common form controls, checkbox arrays, radio groups, multiple selects, modifiers, and named child component models
- `v-*` directive spellings remain available as compatibility aliases for existing components and Vue-oriented migrations
- Component props, events, DOM attribute fallthrough, `useAttrs`, template refs, `defineProps`, `defineEmits`, default slots, named/dynamic slots, and slot props with simple defaults
- CSS class transitions with built-in `<Transition name="fade">`, `m-if` chains, dynamic components, class overrides, `appear`, `mode="out-in"`, and `<TransitionGroup>` for keyed lists
- Built-in `<Teleport to="#target">` for rendering content outside the current DOM position
- Built-in `<AsyncBoundary :loading :fallback :delay :timeout>` for grouped async loading, delayed loading UI, boundary timeouts, and retryable async failures with aggregated fallback errors
- Built-in `<ErrorBoundary :fallback>` for local component mount, descendant event handler, lifecycle, and cleanup fallbacks, with `errorInfo`, `retry`, `reset`, and `:reset-key` recovery
- Runtime helpers including `ref`, `isRef`, `unref`, `toRef`, `toRefs`, `reactive`, `readonly`, lazy cached read-only and writable `computed`, `effect` with optional scheduling, `queueJob`/`flushJobs`, `watch`, `watchEffect` with cleanup callbacks, `nextTick`, lifecycle callbacks including KeepAlive activation hooks, `provide`, `inject`, and `defineAsyncComponent` with ErrorBoundary handoff and SSR loader resolution
- Routing through `mikuru/router` with route matching, history/hash/memory histories, guards, router context helpers, and `RouterView` / `RouterLink` across mount, SSR, and hydration
- SSR through `compileSsr()` and `mikuru/server`, covering escaped text, static and bound attributes, content directives, `m-pre`, `m-cloak`, `m-if` chains, `m-for`, async child components, props, named/default slots, scoped slot props, component tree context, Teleport collection, string and async iterable stream rendering, and router route rendering with context propagation
- Hydration through `compileHydration()` and `hydrateRoute()`, reusing existing SSR DOM while attaching events, syncing text/attributes, recovering structural mismatches with an opt-out remount fallback, hydrating component context/lifecycle hooks, `m-show`, DOM and component `m-model`, `m-pre`, `m-cloak`, initial `m-if` / `m-for` DOM, Teleport target and disabled inline content, delegating child and route components to `hydrate()` when available, and optionally starting router history listening after route hydration
- Style injection and `<style scoped>` selector rewriting for common selectors, native CSS nesting, `:global(...)`, `:deep(...)`, nested at-rules, and malformed CSS diagnostics
- Compile errors with filenames, line/column information, code frames, and typo suggestions for built-in attributes, directives, and modifiers
- Debug diagnostics with optional generated `sourceURL`, `v-*` compatibility warnings, unstable devtools metadata/events, compiler/style diagnostic locations and frames, and hydration warnings that include phase, component, and filename context

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

Compiler, runtime, and server entries are public for lower-level integrations:

```ts
import { compile, compileHydration, compileSsr, compileStyle } from "mikuru/compiler";
import { effect, isRef, nextTick, reactive, readonly, ref, toRef, toRefs, unref, unwrap, watch } from "mikuru/runtime";
import { hydrateRoute, renderComponentToString, renderRouteToString, renderToStream, renderToString } from "mikuru/server";
import type { MikuruAsyncBoundaryFallbackProps, MikuruErrorBoundaryFallbackProps, MikuruErrorInfo, MikuruErrorPhase } from "mikuru/runtime";
```

`compileStyle()` returns scoped CSS code plus non-throwing diagnostics. Malformed scoped CSS diagnostics include `offset`, `line`, `column`, and a one-line `frame`, and debug builds emit the same fields in `compiler:warning` style diagnostic events.

The package also provides the `mikuru` binary:

```sh
npx mikuru create my-app
npx mikuru create my-basic-app -t basic
npx mikuru --list-templates
```

## Transition Example

```mikuru
<template>
  <button @click="open = !open">Toggle</button>
  <Transition name="fade">
    <p m-if="open">Saved changes</p>
    <p m-else>Waiting for edits</p>
  </Transition>
</template>

<script>
const open = ref(false);
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
```

## Not Included in v1

Mikuru does not claim Vue compatibility. The v1 package does not include stable devtools or full template type checking.

Scoped CSS covers common selector rewriting, native CSS nesting, `:global(...)`, `:deep(...)`, nested at-rules such as `@media`, `@scope`, and `@starting-style`, and malformed block diagnostics. It is still not a full CSS compiler; CSS Modules and preprocessors are outside the v1 package.

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
npm run test:e2e:router-ssr-hydration
npm run test:e2e:ssr-hydration
```

Examples can be run from the repository root:

```sh
npm run dev:basic
npm run dev:realworld
npm run dev:dogfood
npm run dev:router-ssr-hydration
npm run dev:ssr-hydration
npm run dev:mikuru-sample
npm run dev:mikuru-vue-like
```

## Documentation

- `CHANGELOG.md` lists published package changes.
- `docs/npm-usage.md` shows a manual Vite setup for package consumers.
- `docs/app-architecture.md` describes how to keep larger Mikuru apps split across components, API modules, stores, forms, auth, and tests.
- `docs/router.md` documents the runtime router.
- `docs/production-readiness.md` summarizes debugging, parser, package, SSR, and hydration caveats.
- `docs/v1-api-contract.md` describes the v1 compatibility boundary used by this repository.
