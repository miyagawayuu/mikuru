# Mikuru v1 API Contract

This document defines the public surface that Mikuru v1 treats as stable enough for app validation.

## Package Exports

- `mikuru`: re-exports the compiler entry, runtime reactivity helpers, and public runtime helper types.
- `mikuru/compiler`: exposes `compile`, `compileSsr`, `compileHydration`, `parseSfc`, `parseTemplate`, `analyzeTemplate`, and compile error types.
- `mikuru/runtime`: exposes `ref`, `isRef`, `unref`, `toRef`, `toRefs`, `reactive`, `readonly`, `computed`, `effect`, `unwrap`, `setAttribute`, `normalizeClass`, `queueJob`, `flushJobs`, `nextTick`, `watch`, lifecycle callbacks, simple dependency helpers, `MikuruAsyncBoundaryFallbackProps`, `MikuruErrorInfo`, `MikuruErrorPhase`, and `MikuruErrorBoundaryFallbackProps`.
- `mikuru/router`: exposes `createRouter`, browser and memory histories, router context helpers, `RouterView`, and `RouterLink`.
- `mikuru/server`: exposes `renderToString`, `renderToStream`, `renderComponentToString`, `renderRouteToString`, `hydrateRoute`, `escapeHtml`, `renderAttr`, and `renderAttrs` for SSR and hydration integrations.
- `mikuru/vite`: exposes the Vite plugin as `mikuru()` and the default export. Plugin options include `debug`, `include`, and `batchedUpdates`; `.mikuru?hydrate` and `.mikuru?ssr` imports expose hydration and SSR generated modules.

The debug-only `globalThis.__MIKURU_DEVTOOLS__` component metadata/event hook and `createDebugInspector()` helper are unstable internal infrastructure and are not part of the stable v1 API.

## SFC Contract

- `.mikuru` files use one required `<template>` block and optional `<script>` / `<style>` blocks.
- Duplicate SFC blocks and unknown SFC blocks are compile errors.
- Templates must have exactly one root element.
- `<style scoped>` supports basic selector rewriting only.

## Template Contract

Supported in v1:

- Text interpolation with `{{ expression }}`.
- DOM events with `@event` and `v-on:event`.
- Object-form events with `v-on="listeners"` and native-element option modifiers such as `v-on.once`, `v-on.capture`, and `v-on.passive`.
- DOM event modifiers `.prevent`, `.stop`, `.self`, `.once`, `.capture`, and `.passive`.
- Component event modifier `.once`.
- Attribute bindings with `:name`, `v-bind:name`, dynamic arguments, and `.prop` / `.attr` / `.camel` modifiers.
- Object-form attributes and component props with `v-bind="attrs"`, plus native-element object modifiers such as `v-bind.prop`, `v-bind.attr`, and `v-bind.camel`.
- `class` and `style` binding normalization for strings, arrays, and objects.
- Child component DOM attribute fallthrough for `class`, `style`, `id`, `title`, `role`, `aria-*`, `data-*`, and related DOM-facing attributes.
- `v-if`, `v-else-if`, `v-else`, and `v-show`.
- `v-for` with `item in items`, `item of items`, `(item, index) in items`, and `(item, index) of items`.
- `:key` / `v-bind:key` on `v-for` for keyed DOM reuse.
- `v-memo` on keyed `v-for` records, with an array expression dependency list.
- `v-once` for one-time element/component rendering and keyed `v-for` records.
- `v-model` for text input, textarea, boolean checkboxes, checkbox arrays, radio, select, multiple select, modifiers, and named child component models.
- Template refs with `ref="name"`, dynamic `:ref`, callback refs, and `v-for` ref arrays for DOM elements and child components.
- Default slots through `<slot />`.
- Named slots through `<slot name="header" />` and `<template #header>`.
- Dynamic slot names through `<slot :name="name" />`, `<template v-slot:[name]>`, and `<template #[name]>`.
- Slot props through bound `<slot>` attributes and slot scope bindings with aliases, default values, nested object destructuring, and top-level rest destructuring.
- CSS class transitions through built-in `<Transition name="fade">`, including single children, `v-if` chains, dynamic components, class override attributes, `appear` opt-out, and `mode="out-in"` for `v-if` chains.
- Keyed list transitions through built-in `<TransitionGroup name="list" tag="ul">` with one keyed `v-for` child, enter/leave class overrides, and move classes.
- Teleport through built-in `<Teleport to="#target">`, including dynamic `to` and `disabled`.
- Async boundaries through built-in `<AsyncBoundary :loading :fallback :delay :timeout>`.
- Error boundaries through built-in `<ErrorBoundary :fallback>`, including `errorInfo`, `retry`, `reset`, and `:reset-key`.
- KeepAlive through built-in `<KeepAlive>` with one dynamic `<component :is>` child, parent-lifetime caching, `include`/`exclude` name filters, and `max` LRU pruning.

