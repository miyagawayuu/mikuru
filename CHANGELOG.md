# Changelog

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
