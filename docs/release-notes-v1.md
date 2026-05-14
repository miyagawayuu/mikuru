# Mikuru v1.0.0 Release Notes

Mikuru v1 is the first stable validation release of the compile-first Vue-like SFC framework. It keeps authoring familiar while compiling templates into direct DOM update code instead of relying on a virtual DOM.

## Highlights

- `.mikuru` single-file components with `<template>`, `<script>`, and `<style>`.
- Vite plugin support through `mikuru/vite`.
- Ref-based runtime with `ref`, `computed`, `effect`, `watch`, `nextTick`, lifecycle callbacks, `provide`, and `inject`.
- Mikuru-native template syntax for interpolation, DOM events, attribute bindings, `m-if`, `m-else-if`, `m-else`, `m-show`, `m-for`, and `m-model`; older `v-*` spellings remain available as compatibility aliases.
- Component composition with props, events, component `m-model`, `defineProps`, `defineEmits`, default slots, named slots, and slot props.
- CSS class transitions with built-in `<Transition name="fade">`.
- Keyed `m-for` record reuse with cleanup for removed DOM and component records.
- Built-in routing, Teleport, ErrorBoundary, AsyncBoundary, KeepAlive, Transition, and TransitionGroup helpers.
- SSR and hydration through `compileSsr()`, `compileHydration()`, `mikuru/server`, `.mikuru?ssr`, `.mikuru?hydrate`, `renderToStream()`, `renderRouteToString()`, and `hydrateRoute()`.
- Debug diagnostics with compile frames, debug `sourceURL`, `v-*` compatibility warnings, unstable devtools metadata/events, hydration warnings that include phase/component/filename context, and dogfood Debug Panel coverage for component trees, event filtering/search, event-to-component navigation, and copyable debug snapshots.
- Style injection and basic `<style scoped>` selector rewriting.
- Compile errors with filename, line, column, and code frames.
- Coarse v3 source maps with `sourcesContent` plus optional debug `sourceURL` output.

## Getting Started

Install Mikuru in a Vite app:

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

Write a component:

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

See `docs/npm-usage.md` for a full Vite setup.

## Examples

- `examples/basic`: minimal counter and component composition.
- `examples/realworld`: app-like task board with filters and keyed lists.
- `examples/dogfood`: notes app written with Mikuru SFCs, including Router, AsyncBoundary, ErrorBoundary, KeepAlive, TransitionGroup, `m-model`, and the debug inspector panel. The panel demonstrates `createDebugInspector()` with a searchable component tree, event filters/search, component root reveal, and copyable compact snapshots; its helper module is dogfood example code, not a package export.
- `examples/router`: client-side RouterView/RouterLink, aliases, redirects, guards, nested routes, dynamic routes, lazy routes, and preloading.
- `examples/router-ssr-hydration`: route SSR and route hydration with RouterView/RouterLink, redirects, guards, nested routes, lazy route components, and Teleport.
- `examples/ssr-hydration`: SSR-to-hydration example using `.mikuru?ssr`, `.mikuru?hydrate`, stream output, mismatch recovery, recovery-disabled warnings, AsyncBoundary, Teleport, and nested hydration patterns.
- `examples/mikuru-sample` and `examples/mikuru-vue-like`: additional hand-written DOM/runtime samples kept for comparison.

## Stability Boundary

The v1 API contract is documented in `docs/v1-api-contract.md`. Patch releases should preserve supported syntax and generated runtime contracts. Unsupported syntax should fail loudly at compile time.

## Not Included In v1

- Stable devtools API.
- Full Vue compatibility.
- Full template type checking.
- Precise source-map segment mapping.
- Full CSS compiler features such as CSS Modules, preprocessors, and project-level CSS transforms.
- Dynamic branch/list reconciliation after the initial hydration state.

## Next Patch Draft

The next patch release is expected to focus on scoped CSS compiler hardening, diagnostic visibility, release polish, and generated app smoke checks.

- Template discovery: `mikuru --list-templates`, template descriptions, and `-t` shorthand.
- Safer creation: interactive project/template prompts, `--yes` defaults, typo suggestions, and `--dry-run` previews.
- Generated app checks: starter/basic templates include `npm run typecheck`, `tsconfig.json`, and CSS import declarations.
- Runtime watchers: `watch(..., { immediate: true })` and cleanup callbacks for work that must be canceled before the next watcher run or stop.
- Compiler guidance: unsupported syntax, directive typos, `v-*` compatibility aliases, built-in attribute typos, and misplaced `m-slot` errors include actionable alternatives.
- Scoped CSS compiler hardening: native CSS nesting, `@starting-style`, additional raw descriptor at-rules, robust `:deep(...)` / `:global(...)` parsing, and malformed block diagnostics with offset, line, column, and one-line code frames.
- Release hygiene: template/package version drift checks, docs smoke coverage, clearer release checklist steps, and a Windows npm pack smoke warning fix.
- Debug tooling polish: dogfood-only Debug Panel helper coverage, compiler/style diagnostic detail blocks with code frames, clearer experimental devtools boundaries, and release checks for debug panel E2E behavior.
