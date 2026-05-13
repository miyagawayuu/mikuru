# Changelog

## Unreleased

- Generalized component slot hydration to pass default, named, dynamic, and scoped slots through `props.children` and `props.slots`.
- Improved SSR component slots so dynamic slot names support scoped props and explicit default slot templates are exposed through `props.children`.
- Added async component hydration delegation so SSR-rendered async children inside `<AsyncBoundary>` can be reused after streaming SSR.
- Improved async component hydration fallback handling for loader errors, timeouts, and retry recovery.

## 1.0.21 - 2026-05-13

- Added SSR and hydration support for initial `<ErrorBoundary>` children.
- Added SSR and hydration support for initial `<Transition>` children and v-if chains.
- Added SSR and hydration support for initial `<TransitionGroup>` keyed lists.
- Added hydration structural mismatch recovery with a remount fallback.
- Added `renderToStream()` for async iterable SSR output.
- Added SSR loader resolution and error fallback rendering for `defineAsyncComponent()`.
- Added Vite `.mikuru?ssr` and `.mikuru?hydrate` imports plus an SSR/hydration example and recovery E2E coverage.
- Added recovery-disabled E2E coverage plus nested built-in wrapper SSR/hydration tests.
- Added a router SSR/hydration example and browser E2E coverage for route rendering, hydration, redirects, guards, nested routes, and lazy route components.
- Added SSR and hydration support for generated `<RouterView>` and `<RouterLink>` usage in route components.
- Added hydration slot forwarding for component children so SSR-rendered `<RouterLink>` child content is preserved during hydration.
- Expanded RouterLink SSR/hydration E2E coverage for custom active classes, replace links, and child content.
- Stabilized the dogfood Debug Panel event clearing flow in browser E2E runs.

## 1.0.20 - 2026-05-13

