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

Generated DOM effects are synchronous by default. Use `mikuru({ batchedUpdates: true })` when an app should queue generated DOM updates through the runtime job queue and observe completed DOM updates with `nextTick()`.

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

Use `ref` for mutable state and `computed` for derived state. Use `computed({ get, set })` when a derived value should also accept writes, for example as a `m-model` bridge.

```mikuru
<script>
import { computed, ref } from "mikuru";

const query = ref("");
const items = ref(["compiler", "runtime", "dx"]);
const visibleItems = computed(() =>
  items.value.filter((item) => item.includes(query.value))
);

const queryLabel = computed({
  get: () => query.value.trim(),
  set: (nextQuery) => {
    query.value = nextQuery.trim();
  }
});
</script>
```

Templates automatically unwrap refs in normal expressions, so write `{{ query }}` instead of `{{ query.value }}`.

Prefer `.value` in `<script>` code. In templates, avoid using object properties named `value` unless you intentionally want ref-style access. For ordinary data records, prefer names like `id`, `name`, `label`, or `kind`.

## Events

Use `@event` or `m-on:event` for DOM events. Use `m-on="listeners"` when an object should provide multiple DOM or component event handlers. The older `v-on` spelling remains available as a compatibility alias.

```mikuru
<button @click="save">Save</button>
<form @submit.prevent="save">...</form>
<button @click.stop="select">Select</button>
<Child @select.once="select" />
<button m-on="listeners">Select</button>
<button m-on.once="listeners">Select once</button>
```

Supported DOM event modifiers are:

- `.prevent`
- `.stop`
- `.self`
- `.once`
- `.capture`
- `.passive`

Event handlers can be a function reference or a simple call expression.

```mikuru
<button @click="select(item.id)">Select</button>
<button @click.self.once="select(item.id)">Select</button>
```

Mikuru validates event expressions as JavaScript expressions. Statements and assignments are intentionally rejected.
DOM events support `.prevent`, `.stop`, `.self`, `.once`, `.capture`, and `.passive`. `.passive` cannot be combined with `.prevent`.
Component events support `.once`. Other event modifiers are DOM-only because they rely on browser `Event` methods or listener options.
Object-form `m-on` updates listener sets reactively. Removed keys detach their previous DOM listeners, native elements support `.once`, `.capture`, and `.passive`, and component event objects are exposed as `onEventName` props.

## Attributes and Classes

Use `:attr` or `m-bind:attr` for dynamic attributes. Use `m-bind="attrs"` when an object should provide multiple DOM attributes or component props. The older `v-bind` spelling remains available as a compatibility alias.

```mikuru
<p :title="message">{{ message }}</p>
<p m-bind="attrs">{{ message }}</p>
<p m-bind.camel="attrs">{{ message }}</p>
<input type="checkbox" :indeterminate.prop="mixed">
<p :data-user-id.camel="userId">{{ message }}</p>
<article class="card" :class="{ archived: note.archived }">
  {{ note.title }}
</article>
<article :style="[{ color: tone }, { fontSize: size }]">
  {{ note.title }}
</article>
```

`class` supports strings, numbers, arrays, and objects. Static `class` and dynamic `:class` can be combined.
`style` supports strings, numbers, arrays, and objects. Object keys can be camelCase or custom CSS properties.
On child components, DOM-facing attributes fall through to the child component root element. This includes `class`, `style`, `id`, `title`, `role`, `tabindex`, `lang`, `dir`, `hidden`, `aria-*`, and `data-*` from static attributes, direct bindings, and object-form `m-bind`. `class` and `style` are merged with the root element's existing values.
Object-form `m-bind` updates attributes reactively and removes stale keys when they disappear from the bound object.
Direct, dynamic, and object-form `m-bind` arguments support `.prop`, `.attr`, and `.camel`. Use `.prop` for DOM property-only state such as `:indeterminate.prop` or `m-bind.prop="attrs"`, `.attr` when property sync should be skipped, and `.camel` when a kebab-case binding name should become camelCase.

`null`, `undefined`, and `false` remove attributes. `true` creates a boolean-style attribute.

## Forms and `m-model`

`m-model` supports:

- text inputs
- textareas
- checkboxes
- checkbox arrays
- radio groups
- selects
- multiple selects
- named child component models

```mikuru
<input m-model="title">
<textarea m-model="body"></textarea>
<input type="checkbox" m-model="enabled">
<input type="checkbox" value="compiler" m-model="selectedTags">
<input type="radio" value="draft" m-model="status">
<select m-model="tag">
  <option value="compiler">compiler</option>
  <option value="runtime">runtime</option>
</select>
<select multiple m-model="selectedTags">
  <option value="compiler">compiler</option>
  <option value="runtime">runtime</option>
</select>
```

