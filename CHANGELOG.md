# Changelog

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
