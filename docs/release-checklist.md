# Mikuru v1 Release Checklist

Use this checklist before publishing a Mikuru v1 release.

## Required Verification

- Run `npm run ci`.
- Run `npm run build:mikuru-sample`.
- Run `npm run build:mikuru-vue-like`.
- Confirm `npm run test:templates` passes so generated templates use the package version placeholder.
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

- No SSR, hydration, or devtools.
- No Vue compatibility guarantee.
- `v-html` remains unsupported.
- Source maps include original SFC content but have coarse segment precision.
- Scoped CSS is a basic selector rewrite, not a full CSS compiler.
- `provide` / `inject` are scoped to the current component tree when called during Mikuru component mounting.

## Release Steps

1. Confirm `package.json` has the intended `version`.
2. Confirm `repository`, `bugs`, and `homepage` metadata point to `https://github.com/miyagawayuu/mikuru`.
3. Confirm `CHANGELOG.md` and `docs/release-notes-v1.md` describe the release.
4. Run all required verification commands.
5. Run `npm publish --dry-run`.
6. Publish with `npm publish`.
7. Push `master` to `origin/master`.
8. Create and push the release tag.
9. Create the GitHub Release for the release tag and attach the release notes.
10. Delete merged release or Codex work branches after `master` and the tag are confirmed.
11. Optionally verify the published package with `npx mikuru@latest create` in a disposable directory.

## Published Package Smoke

After `npm publish`, verify the package from a clean disposable app:

```sh
npx -y mikuru@<version> create <temp-app> --yes
cd <temp-app>
npm install
npm run typecheck
npm run build
```

Confirm the generated app installs, typechecks, and builds against the just-published package version.

## Current Residual Warning

The npm pack smoke test avoids Windows `shell: true` npm execution by reusing `npm_execpath` when available. If `DEP0190` appears again, check new `child_process` usage for shell execution with argument arrays.