DOM `m-model` supports `.trim`, `.number`, and `.lazy`. Checkbox models can be booleans or arrays; with arrays, the checkbox value is added or removed. Component `m-model` passes `modelModifiers` when modifiers are present, and named models pass `${propName}Modifiers`. The older `v-model` spelling remains available as a compatibility alias.

For child components, `m-model` passes `modelValue` and `onUpdateModelValue`. Named models such as `m-model:title` pass `title` and `onUpdateTitle`.

```mikuru
<!-- Parent -->
<TextField label="Title" m-model="title" />
<PanelEditor m-model:title.trim="title" m-model:checked="enabled" />
```

```mikuru
<!-- TextField.mikuru -->
<template>
  <label>
    <span>{{ label }}</span>
    <input m-model="draft">
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

Use `m-for` for lists. The older `v-for` spelling remains available as a compatibility alias.

```mikuru
<li m-for="item in items" :key="item.id">{{ item.label }}</li>
<li m-for="(item, index) of items" :key="item.id">
  {{ index + 1 }}. {{ item.label }}
</li>
```

Supported forms:

- `item in items`
- `item of items`
- `(item, index) in items`
- `(item, index) of items`

Use `:key` or `m-bind:key` when list identity matters. Keyed lists reuse DOM records across reorders and clean up removed records.

Use `m-memo` with keyed `m-for` when a reused record should skip subtree updates until selected dependencies change. The value must be an array expression.

```mikuru
<NoteCard
  m-for="note in notes"
  :key="note.id"
  m-memo="[note.id, note.updatedAt]"
  :note="note"
/>
```

Hydrated SSR lists also keep reacting after hydration. Element `m-for` rows and `<template m-for>` fragments reuse the initial SSR DOM, then create an internal update range the first time the source list changes so appended, removed, or replaced rows render with the same event and binding behavior as normal mount.

When the key is reused and the memo array is unchanged, Mikuru keeps the existing DOM/component record and does not update the generated item/index refs for that record.

Use `m-once` when a subtree should render only once. On regular elements/components, bound text, attributes, and component props are evaluated during the initial render and then left alone. On keyed `m-for` records, `m-once` behaves like an empty memo dependency list for reused records.

```mikuru
<h2 m-once>{{ staticTitle }}</h2>
<NoteCard m-for="note in notes" :key="note.id" m-once :note="note" />
```

## Conditional Rendering

Use `m-if`, `m-else-if`, and `m-else` for conditional DOM creation. The older `v-if` family remains available as a compatibility alias.

```mikuru
<p m-if="loading">Loading...</p>
<p m-else-if="error">{{ error }}</p>
<p m-else>Ready</p>
```

Use `m-show` when the DOM should stay mounted and only visibility should change.

```mikuru
<aside m-show="detailsOpen">Details</aside>
<Panel m-show="detailsOpen" />
```

Wrap one conditional child or one `m-if` chain in `<Transition>` when the DOM should animate as it enters and leaves.

```mikuru
<template>
  <Transition name="notice">
    <p m-if="saved">Saved</p>
    <p m-else>Unsaved changes</p>
  </Transition>
</template>

<style scoped>
.notice-enter-active,
.notice-leave-active {
  transition: opacity 120ms ease;
}

.notice-enter-from,
.notice-leave-to {
  opacity: 0;
}
</style>
```

Use `<TransitionGroup>` for a single keyed `m-for` child when list rows should receive enter, leave, and move classes. The built-in renders a wrapper tag, `span` by default, and supports `tag`, `name`, `enter-*`, `leave-*`, and `move-class` attributes.

```mikuru
<TransitionGroup name="row" tag="ul" move-class="row-moving">
  <li m-for="item in items" :key="item.id">{{ item.label }}</li>
</TransitionGroup>
```

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

DOM-facing attributes also fall through to the returned `element` from `mount`. `class` and `style` preserve the child root's existing values, then merge the parent component attributes on top. General props such as `message` or `count` are still passed through `props` only, so they do not become DOM attributes by default.

Component events are passed as camel-cased handler props. For example:

- `@toggle="handle"` becomes `props.onToggle`
- `@item-select="handle"` becomes `props.onItemSelect`
- `@toggle.once="handle"` wraps `props.onToggle` so it calls `handle` only once per child mount
- `m-model` uses `props.onUpdateModelValue`; `m-model:title` uses `props.onUpdateTitle`

Use `<component :is="Current" />` when the component type should come from state. `:is` must resolve to a Mikuru component object with `mount()`. When the value changes, Mikuru unmounts the previous component, cleans up its refs/fallthrough effects/slots, and mounts the next component in the same position.

```mikuru
<component :is="currentView" :message="message" @select="select">
  <template #default="{ label }">{{ label }}</template>