- Added SSR phase 1 with `compileSsr()` and `mikuru/server` helpers for escaped HTML, attributes, `v-if` chains, and `v-for` output.
- Added SSR child component rendering with props and default slot projection.
- Added async SSR child rendering plus named and scoped SSR slots.
- Added SSR support for dynamic `<component :is>` rendering with component props and slots.
- Added SSR and hydration support for initial `<KeepAlive><component :is>` children.
- Added SSR and hydration support for initial `<AsyncBoundary>` children.
- Added `renderRouteToString()` for router SSR with redirects, lazy route components, nested route slots, and route props.
- Added hydration phase 1 with `compileHydration()` for existing DOM reuse, event attachment, and text/attribute sync.
- Improved hydration mismatch diagnostics with expected/actual node details and extra-node warnings.
- Added hydration support for initial dynamic `<component :is>` branches with mount fallback.
- Added hydration static attribute mismatch diagnostics for SSR/client drift.
- Added hydration text content mismatch diagnostics before text nodes are synchronized.
- Added hydration `v-html` / `v-text` content mismatch diagnostics before content directives are synchronized.
- Added hydration `v-model` DOM property mismatch diagnostics before form controls are synchronized.
- Added hydration multiple-select `v-model` mismatch diagnostics before option selections are synchronized.
- Added object-valued `option :value` support for select, multiple select, checkbox, and radio `v-model` bindings.
- Added hydration support for initial `v-if` / `v-for` DOM reuse and child component `hydrate()` delegation with mount fallback.
- Added `hydrateRoute()` for router hydration with redirects, lazy route components, route props, nested route slots, and mount fallback.
- Added SSR Teleport collection and Teleport hydration for target-side DOM reuse.
- Added disabled Teleport SSR hydration for inline Teleport content reuse.
- Added dynamic disabled Teleport SSR hydration without shifting sibling hydration.
- Added SSR component tree context so generated SSR components can scope `provide()` / `inject()` and pass context to child components.
- Added router SSR and route hydration context propagation, including provided router access for route components.
- Added `hydrateRoute(..., { listen: true })` to start browser/router history listening after route hydration and stop it on unmount.
- Added hydration support for `v-show` and DOM `v-model` controls, including checkbox arrays and multiple selects.
- Improved hydration event handling so DOM event modifiers and object-form `v-on` option modifiers are applied during listener attachment.
- Added hydration support for child component `v-model` props, update handlers, named models, and modifiers.
- Added hydration support for DOM and component template refs, including `v-for` array refs and unmount cleanup.
- Improved hydration attribute reconciliation so static classes survive dynamic `:class` updates and object `v-bind` removes stale attrs.
- Improved class/style normalization across SSR, mount, and hydration so static styles survive dynamic `:style` and object `v-bind` updates.
- Added `v-html` and `v-text` content directives across generated DOM, SSR, and hydration.
- Added `v-pre` and `v-cloak` support across generated DOM, SSR, and hydration.
- Added dynamic template arguments with `:[name]`, `v-bind:[name]`, `@[event]`, and `v-on:[event]`.
- Added object-form `v-on.once`, `v-on.capture`, and `v-on.passive` option modifiers for native elements.
- Added `v-bind` modifiers `.prop`, `.attr`, and `.camel` for native element attribute/property control.
- Added object-form `v-bind.prop`, `v-bind.attr`, and `v-bind.camel` modifiers for native elements.
- Added DOM event key and system modifiers such as `@keydown.enter` and `@keydown.ctrl.enter`.
- Added DOM mouse button and exact modifiers such as `@click.right` and `@click.ctrl.exact`.
- Added inline DOM event handler assignments such as `@click="count += 1"` and `$event` usage.
- Improved boolean and form property bindings so `disabled`, `checked`, `selected`, and `value` sync DOM properties while non-boolean `false` renders as `"false"`.
- Added hydration component context for scoped `provide()` / `inject()`, lifecycle callbacks, and child component context forwarding.
- Added `isRef()`, `unref()`, `toRef()`, and `toRefs()` runtime ref interop helpers.
- Added built-in `<AsyncBoundary>` for grouped async loading and retryable async failures.
- Extended `<AsyncBoundary>` to support multiple child nodes with live `pending` updates.
- Added `<AsyncBoundary :delay :timeout>` for delayed loading UI and boundary-level async timeouts.
- Added `errors` to `MikuruAsyncBoundaryFallbackProps` so async fallbacks can inspect aggregated failures.
- Improved compile diagnostics for built-in component attribute typos with `Did you mean ...?` suggestions.
- Improved compile diagnostics for directive and event/model modifier typos with close-match suggestions.
- Improved Vite transform error forwarding so fallback compile-time errors include `id`, `loc`, and `frame`.
- Improved generated source maps for template element, interpolation, bound attribute, event handler, and script lines.
- Added an unstable debug-only `globalThis.__MIKURU_DEVTOOLS__` component metadata hook for future devtools experiments.
- Extended the unstable debug hook with component ids, props/attrs metadata, parent-child links, and component, async, and router event records.
- Added an unstable `createDebugInspector()` helper for reading debug components/events, clearing event history, and subscribing to debug events.
- Added a dogfood Debug Panel that uses `createDebugInspector()` to show mounted components, selected props/attrs, and the debug event log.
- Extended the dogfood Debug Panel with event category filters, selected event payload details, and a Router lab that emits navigation events.
- Added keyed `v-for` `v-memo` support to skip updating reused records while memo dependencies are unchanged.
- Added `v-once` support for one-time element/component rendering and keyed `v-for` records.
- Extended `v-model` with named component models, named model modifiers, and checkbox array support.
- Added writable `computed({ get, set })` refs and `watch(..., { once: true })` callbacks.
- Changed `computed` to evaluate lazily and cache values until dependencies change.
- Added `reactive()`, `readonly()`, `isReactive()`, `isReadonly()`, `isProxy()`, and `toRaw()` runtime helpers.
- Added `watchEffect()` with cleanup registration and `effect(fn, { scheduler })` for scheduled reruns.
- Added `queueJob()`, `flushJobs()`, and job-aware `nextTick()` for deduped microtask scheduling.
- Added `mikuru({ batchedUpdates: true })` and `compile(..., { batchedUpdates: true })` for opt-in queued generated DOM updates.
- Added built-in `<TransitionGroup>` for keyed list enter, leave, and move classes.
- Added minimal built-in `<KeepAlive>` support for caching a single dynamic `<component :is>` child.
- Extended `<KeepAlive>` with `:include`, `:exclude`, and `:max` cache controls.
- Added `onActivated()` and `onDeactivated()` lifecycle hooks for cached `<KeepAlive>` components, including async component forwarding.
- Added a dogfood AsyncBoundary lab and E2E coverage for loading and retryable async fallback.
- Added a dogfood ErrorBoundary lab and E2E coverage for diagnostics, fallback reset, and `:reset-key` recovery.
- Exported `MikuruErrorBoundaryFallbackProps` for typed ErrorBoundary fallback components.

## 1.0.19 - 2026-05-12

