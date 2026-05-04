# Mikuru Implementation Guide

This guide is for developers building applications with Mikuru. It focuses on day-to-day authoring patterns, practical constraints, and the parts of the framework that are stable enough to use in v1.

## Start With a Vite App

Use Node.js 22 or newer.

Use the Vite plugin from `mikuru/vite` and import `.mikuru` files directly.

```ts
import { defineConfig } from "vite";
import { mikuru } from "mikuru/vite";

export default defineConfig({
  plugins: [mikuru()]
});
```

For local framework development, the examples alias `mikuru` and `mikuru/runtime` to `src/`. Published applications should import from the package exports instead.

## Component Shape

A Mikuru component is a `.mikuru` single-file component with one required `<template>` block and optional `<script>` / `<style>` blocks.

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

The compiler emits a JavaScript module with `mount(target, props)` and a default component object. Instances return `{ element, unmount }`.

## State and Derived Values

Use `ref` for mutable state and `computed` for derived state.

```mikuru
<script>
import { computed, ref } from "mikuru";

const query = ref("");
const items = ref(["compiler", "runtime", "dx"]);
const visibleItems = computed(() =>
  items.value.filter((item) => item.includes(query.value))
);
</script>
```

Templates automatically unwrap refs in normal expressions, so write `{{ query }}` instead of `{{ query.value }}`.

Prefer `.value` in `<script>` code. In templates, avoid using object properties named `value` unless you intentionally want ref-style access. For ordinary data records, prefer names like `id`, `name`, `label`, or `kind`.

## Events

Use `@event` or `v-on:event` for DOM events.

```mikuru
<button @click="save">Save</button>
<form @submit.prevent="save">...</form>
<button @click.stop="select">Select</button>
```

Supported DOM event modifiers are:

- `.prevent`
- `.stop`

Event handlers can be a function reference or a simple call expression.

```mikuru
<button @click="select(item.id)">Select</button>
```

Mikuru validates event expressions as JavaScript expressions. Statements and assignments are intentionally rejected.

## Attributes and Classes

Use `:attr` or `v-bind:attr` for dynamic attributes.

```mikuru
<p :title="message">{{ message }}</p>
<article class="card" :class="{ archived: note.archived }">
  {{ note.title }}
</article>
```

`class` supports strings, numbers, arrays, and objects. Static `class` and dynamic `:class` can be combined.

`null`, `undefined`, and `false` remove attributes. `true` creates a boolean-style attribute.

## Forms and `v-model`

`v-model` supports:

- text inputs
- textareas
- checkboxes
- selects
- child components

```mikuru
<input v-model="title">
<textarea v-model="body"></textarea>
<input type="checkbox" v-model="enabled">
<select v-model="tag">
  <option value="compiler">compiler</option>
  <option value="runtime">runtime</option>
</select>
```

For child components, `v-model` passes `modelValue` and `onUpdateModelValue`.

```mikuru
<!-- Parent -->
<TextField label="Title" v-model="title" />
```

```mikuru
<!-- TextField.mikuru -->
<template>
  <label>
    <span>{{ label }}</span>
    <input v-model="draft">
  </label>
</template>

<script>
const { label, modelValue = "" } = defineProps();
const emit = defineEmits(["update:modelValue"]);
const draft = {
  get value() {
    return modelValue.value;
  },
  set value(nextValue) {
    emit("update:modelValue", nextValue);
  }
};
</script>
```

## Lists

Use `v-for` for lists.

```mikuru
<li v-for="item in items" :key="item.id">{{ item.label }}</li>
<li v-for="(item, index) of items" :key="item.id">
  {{ index + 1 }}. {{ item.label }}
</li>
```

Supported forms:

- `item in items`
- `item of items`
- `(item, index) in items`
- `(item, index) of items`

Use `:key` or `v-bind:key` when list identity matters. Keyed lists reuse DOM records across reorders and clean up removed records.

## Conditional Rendering

