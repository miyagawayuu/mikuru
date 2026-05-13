# Production Readiness Notes

Mikuru v1 is usable for experiments, demos, and small app validation. Before adopting it for production, verify the constraints below against the target app.

## Debuggability

- Compile errors include filename, line, column, and a one-line code frame.
- Built-in component attribute, directive, and modifier typos include close-match suggestions such as `Did you mean :fallback?`, `Did you mean v-model?`, and `Did you mean .prevent?`.
- The Vite plugin forwards Mikuru compile errors with `id`, `loc`, and `frame`, and falls back to a source-level location/frame for other transform-time errors.
- The Vite plugin supports `mikuru({ debug: true })`, which appends a generated `sourceURL` comment to transformed `.mikuru` modules and enables an unstable internal `globalThis.__MIKURU_DEVTOOLS__` component metadata and debug event hook. `createDebugInspector()` can read and subscribe to that hook for experiments, including `hydration:warning` events with phase, component, filename, message, kind, action, expected/actual, and DOM path payloads where available.
- The compiler returns a v3 source map with `file`, `sources`, `sourcesContent`, `names`, and generated-line mappings for template elements, interpolations, bound attributes, event handlers, script lines, and style injection. Vite forwards that map to the bundler.
- Source map segment precision is line-oriented in v1. Generated JavaScript can still be inspected when a compiler issue needs exact generated-code context.

## Parser Limits

- A template must have exactly one root element.
- The parser supports an HTML-like subset, not the full HTML parsing algorithm.
- `v-for` supports `item in items`, `item of items`, `(item, index) in items`, and `(item, index) of items`.
- `v-html` renders raw HTML and should only receive trusted or sanitized content.
- Unsupported constructs should fail at compile time instead of being ignored.

## Performance Envelope

- v1 favors correctness over fine-grained diffing.
- `v-for` refreshes the rendered range when no key is provided. With `:key` / `v-bind:key`, generated code reuses keyed DOM records and cleans up removed keys.
- CI includes a medium-list performance smoke test to catch pathological regressions, not to guarantee production latency.

## Package Usage

- CI builds `dist` and runs package smoke tests through the public exports: `mikuru`, `mikuru/compiler`, `mikuru/runtime`, and `mikuru/vite`.
- CI also runs an npm pack smoke test by installing the generated tarball into a temporary Vite app.
- Real apps should import the Vite plugin from `mikuru/vite` after publishing or linking the package.