- Extended `<ErrorBoundary>` to catch descendant generated event handler, lifecycle callback, and cleanup errors through component tree error propagation.
- Routed `defineAsyncComponent()` loader rejections and timeouts into the nearest `<ErrorBoundary>` when no `errorComponent` is provided.
- Added `<ErrorBoundary :reset-key>` and a fallback `reset` prop for clearer recovery flows.
- Added ErrorBoundary fallback diagnostics through `errorInfo` with component, filename, phase, and boundary metadata.
- Exported `MikuruErrorInfo` and `MikuruErrorPhase` types and documented typed ErrorBoundary fallback props.

## 1.0.18 - 2026-05-12

- Added built-in `<ErrorBoundary>` with fallback component rendering and retry.
- Added async component retry and timeout fallback coverage.
- Added `appear` opt-out and `mode="out-in"` support for `<Transition>` v-if chains.

## 1.0.17 - 2026-05-12

- Added built-in `<Teleport>` with `to` and `disabled` support.
- Added `defineAsyncComponent()` with loading and error fallback components.
- Added dogfood examples and E2E coverage for Teleport and async component loading.

## 1.0.16 - 2026-05-12

- Added lazy route component support for `mikuru/router`.
- Added loading and error fallback components for lazy routes.
- Added route-level `beforeEnter` guards for `mikuru/router`.
- Added route component props mapping and `router.onError()` for `mikuru/router`.
- Added optional, repeat, and catch-all route params for `mikuru/router`.
- Added lazy route preloading and capped navigation guard redirects for `mikuru/router`.
- Improved router index route matching and coverage for redirects, guards, and not found rendering.
- Added relative path navigation for `mikuru/router`.
- Added typed route helpers for `mikuru/router`.
- Expanded router typed helpers for optional, repeat, and nested params.
- Added `router.isReady()`, per-route `meta.scroll`, and custom query parsing/stringifying for `mikuru/router`.
- Added DOM event modifiers `.self`, `.once`, `.capture`, and `.passive`.
- Added component event `.once` modifiers.
- Added dynamic components with `<component :is="Current">`, including props, events, attrs, slots, refs, `v-show`, and cleanup on switch.
- Added built-in `<Transition>` with CSS class enter and delayed leave handling for single children, `v-if` chains, and dynamic components.
- Added a basic example Transition demo with E2E coverage.
- Added practical Transition CSS examples to README and docs.
- Formalized object-form `v-bind` and `v-on` coverage for DOM elements, child components, and manual attrs forwarding.
- Added component `v-show`.
- Added radio, multiple select, and `.trim` / `.number` / `.lazy` modifier support for `v-model`.
- Added normalized `style` bindings for strings, arrays, and objects.
- Added child component DOM attribute fallthrough, including `class`, `style`, `id`, `title`, `role`, `aria-*`, and `data-*`, to the component root element.
- Added `useAttrs()` and `defineOptions({ inheritAttrs: false })` for manual fallthrough attribute forwarding.
- Added template refs with `ref="name"`, dynamic `:ref`, callback refs, and `v-for` ref arrays for DOM elements and child component instances.
- Added dynamic slot names for `<slot :name>`, `<template v-slot:[name]>`, and `<template #[name]>`.
- Added default values, nested object destructuring, top-level rest destructuring, and clearer errors for slot scope destructuring.

## 1.0.15 - 2026-05-07

- Added named route navigation, nested routes, and RouterLink default slot support.
- Added router route redirects and aliases.
- Added router navigation failure results for duplicated, aborted, and cancelled navigations.
- Added dynamic router route management with `addRoute`, `removeRoute`, and `hasRoute`.
- Added parent-to-child route meta merging for nested routes and guard usage.
- Added router context helpers with `provideRouter`, `useRouter`, and `useRoute`, making `RouterView` and `RouterLink` router props optional.
- Added router `scrollBehavior` support with default browser hash and top scrolling.

## 1.0.14 - 2026-05-06

- Added `mikuru/router` with route matching, hash/history/memory histories, guards, `RouterView`, and `RouterLink`.
- Added a router example app with E2E coverage.
- Added generated DOM router integration coverage plus `RouterLink` `replace`, `activeClass`, and `exactActiveClass` props.

## 1.0.13 - 2026-05-06

- Added component-tree scoped `provide` / `inject` during Mikuru component mounting.
- Expanded runtime helper import coverage for `.mikuru` scripts.
- Documented the post-publish generated app smoke check in the release checklist.

## 1.0.12 - 2026-05-06

- Added a `watch` cleanup usage example to the basic example app.
- Added a basic example E2E smoke test for `watch` cleanup behavior.
- Fixed generated scripts so runtime helpers imported from `mikuru` or `mikuru/runtime`, such as `watch` and `onBeforeUnmount`, stay available after compile-time import normalization.

## 1.0.11 - 2026-05-06

