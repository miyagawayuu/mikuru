# Mikuru v1.0.0 Release Notes

Mikuru v1 is the first stable validation release of the compile-first Vue-like SFC framework. It keeps authoring familiar while compiling templates into direct DOM update code instead of relying on a virtual DOM.

## Highlights

- `.mikuru` single-file components with `<template>`, `<script>`, and `<style>`.
- Vite plugin support through `mikuru/vite`.
- Ref-based runtime with `ref`, `computed`, `effect`, `watch`, `nextTick`, lifecycle callbacks, `provide`, and `inject`.
- Mikuru-native template syntax for interpolation, DOM events, attribute bindings, `m-if`, `m-else-if`, `m-else`, `m-show`, `m-for`, and `m-model`; older `v-*` spellings remain available as compatibility aliases.
- Component composition with props, events, component `m-model`, `defineProps`, `defineEmits`, default slots, named slots, and slot props.
- Optional TypeScript template type checking through the compiler and Vite plugin, with script binding, prop, ref unwrap, and `m-for` scope checks.
- CSS class transitions with built-in `<Transition name="fade">`.
- Keyed `m-for` record reuse with cleanup for removed DOM and component records.
- Built-in routing, Teleport, ErrorBoundary, AsyncBoundary, KeepAlive, Transition, and TransitionGroup helpers.
- SSR and hydration through `compileSsr()`, `compileHydration()`, `mikuru/server`, `.mikuru?ssr`, `.mikuru?hydrate`, `renderToStream()`, `renderRouteToString()`, and `hydrateRoute()`.
- Stable devtools diagnostics with compile frames, debug `sourceURL`, `v-*` compatibility warnings, versioned metadata/events, hydration warnings that include phase/component/filename context, and dogfood Debug Panel coverage for component trees, event filtering/search, event-to-component navigation, and copyable debug snapshots.
- Style injection and basic `<style scoped>` selector rewriting.
- Compile errors with filename, line, column, and code frames.
- v3 source maps with `sourcesContent`, template/script/style line mappings, and generated-column segments for common template expressions, attributes, event handlers, and script/style lines.

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
- `examples/dogfood`: notes app written with Mikuru SFCs, including Router, AsyncBoundary, ErrorBoundary, KeepAlive, TransitionGroup, `m-model`, original video/audio player components, and the debug inspector panel. The panel demonstrates `createDebugInspector()` with a searchable component tree, event filters/search, component root reveal, and copyable compact snapshots; its helper module is dogfood example code, not a package export.
- `examples/router`: client-side RouterView/RouterLink, aliases, redirects, guards, nested routes, dynamic routes, lazy routes, and preloading.
- `examples/router-ssr-hydration`: route SSR and route hydration with RouterView/RouterLink, redirects, guards, nested routes, lazy route components, and Teleport.
- `examples/ssr-hydration`: SSR-to-hydration example using `.mikuru?ssr`, `.mikuru?hydrate`, stream output, mismatch recovery, recovery-disabled warnings, AsyncBoundary, Teleport, and nested hydration patterns.
- `examples/mikuru-sample` and `examples/mikuru-vue-like`: additional hand-written DOM/runtime samples kept for comparison.

## Stability Boundary

The v1 API contract is documented in `docs/v1-api-contract.md`. Patch releases should preserve supported syntax and generated runtime contracts. Unsupported syntax should fail loudly at compile time.

## Patch 1.0.28

- Adds package-exported `MikuruVideoPlayer.mikuru`, `MikuruAudioPlayer.mikuru`, `MikuruImageViewer.mikuru`, `MikuruModal.mikuru`, `MikuruCarousel.mikuru`, `MikuruToast.mikuru`, `MikuruDropdown.mikuru`, `MikuruToolTip.mikuru`, `MikuruProgress.mikuru`, and `MikuruCodeBlock.mikuru` components that exercise template refs, lifecycle callbacks, component events, slots, computed styles, pointer handling, fullscreen, progress states, clipboard actions, and keyboard-accessible custom controls.
- Updates the video player with overlay controls, Font Awesome-shaped mask icons, auto-hidden controls while playback continues outside hover, div-based seeking, stop, rate, mute, and fullscreen controls.
- Fixes Vite-routed component CSS cache behavior by keying style virtual module URLs from compiled style content, so scoped CSS changes reload with the matching generated DOM scope.
- Adds compiler tests for content-keyed Vite style requests to prevent stale virtual CSS modules from returning after repeated transforms of the same SFC path.

## Not Included In v1

- Full Vue compatibility.
- Dynamic branch/list reconciliation after the initial hydration state.

## Next Patch Draft

The next patch release is expected to focus on additional app examples, scoped CSS compiler hardening, diagnostic visibility, and release polish.
