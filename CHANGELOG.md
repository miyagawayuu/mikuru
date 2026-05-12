# Changelog

## Unreleased

- Extended `<ErrorBoundary>` to catch descendant generated event handler, lifecycle callback, and cleanup errors through component tree error propagation.
- Routed `defineAsyncComponent()` loader rejections and timeouts into the nearest `<ErrorBoundary>` when no `errorComponent` is provided.

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