Unsupported in v1:

- Multiple template roots.
- `v-html`.
- Full HTML parser compatibility.

## Component Contract

- Uppercase tags are treated as child components.
- Static attributes and bound props are passed through `props`.
- DOM-facing attributes are also applied to the root `element` returned from `mount`; `class` and `style` are merged with the root element's existing values.
- Components can read fallthrough attributes with `useAttrs()` and opt out of automatic root fallthrough with `defineOptions({ inheritAttrs: false })`.
- Template refs assign the child component instance to a ref object or callback and clean up on unmount; repeated refs inside `v-for` collect values in an array.
- Component events are passed as `onEventName` props, with `.once` wrappers when requested.
- Component `v-model` passes `modelValue`, `onUpdateModelValue`, and `modelModifiers` when modifiers are present. Named models such as `v-model:title` pass `title`, `onUpdateTitle`, and `titleModifiers` when modifiers are present.
- Dynamic `<component :is>` mounts component objects, remounts on type changes, and supports component props, events, attrs, slots, refs, and `v-show`.
- `<KeepAlive>` caches dynamic component instances across type switches, supports `include`/`exclude` string, array, and `RegExp` name filters, prunes least recently used records with `max`, runs `onActivated`/`onDeactivated` for cached generated components, and disposes the cache when the parent component unmounts.
- `defineAsyncComponent()` creates component objects from async loaders and supports loading, error, retry, timeout fallback behavior, and SSR loader resolution through `renderToString()`.
- Child component instances must return `{ element, unmount }` from `mount`.

## Router Contract

- `createRouter({ history, routes, notFound? })` creates a router with a reactive `currentRoute`.
- `defineRoutes(routes)` returns routes unchanged while preserving route name and path literals for type helpers.
- `createRouter({ parseQuery, stringifyQuery })` customizes query parsing and stringifying. `parseRouteQuery` and `stringifyRouteQuery` expose the default helpers.
- `createWebHistory`, `createWebHashHistory`, and `createMemoryHistory` provide navigation backends.
- Routes support static paths, dynamic params, optional params, repeat params, catch-all params, named routes, nested children, index children with empty paths, aliases, redirects, query parsing, and hash parsing.
- Route records can define `props` as `true`, a static object, or a route mapping function. `RouterView` passes mapped props together with built-in `route` and `router` props.
- Route records support eager components and lazy component loaders that resolve to a component or default component export.
- Lazy routes support router-level and route-level loading and error components. Error components receive the loader error in props.
- `router.preload` resolves matched lazy route components without navigating. `RouterLink` supports `preload` to preload on hover or focus.
- `route.meta` is a shallow parent-to-child merge of matched route record `meta`. `route.matched` is the final record, and `route.matchedRecords` is the full parent-to-child chain.
- `createRouter({ scrollBehavior })` supports successful browser-navigation scroll control and default hash/top scrolling. Route `meta.scroll` can provide per-route scroll behavior when no global scroll behavior is configured.
- `router.push`, `router.replace`, `router.back`, `router.forward`, `router.resolve`, `router.preload`, and `router.isReady` are public navigation APIs. Programmatic navigation resolves to a `RouteLocation` or `NavigationFailure`.
- String and path-object navigation support `./` and `../` relative paths from the current route.
- `router.addRoute`, `router.removeRoute`, and `router.hasRoute` provide dynamic route management.
- `provideRouter`, `useRouter`, and `useRoute` provide router access through component-tree context.
- `isNavigationFailure` checks duplicated, aborted, and cancelled navigation failures.
- `router.beforeEach` and `router.afterEach` register navigation hooks and return unsubscribe functions. `afterEach` receives an optional failure argument.
- `router.onError` registers an error handler for uncaught navigation, preload, and lazy route loader errors and returns an unsubscribe function.
- Route records can define `beforeEnter` as a guard or guard array. Matched route guards run parent-to-child after global `beforeEach` guards and after route redirects are resolved.
- `RouterView` renders the matched route component and passes `route` and `router` props.
- `RouterView` and `RouterLink` accept an explicit `router` prop or use the provided router context.
- `RouterLink` renders an anchor, supports default slot children, route location objects, `replace`, `preload`, `activeClass`, and `exactActiveClass`, and marks exact active links with `aria-current="page"`.
- Router type helpers include `RouteNames`, `RouteParamNames`, and `RouteLocationForName`, including optional params, repeat params, and nested parent path params.

## Runtime Contract

