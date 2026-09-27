# Security review: Mikuru 1.0.41

Reviewed on 2026-10-24. Scope: npm dependencies, compiler output, DOM bindings, SSR attribute rendering, router query parsing, CLI template handling, and packaged HTML/embed components. This is a targeted source review and regression check, not a guarantee that all vulnerabilities have been found.

## Fixed findings

- Inline event attributes could be serialized by SSR or installed by DOM bindings. Both paths now reject `on*` names and malformed attribute names. Event directives remain supported.
- Forced DOM property bindings could replace an element's prototype. `__proto__`, `constructor`, and `prototype` property assignments are now rejected.
- Prototype-like URL query keys could read inherited values and replace the query object's prototype. Parsing now reads only own properties and creates keys with `Object.defineProperty`.
- Generic embed player URLs could contain executable schemes. All final iframe URLs now require HTTP or HTTPS.
- WYSIWYG sanitization left SVG links, document metadata, forms, and other active HTML outside its denylist. It now allows only HTML formatting elements and specific attributes, retaining URL validation and safe link targets.
- The initial npm audit reported six affected packages (four high, two moderate): `happy-dom`, `vite`, `vitest`, `@vitest/mocker`, `source-map-js`, and `ws`. Dependency updates and the refreshed lockfile reduce the audit count to zero.

Dependency advisory references are recorded in the local audit log. Examples: [Happy DOM code execution](https://github.com/advisories/GHSA-834v-8h66-3h79), [source-map-js denial of service](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

## Verification

- Six added security regression cases failed before the corresponding fixes and pass afterward.
- `npm run ci` passed, including type checking, unit tests, example builds, package smoke tests, and 17 Playwright cases across six configurations.
- After the final component fixes, type checking and all 476 unit tests passed. Documentation checks, both additional sample builds, packed-package smoke tests, and all 10 dogfood Playwright cases also passed.
- Final `npm audit` reported zero vulnerabilities. `npm publish --dry-run` passed; authentication is required for actual npm publication.
- Local logs are under `.scratch/security-1.0.41/` and are excluded from the release commit.

## Trust boundaries

Application templates and scripts remain trusted code. Raw `m-html`, explicit `innerHTML` bindings, application URL bindings, and iframe content require appropriate input validation by the consuming application. WYSIWYG input now drops unsupported tags, attributes, and inline styles; applications relying on those formats must adapt.