Use `v-if`, `v-else-if`, and `v-else` for conditional DOM creation.

```mikuru
<p v-if="loading">Loading...</p>
<p v-else-if="error">{{ error }}</p>
<p v-else>Ready</p>
```

Use `v-show` when the DOM should stay mounted and only visibility should change.

```mikuru
<aside v-show="detailsOpen">Details</aside>
```

`v-show` is not supported on child components in v1.

## Child Components

Uppercase tags are treated as child components.

```mikuru
<template>
  <NoteCard :note="note" @toggle="toggleArchive">
    <span>{{ note.tag }}</span>
  </NoteCard>
</template>

<script>
import NoteCard from "./NoteCard.mikuru";

function toggleArchive(id) {
  // update parent state
}
</script>
```

Props are passed through a plain `props` object. Bound props are generated as getters so children can observe parent updates.

Component events are passed as camel-cased handler props. For example:

- `@toggle="handle"` becomes `props.onToggle`
- `@item-select="handle"` becomes `props.onItemSelect`
- `v-model` uses `props.onUpdateModelValue`

## Props and Emits

Use `defineProps()` and `defineEmits()` as compile-time macros in top-level `const` declarations.

```mikuru
<script>
const { title, active = false } = defineProps({
  title: String,
  active: Boolean
});
const emit = defineEmits(["toggle"]);

function toggle() {
  emit("toggle");
}
</script>
```

Supported `defineProps()` forms include:

- `const props = defineProps();`
- `const { title } = defineProps();`
- `const { title: heading } = defineProps();`
- `const { active = false } = defineProps();`
- `const { count: total = 0 } = defineProps();`
- `const { title } = defineProps({ title: String });`

Unsupported in v1:

- nested destructuring
- rest props
- TypeScript type parameters
- runtime prop validation

## Slots

Mikuru supports a default slot with `<slot />`.

```mikuru
<!-- Parent -->
<Panel title="Notes">
  <p>{{ message }}</p>
</Panel>
```

```mikuru
<!-- Panel.mikuru -->
<template>
  <section>
    <h2>{{ title }}</h2>
    <slot />
  </section>
</template>
```

Named slots and slot props are not supported in v1.

## Styles

Plain `<style>` is injected once per compiled component.

Use `<style scoped>` for basic selector scoping.

```mikuru
<style scoped>
.card {
  border: 1px solid #ddd;
}
</style>
```

Scoped CSS supports common selectors, but it is not a full CSS compiler. Avoid relying on deep selectors, `:global()`, CSS Modules, or preprocessors in v1.

## Debugging

Compile errors include:

- filename
- line
- column
- a one-line code frame

For development builds, `mikuru({ debug: true })` appends a generated `sourceURL` comment to transformed `.mikuru` modules.

The compiler returns a v3 source map with `sourcesContent`, and the Vite plugin forwards that map. Segment precision is currently coarse, so generated code inspection may still be needed for complex compiler issues.

## Testing Applications

For app-level confidence, test both generated behavior and Vite integration.

Recommended checks:

```sh
npm run typecheck
npm test
npm run build
npm run test:create
npm run build:basic
npm run build:realworld
npm run build:dogfood
npm run test:package
npm run test:pack
npm run test:e2e
npm run test:e2e:dogfood
```

Use the dogfood app as a reference for practical Mikuru patterns:

- `examples/dogfood/App.mikuru`
- `examples/dogfood/TextField.mikuru`
- `examples/dogfood/NoteCard.mikuru`

## Practical Guidelines

- Keep template expressions simple.
- Prefer functions in `<script>` for non-trivial logic.
- Use `computed` for filtered or derived lists.
- Use `:key` for every dynamic list with stable identity.
- Use component `v-model` for reusable inputs.
- Keep unsupported syntax loud: do not work around compile errors with ambiguous template patterns.
- Treat `.mikuru` as a small, documented subset rather than Vue compatibility.