</component>
```

Dynamic components support the same component props, events, fallthrough attrs, slots, refs, and `m-show` behavior as explicit child component tags.

Wrap one dynamic component in `<KeepAlive>` when switching component types should preserve each component instance until the parent unmounts. The v1 built-in accepts exactly one `<component :is="...">` child and optional `include`, `exclude`, and `max` cache controls. `include` and `exclude` match the component `name`, `displayName`, `__name`, or constructor name with a comma-delimited string, array, or `RegExp`; `max` prunes the least recently used cached instance.

```mikuru
<KeepAlive :include="['ProfilePanel', /Settings/]" exclude="DraftPanel" :max="2">
  <component :is="currentPanel" />
</KeepAlive>
```

Cached generated components can register `onActivated()` and `onDeactivated()` callbacks. The first activation fires when the component is mounted inside `<KeepAlive>`, and later activations/deactivations fire when the cached instance is reinserted or detached. Async components forward activation state to the resolved child, so an async panel can still keep local state and react to cache visibility changes.

Use `defineAsyncComponent()` when the component implementation should load later. The loading fallback renders until the loader resolves, and the error fallback receives `{ error, retry }` props if the loader rejects or times out. When `errorComponent` is omitted, loader rejections and timeouts can be handled by the nearest `<ErrorBoundary>`.

```mikuru
<template>
  <AsyncPanel message="Hello" />
</template>

<script>
import { defineAsyncComponent } from "mikuru";

const AsyncPanel = defineAsyncComponent({
  loader: () => import("./Panel.mikuru"),
  loadingComponent: LoadingPanel,
  errorComponent: ErrorPanel,
  timeout: 5000
});
</script>
```

Use `<AsyncBoundary>` when multiple async children should share loading and retryable error UI. The loading component receives `{ pending }` and is refreshed as async children start or settle. Use `:delay` to avoid showing loading UI for fast async children, and `:timeout` to fail the whole boundary with `errorInfo.phase` set to `async-timeout`. The fallback component receives `{ error, errors, errorInfo, pending, retry, reset }`; `errors` contains the async failures collected before the fallback rendered.

```mikuru
<AsyncBoundary :loading="LoadingPanel" :fallback="AsyncErrorPanel" :delay="150" :timeout="5000">
  <AsyncPanel />
  <RelatedAsyncPanel />
</AsyncBoundary>
```

Type fallback props with `MikuruAsyncBoundaryFallbackProps` from `mikuru`.

```ts
import type { MikuruAsyncBoundaryFallbackProps, MikuruComponent } from "mikuru";

export const AsyncErrorPanel: MikuruComponent = {
  mount(target, props: MikuruAsyncBoundaryFallbackProps) {
    const button = document.createElement("button");
    const message = props.error instanceof Error ? props.error.message : String(props.error);
    button.textContent = `${props.errorInfo?.phase ?? "async-loader"}: ${message} (${props.errors?.length ?? 0})`;
    button.addEventListener("click", props.retry);
    target.appendChild(button);
    return { element: button, unmount() { button.remove(); } };
  }
};
```

Use `<ErrorBoundary>` around a child component when its mount, generated event handler, lifecycle callback, or cleanup error should fail into a local fallback instead of breaking the whole parent mount. The fallback component receives `{ error, errorInfo, retry, reset }`; `errorInfo` includes the reporting component, filename, phase, and boundary metadata. `retry` and `reset` both re-render the boundary child. Use `:reset-key` when an outside state change should automatically clear the fallback and remount the child.

```mikuru
<ErrorBoundary :fallback="ErrorPanel" :reset-key="route.path">
  <RiskyPanel />
</ErrorBoundary>
```

Type fallback props in regular TypeScript modules with `MikuruErrorBoundaryFallbackProps` from `mikuru`. `errorInfo.phase` is typed as `MikuruErrorPhase`, one of `runtime`, `mount`, `event`, `emit`, `mounted`, `cleanup`, `unmounted`, `async-loader`, or `async-timeout`.

```ts
import type { MikuruComponent, MikuruErrorBoundaryFallbackProps } from "mikuru";