- Improved unsupported template syntax errors with actionable alternatives for `v-html`, dynamic components, and misplaced `v-slot`.
- Added `watch(..., { immediate: true })` for runtime watchers that need an initial callback.
- Added `watch` cleanup callbacks that run before the next watcher callback and when the watcher is stopped.
- Documented watcher cleanup and unsupported template syntax guidance in the README and docs.

## 1.0.10

### Added

- Added template discovery with `mikuru --list-templates`, `mikuru create --list-templates`, template descriptions, and `mikuru create -t <name>`.
- Added interactive `mikuru create` prompts for missing project name/template values, with `--yes` / `-y` defaulting for non-interactive runs.
- Added `mikuru create --dry-run` to preview the target, selected template, and generated files without writing them.
- Added generated app `npm run typecheck` scripts, template `tsconfig.json` files, and CSS module declarations.
- Added template version, generated app typecheck, docs smoke, and package smoke coverage for the create flow.

### Changed

- Made generated project templates use the installed Mikuru package version instead of hard-coded release versions.
- Improved `mikuru create .` output so it does not print an unnecessary `cd .` next step.
- Split create-template metadata out of the CLI entrypoint to keep future CLI options easier to add.
- Clarified release checklist steps for pushing `master`, pushing tags, creating GitHub Releases, and deleting merged work branches.

### Fixed

- Added friendlier unknown-template errors with typo suggestions such as `Did you mean starter?`.
- Removed the Windows npm pack smoke path that triggered Node's `DEP0190` shell warning.

## 1.0.9

- Updated generated project templates to depend on Mikuru `^1.0.9`.

## 1.0.8

- Added a realworld app architecture guide and split the realworld example into page, feature, API, store, UI, and test layers.
- Added realworld routing, auth guard, 404 page, form validation helper, and API auth header examples.
- Expanded realworld E2E coverage for task interactions, validation, protected routes, and missing routes.
- Added object-form `v-bind` and `v-on` support for DOM elements and child components.

## 1.0.7

- Added fallback children for `<slot>` outlets when no matching parent slot is provided.
- Kept fallback slot content reactive and covered cleanup behavior through generated DOM tests.
- Documented fallback slot behavior alongside named slots and slot props.

## 1.0.6

- Added named slots with `<slot name="...">`, `<template #name>`, and `<template v-slot:name>`.
- Added simple slot props with identifier and object destructuring scope bindings.
- Updated v1 docs and release notes to list named slots and slot props as supported.

## 1.0.5

- Added a `basic` project template for `mikuru create --template basic`.
- Added `mikuru create --force` and `--yes` support.
- Added generated starter and basic template build smoke coverage for packed packages.
- Added generic `MikuruComponent<Props>` and `MikuruMount<Props>` types.

## 1.0.4

- Added a starter favicon to projects created with `mikuru create`.
- Added CLI `--version`, create help, `--template starter`, and clearer create errors.

## 1.0.3

- Added `mikuru/env` for package-provided `.mikuru` TypeScript declarations.

## 1.0.2

- Reworked the README for npm package consumers with CLI-first setup, Vite integration, package exports, TypeScript declarations, and v1 limits.
- Updated npm usage docs and release documentation to match the published package contents.
- Updated the starter template to depend on `mikuru@^1.0.2`.

## 1.0.1

- Added the `mikuru` CLI with `mikuru create [project-name]`.
- Added a Vite starter template that shows a Mikuru welcome screen and counter after setup.
- Added create CLI smoke coverage and included it in CI.

## 1.0.0

- Stabilized the v1 SFC compiler surface for `.mikuru` files.
- Added Vite integration, generated DOM cleanup, component props/events/slots, `defineProps`, and `defineEmits`.
- Added `v-if` / `v-else-if` / `v-else`, `v-show`, `v-for`, `v-model`, DOM event modifiers, style injection, and basic scoped CSS support.
- Added CI, library build checks, basic example build checks, and browser E2E coverage.
- Added a realworld example, public package smoke test, parser-limit coverage, debug sourceURL support, and performance smoke coverage.
- Added v3 source maps, keyed `v-for` reuse, npm pack smoke coverage, and a v1 API contract.
- Added a dogfood notes app written in Mikuru to exercise daily authoring flows.
- Added generated DOM coverage for keyed insert/remove/reorder behavior, component cleanup, and slot cleanup.
- Added explicit unsupported-syntax errors with source frames, Vite error forwarding coverage, and debug `sourceURL` path normalization coverage.
- Documented runtime helpers including `nextTick`, `watch`, lifecycle callbacks, `provide`, and `inject`.
