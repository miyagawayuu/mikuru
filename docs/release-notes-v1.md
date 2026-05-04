# Mikuru v1.0.0 Release Notes

Mikuru v1 is the first stable validation release of the compile-first Vue-like SFC framework. It keeps authoring familiar while compiling templates into direct DOM update code instead of relying on a virtual DOM.

## Highlights

- `.mikuru` single-file components with `<template>`, `<script>`, and `<style>`.
- Vite plugin support through `mikuru/vite`.
- Ref-based runtime with `ref`, `computed`, `effect`, `watch`, `nextTick`, lifecycle callbacks, `provide`, and `inject`.
- Vue-like template syntax for interpolation, DOM events, attribute bindings, `v-if`, `v-else-if`, `v-else`, `v-show`, `v-for`, and `v-model`.
- Component composition with props, events, component `v-model`, `defineProps`, `defineEmits`, and default slots.
- Keyed `v-for` record reuse with cleanup for removed DOM and component records.
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
- `examples/dogfood`: notes app written with Mikuru SFCs.
- `examples/mikuru-sample` and `examples/mikuru-vue-like`: additional hand-written DOM/runtime samples kept for comparison.

## Stability Boundary

The v1 API contract is documented in `docs/v1-api-contract.md`. Patch releases should preserve supported syntax and generated runtime contracts. Unsupported syntax should fail loudly at compile time.

## Not Included In v1

- SSR and hydration.
- Transitions and devtools.
- Named slots and slot props.
- Dynamic components.
- `v-html`.
- Object-form `v-bind` and `v-on`.
- Full Vue compatibility.
- Precise source-map segment mapping.