- `ref`, `computed`, and `effect` provide shallow ref-based reactivity. `computed` supports both read-only getters and writable `{ get, set }` refs, with lazy cached evaluation.
- `isRef`, `unref`, `toRef`, and `toRefs` provide ref interop helpers for checking, unwrapping, and preserving property reactivity through destructuring.
- `reactive(object)` and `readonly(object)` provide Proxy-based object/array reactivity with property, deletion, key iteration, and array length tracking. `isReactive`, `isReadonly`, `isProxy`, and `toRaw` expose runtime inspection helpers.
- `effect(fn)` runs immediately and returns a stop function. `effect(fn, { scheduler })` runs initially, then passes a runner to the scheduler on dependency updates.
- `queueJob(job)` schedules a deduped microtask job, `flushJobs()` drains queued jobs synchronously, and `nextTick(fn?)` waits for pending jobs before running the optional callback.
- `compile(source, { batchedUpdates: true })` and `mikuru({ batchedUpdates: true })` generate template effects with `queueJob` scheduling; the default remains synchronous.
- `watch(source, cb)` accepts a ref-like value, getter, raw value, or array of sources and returns a stop function. Watch options support `immediate` and `once`.
- `watchEffect(fn)` tracks ref-like values read during `fn`, reruns when they change, supports cleanup registration, and returns a stop function.
- `onMounted`, `onActivated`, `onDeactivated`, `onBeforeUnmount`, and `onUnmounted` register callbacks with the currently mounting Mikuru component when one is active.
- `provide` and `inject` are component-tree scoped when called while a Mikuru component is mounting; child components can read values from their parent chain.

## SSR Contract

- `compileSsr(source)` returns generated module code with `renderToString(props?)`.
- SSR supports HTML-escaped text interpolation, static attributes, `:attr` / `v-bind:attr`, object `v-bind`, content directives, `v-pre`, `v-cloak`, SSR-rendered `v-model` form control state, `v-if` / `v-else-if` / `v-else`, array-like `v-for`, sync or async child components, props, named/default slots, scoped slot props, component tree context for `provide()` / `inject()`, and Teleport collection through `props.__mikuru_teleports`.
- `mikuru/server` helpers escape text and attributes and can render a component object with `renderToString(props)`. `renderComponentToString` is the async component helper used by generated SSR output. `renderToStream` exposes rendered output as an async iterable for stream-shaped integrations.
- `renderRouteToString(router, location, { teleports })` resolves redirects, lazy route components, route props, route component context, nested route components using default slots, and route-level Teleport collection.
- `hydrateRoute(router, target, location?, options?)` resolves redirects, lazy route components, route props, route component context, and nested route components, then hydrates matched route components with `hydrate()` or mount fallback. Generated route components can use `<RouterView>` and `<RouterLink>` during SSR/hydration. `{ listen: true }` starts router history listening after hydration and stops it on unmount; `examples/router-ssr-hydration` keeps route SSR and route hydration wired together for browser E2E coverage.

## Hydration Contract

- `compileHydration(source)` emits the normal `mount(target, props?)` plus `hydrate(target, props?)`.
- Hydration reuses matching existing SSR DOM, attaches DOM event listeners, syncs text interpolation plus static and bound attributes with effects, hydrates component context/lifecycle hooks, `v-show`, DOM and component `v-model`, initial `v-if` / `v-for` DOM, reuses Teleport target and disabled inline content, and delegates child components to `component.hydrate()` with mount fallback when unavailable.
- Root mismatches warn and fall back to normal `mount`; structural child mismatches recover by remounting unless `props.__mikuru_hydration.recover === false`. With recovery disabled, structural mismatches remain warnings and hydration continues best-effort without replacing the mismatched DOM. Hydration warnings include phase, component, and filename context and emit unstable `hydration:warning` devtools events when a hook is present.
- Dynamic branch/list reconciliation after the initial state is future work.

## Macro Contract

- `defineProps()`, `defineEmits()`, `useAttrs()`, and `defineOptions()` are compile-time-only APIs.
- `defineProps()`, `defineEmits()`, and `useAttrs()` must appear in top-level `const` declarations. `defineOptions()` must appear as a top-level call expression.
- `defineProps()` supports identifier binding and object destructuring.
- `defineEmits(["name"])` validates literal emit calls.
- `useAttrs()` supports identifier binding.
- `defineOptions()` supports `{ inheritAttrs: false }`.
- `update:modelValue` maps to `onUpdateModelValue`.

## Compatibility Policy

- Patch releases should not remove supported syntax or change generated runtime contracts.
- Minor releases may add syntax if unsupported forms currently fail at compile time.
- Breaking changes require a major version unless they only affect behavior documented as unsupported.
- Error wording can change, but errors should retain filename, line, column, and a code frame where source is available.