export const ErrorPanel: MikuruComponent = {
  mount(target, props: MikuruErrorBoundaryFallbackProps) {
    const button = document.createElement("button");
    const message = props.error instanceof Error ? props.error.message : String(props.error);
    button.textContent = `${props.errorInfo?.phase ?? "runtime"}: ${message}`;
    button.addEventListener("click", props.reset);
    target.appendChild(button);
    return { element: button, unmount() { button.remove(); } };
  }
};
```

The dogfood example includes AsyncBoundary and ErrorBoundary labs that exercise async loading, retryable async fallback, `errorInfo.phase`, fallback `reset`, and `:reset-key` recovery under E2E coverage.

The SSR hydration example exercises `.mikuru?ssr`, `.mikuru?hydrate`, stream-shaped rendering, structural mismatch recovery, and recovery-disabled warning-only hydration.

Use `<Teleport>` when content should render elsewhere in the document while staying owned by the current component.

```mikuru
<Teleport to="#modal-root" :disabled="inline">
  <ModalDialog />
</Teleport>
```

## Fallthrough Attributes

Use `useAttrs()` when a component needs to read fallthrough attributes or forward them to a non-root element. Use `defineOptions({ inheritAttrs: false })` to disable automatic root fallthrough.

```mikuru
<template>
  <button class="button" m-bind="attrs">
    <slot />
  </button>
</template>

<script>
const attrs = useAttrs();
defineOptions({ inheritAttrs: false });
</script>
```

`useAttrs()` returns DOM-facing fallthrough attributes such as `class`, `style`, `id`, `title`, `role`, `aria-*`, and `data-*`. Values stay reactive for direct bindings and object-form `m-bind` from the parent. Manual forwarding uses normal `m-bind="attrs"` behavior, so `class` and `style` keep the same normalization as other attribute bindings.

## Template Refs

Use `ref="name"` to assign a DOM element or child component instance to a ref object declared in `<script>`.

```mikuru
<template>
  <input ref="inputEl">
  <li m-for="item in items" ref="itemEls">{{ item.label }}</li>
  <TextField ref="field" />
  <Dialog :ref="activeDialogRef" />
  <button :ref="captureButton">Open</button>
</template>

<script>
import { ref } from "mikuru";
import TextField from "./TextField.mikuru";

const inputEl = ref(null);
const itemEls = ref([]);
const field = ref(null);
const activeDialogRef = ref(null);
const captureButton = (el) => {
  // called with the element on mount and null on unmount
};
</script>
```

DOM refs receive the rendered element. Component refs receive the object returned from the child component's `mount`. Mikuru clears a single ref back to `null` when that element or component unmounts.

Inside `m-for`, repeated refs collect values in an array and remove stale entries during cleanup. Dynamic `:ref` can evaluate to a ref object or a callback function. Callback refs receive the value on mount and `null` on unmount.

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

Mikuru supports default slots, named slots, and simple slot props.

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

Use `<slot name="header" />` in a child component and `<template #header>` or `<template m-slot:header>` in the parent for named content. Use `:name` on `<slot>` and `m-slot:[name]` / `#[name]` when the slot name should come from an expression.

```mikuru
<!-- Parent -->
<Panel>
  <template #header="{ item: { title, meta: { tone = 'calm' } }, ...rest }">
    <h2>{{ title }}</h2>
    <p>{{ tone }} - {{ rest.detail }}</p>
  </template>
</Panel>
```

```mikuru
<!-- Panel.mikuru -->
<template>
  <section>
    <header>
      <slot name="header" :title="title" />
    </header>
    <slot :name="activeSlot" :title="title" />
    <slot />
  </section>
</template>
```

Slot scope bindings support an identifier for the whole props object, simple object destructuring, aliases, default values, nested object destructuring, and top-level rest destructuring. Array patterns, computed keys, and mixed nested patterns are intentionally rejected with compile errors.

Slot scope bindings support an identifier such as `slotProps` or object destructuring such as `{ title }`, `{ title: heading }`, `{ title = "Untitled" }`, and `{ title: heading = "Untitled" }`.

`<slot>` can also include fallback children. Mikuru renders those children only when the parent does not provide the corresponding default or named slot.

```mikuru
<slot name="header">
  <h2>Untitled</h2>
</slot>
```

## Styles

Plain `<style>` is injected once per compiled component.

Use `<style scoped>` for component-local selector scoping.

```mikuru
<style scoped>
.card {
  border: 1px solid #ddd;
}
</style>
```

Scoped CSS handles common selector lists, pseudo-classes and pseudo-elements, attribute selectors, escaped selectors, and functional pseudo-classes such as `:is(...)`, `:where(...)`, and `:not(...)` without splitting on commas inside their arguments. It scopes rules inside `@media`, `@supports`, `@container`, `@layer`, `@scope`, and unknown at-rules that contain nested CSS rules. `:global(...)` leaves a selector outside component scoping, while `:deep(...)` scopes only the parent side of a deep selector.

