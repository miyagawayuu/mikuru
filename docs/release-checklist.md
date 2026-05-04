# Mikuru v1 Release Checklist

Use this checklist before publishing a Mikuru v1 release.

## Required Verification

- Run `npm run ci`.
- Run `npm run build:mikuru-sample`.
- Run `npm run build:mikuru-vue-like`.
- Run `npm pack --dry-run` and confirm the tarball only includes package files.
- Run `npm publish --dry-run` before the real publish.

## Package Contents

The npm package should include:

- `dist`
- `templates`
- `README.md`
- `CHANGELOG.md`
- `package.json`

The package should not include:

- `src`
- `tests`
- `examples`
- `node_modules`
- `test-results`
- example `dist` directories

## Public Exports

Confirm these exports work from the packed package:

- `mikuru`
- `mikuru/compiler`
- `mikuru/runtime`
- `mikuru/vite`

## Known v1 Limits

- No SSR, hydration, transitions, or devtools.
- No Vue compatibility guarantee.
- No named slots, slot props, dynamic components, `v-html`, or object-form `v-bind` / `v-on`.
- Component `v-show` is unsupported.
- Source maps include original SFC content but have coarse segment precision.
- Scoped CSS is a basic selector rewrite, not a full CSS compiler.
- `provide` / `inject` are runtime-level helpers and are not component-tree scoped in v1.

## Release Steps

1. Confirm `package.json` has the intended `version`.
2. Confirm `repository`, `bugs`, and `homepage` metadata point to `https://github.com/miyagawayuu/mikuru`.
3. Confirm `CHANGELOG.md` and `docs/release-notes-v1.md` describe the release.
4. Run all required verification commands.
5. Run `npm publish --dry-run`.
6. Publish with `npm publish`.
7. Create the release tag and attach the release notes.

## Current Residual Warning

The CI path can emit Node's `DEP0190` warning during the npm pack smoke / Playwright path on Windows. It is currently non-fatal and does not affect the package smoke result.
