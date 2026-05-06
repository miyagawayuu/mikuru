# Mikuru v1 API Contract

This document defines the public surface that Mikuru v1 treats as stable enough for app validation.

## Package Exports

- `mikuru`: re-exports the compiler entry and runtime reactivity helpers.
- `mikuru/compiler`: exposes `compile`, `parseSfc`, `parseTemplate`, `analyzeTemplate`, and compile error types.
- `mikuru/runtime`: exposes `ref`, `computed`, `effect`, `unwrap`, `setAttribute`, `normalizeClass`, `nextTick`, `watch`, lifecycle callbacks, and simple dependency helpers.
- `mikuru/router`: exposes `createRouter`, browser and memory histories, `RouterView`, and `RouterLink`.
- `mikuru/vite`: exposes the Vite plugin as `mikuru()` and the default export.

## SFC Contract

- `.mikuru` files use one required `<template>` block and optional `<script>` / `<style>` blocks.
- Duplicate SFC blocks and unknown SFC blocks are compile errors.
- Templates must have exactly one root element.
- `<style scoped>` supports basic selector rewriting only.

## Template Contract

Supported in v1:

- Text interpolation with `{{ expression }}`.
- DOM events with `@event` and `v-on:event`.
- Object-form events with `v-on="listeners"`.
- DOM event modifiers `.prevent` and `.stop`.
- Attribute bindings with `:name` and `v-bind:name`.
- Object-form attributes and component props with `v-bind="attrs"`.
- `v-if`, `v-else-if`, `v-else`, and `v-show`.
- `v-for` with `item in items`, `item of items`, `(item, index) in items`, and `(item, index) of items`.
- `:key` / `v-bind:key` on `v-for` for keyed DOM reuse.
- `v-model` for text input, textarea, checkbox, select, and child components.
- Default slots through `<slot />`.
- Named slots through `<slot name="header" />` and `<template #header>`.
- Slot props through bound `<slot>` attributes and simple slot scope bindings.

Unsupported in v1:

- Multiple template roots.
- `v-html`.
- Dynamic components and transitions.
- Component `v-show`.
- Full HTML parser compatibility.

## Component Contract

- Uppercase tags are treated as child components.
- Static attributes and bound props are passed through `props`.
- Component events are passed as `onEventName` props.
- Component `v-model` passes `modelValue` and `onUpdateModelValue`.
- Child component instances must return `{ element, unmount }` from `mount`.

## Router Contract

- `createRouter({ history, routes, notFound? })` creates a router with a reactive `currentRoute`.
- `createWebHistory`, `createWebHashHistory`, and `createMemoryHistory` provide navigation backends.
- Routes support static paths, dynamic params, query parsing, and hash parsing.
- `router.push`, `router.replace`, `router.back`, `router.forward`, and `router.resolve` are public navigation APIs.
- `router.beforeEach` and `router.afterEach` register navigation hooks and return unsubscribe functions.
- `RouterView` renders the matched route component and passes `route` and `router` props.
- `RouterLink` renders an anchor, supports `replace`, `activeClass`, and `exactActiveClass`, and marks exact active links with `aria-current="page"`.

## Runtime Contract

- `ref`, `computed`, and `effect` provide shallow ref-based reactivity.
- `effect(fn)` runs immediately and returns a stop function.
- `watch(source, cb)` accepts a ref-like value, getter, raw value, or array of sources and returns a stop function.
- `nextTick(fn?)` schedules an optional callback in a microtask and returns a promise.
- `onMounted`, `onBeforeUnmount`, and `onUnmounted` register callbacks with the currently mounting Mikuru component when one is active.
- `provide` and `inject` are component-tree scoped when called while a Mikuru component is mounting; child components can read values from their parent chain.

## Macro Contract

- `defineProps()` and `defineEmits()` are compile-time-only APIs.
- They must appear in top-level `const` declarations.
- `defineProps()` supports identifier binding and object destructuring.
- `defineEmits(["name"])` validates literal emit calls.
- `update:modelValue` maps to `onUpdateModelValue`.

## Compatibility Policy

- Patch releases should not remove supported syntax or change generated runtime contracts.
- Minor releases may add syntax if unsupported forms currently fail at compile time.
- Breaking changes require a major version unless they only affect behavior documented as unsupported.
- Error wording can change, but errors should retain filename, line, column, and a code frame where source is available.