Comments, strings, attribute values, and `url(...)` values can contain `{`, `}`, and `,` without being treated as CSS rule delimiters. Keyframe step selectors and other raw at-rule bodies such as `@font-face`, `@page`, and `@property` are preserved instead of scoped. CSS Modules and preprocessors are still outside the v1 compiler.

## Debugging

Compile errors include:

- filename
- line
- column
- a one-line code frame

Built-in components also report unsupported attributes with suggestions when the typo is close to a supported name:

```text
Unsupported attribute ":fallbak" on <AsyncBoundary>. Did you mean :fallback?
```

Directive and modifier typos use the same style:

```text
Unsupported directive "v-modle". Did you mean m-model?
Unsupported event modifier .prevet. Did you mean .prevent?
```

For development builds, `mikuru({ debug: true })` appends a generated `sourceURL` comment to transformed `.mikuru` modules and enables an unstable internal `globalThis.__MIKURU_DEVTOOLS__` hook. Mounted debug components register component ids, component name, filename, root element, public props, fallthrough attrs, parent/children links, and mount timestamps, then unregister on unmount. The hook also records component mount/unmount/error events, style injection events, async pending/resolved/rejected events, hydration warning events, router navigation/preload/error events, compiler diagnostics, `v-*` compatibility warnings, and SSR diagnostics when those modules run with a devtools hook present. Warning/error payloads share a nested `diagnostic` object with `source`, `level`, `message`, optional `phase`, and available component, filename, route, error, or hydration details. Hydration warnings include `phase: "hydration"`, component, filename, warning message, `kind`, recovery `action`, inferred `expected` / `actual` values when available, and `domPath` in `hydration:warning` event payloads. Treat the hook as experimental debugging infrastructure rather than a stable public API.

Hydration warning payloads are meant to be scanned by humans first:

```text
kind: "element"
action: "remount"
domPath: "main > div:nth-of-type(2) > section"
expected: "<h1>"
actual: "<em>"
```

`action` is one of `mount-fallback`, `remount`, `warn-only`, or `sync-dom`. The SSR hydration example renders the collected warnings so you can see how recovery and warning-only hydration differ.

`createDebugInspector()` provides a small unstable reader for experiments: `getComponents()`, `getComponentTree()`, `getEvents()`, `getEventsByType(type)`, `clearEvents()`, and `subscribe(listener)`.

`createDebugDiagnostic(source, level, message, details)` normalizes warning/error payloads, and `emitDebugDiagnostic(source, level, message, details)` emits `${source}:${level}` events with `{ diagnostic }` payloads for custom tooling experiments.

The dogfood example enables `mikuru({ debug: true })` and includes an in-app Debug Panel that uses the inspector to display mounted components as a searchable, collapsible tree, selected props/attrs/root DOM metadata, injected style ids and scope attributes, component event counts, component-scoped event filtering, event category and text search filters, selected event component context, event-to-component selection, payload details, recent debug events, and a collapsible, copyable JSON snapshot with compact component/event state. Its Router lab emits navigation events so router debugging can be exercised without leaving the example.

The Vite plugin forwards transform failures with `id`, `loc`, and `frame`, including fallback metadata for non-standard compile-time errors. The compiler returns a v3 source map with `sourcesContent`, and generated template element, interpolation, bound attribute, event handler, and script lines map back to their original SFC lines. Generated code inspection can still help for complex compiler issues.

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
npm run build:router
npm run build:router-ssr-hydration
npm run build:ssr-hydration
npm run test:package
npm run test:pack
npm run test:e2e
npm run test:e2e:dogfood
npm run test:e2e:router
npm run test:e2e:router-ssr-hydration
npm run test:e2e:ssr-hydration
```

Use the dogfood app as a reference for practical Mikuru patterns:

- `examples/dogfood/App.mikuru`
- `examples/dogfood/TextField.mikuru`
- `examples/dogfood/NoteCard.mikuru`
- `examples/router-ssr-hydration/src/main.ts`
- `examples/ssr-hydration/src/App.mikuru`

## Practical Guidelines

- For larger applications, use `docs/app-architecture.md` as the project structure guide for component boundaries, API modules, stores, forms, auth, loading states, errors, and tests.
- Keep template expressions simple.
- Prefer functions in `<script>` for non-trivial logic.
- Use `computed` for filtered or derived lists.
- Use `:key` for every dynamic list with stable identity.
- Use component `m-model` for reusable inputs.
- Keep unsupported syntax loud: do not work around compile errors with ambiguous template patterns.
- Treat `.mikuru` as a small, documented subset rather than Vue compatibility.
