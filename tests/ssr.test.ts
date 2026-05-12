import { describe, expect, it } from "vitest";

import { compileSsr } from "../src/compiler/index.js";
import { escapeHtml, renderAttr, renderAttrs, renderToString } from "../src/server.js";
import { unwrap } from "../src/runtime/index.js";

describe("server rendering", () => {
  it("escapes text and attributes", () => {
    expect(escapeHtml(`<span title="x">Mikuru & SSR</span>`)).toBe("&lt;span title=&quot;x&quot;&gt;Mikuru &amp; SSR&lt;/span&gt;");
    expect(renderAttr("disabled", true)).toBe(" disabled");
    expect(renderAttr("title", `"quoted" & <tag>`)).toBe(" title=\"&quot;quoted&quot; &amp; &lt;tag&gt;\"");
    expect(renderAttr("bad name", "skip")).toBe("");
    expect(renderAttrs({ id: "app", hidden: false, "data-count": 2 })).toBe(" id=\"app\" data-count=\"2\"");
  });

  it("renders components through the server entry", async () => {
    expect(renderToString({ renderToString: () => "<p>ok</p>" })).toBe("<p>ok</p>");
    await expect(renderToString(async () => "<p>async</p>")).resolves.toBe("<p>async</p>");
  });

  it("compiles static SSR output with expressions, attrs, branches, and loops", () => {
    const result = compileSsr(`<template>
  <section class="card" :data-count="items.length">
    <h1>{{ title }}</h1>
    <p v-if="ready">Ready & {{ unsafe }}</p>
    <p v-else>Waiting</p>
    <ul>
      <li v-for="(item, index) in items" :data-index="index">{{ item.label }}</li>
    </ul>
  </section>
</template>

<script>
const title = "SSR <phase>";
const ready = true;
const unsafe = "<script>";
const items = [{ label: "one" }, { label: "two & more" }];
</script>`, { filename: "SsrCard.mikuru" });

    const render = loadSsrRender(result.code);

    expect(render()).toBe("<section class=\"card\" data-count=\"2\"><h1>SSR &lt;phase&gt;</h1><p>Ready &amp; &lt;script&gt;</p><ul><li data-index=\"0\">one</li><li data-index=\"1\">two &amp; more</li></ul></section>");
  });

  it("keeps SSR compile output importable from the public compiler entry", () => {
    const result = compileSsr(`<template><main id="app">{{ message }}</main></template><script>const message = "hello";</script>`);

    expect(result.code).toContain("import { escapeHtml as __mikuru_escape");
    expect(result.code).toContain("export function renderToString");
    expect(result.bindings).toContainEqual({ type: "text", expression: "message" });
  });

  it("keeps sibling v-for temporary variables unique", () => {
    const result = compileSsr(`<template>
  <section>
    <p v-for="item in first">{{ item }}</p>
    <span v-for="item in second">{{ item }}</span>
  </section>
</template>
<script>
const first = ["a"];
const second = ["b"];
</script>`);

    const render = loadSsrRender(result.code);

    expect(render()).toBe("<section><p>a</p><span>b</span></section>");
  });
});

function loadSsrRender(code: string): () => string {
  const executable = code
    .replace("import { escapeHtml as __mikuru_escape, renderAttr as __mikuru_renderAttr, renderAttrs as __mikuru_renderAttrs } from \"mikuru/server\";", "const __mikuru_escape = helpers.escapeHtml; const __mikuru_renderAttr = helpers.renderAttr; const __mikuru_renderAttrs = helpers.renderAttrs;")
    .replace("import { unwrap as __mikuru_unwrap } from \"mikuru/runtime\";", "const __mikuru_unwrap = helpers.unwrap;")
    .replace("export function renderToString", "function renderToString");
  const factory = new Function("helpers", `${executable}\nreturn renderToString;`) as (helpers: {
    escapeHtml: typeof escapeHtml;
    renderAttr: typeof renderAttr;
    renderAttrs: typeof renderAttrs;
    unwrap: typeof unwrap;
  }) => () => string;
  return factory({ escapeHtml, renderAttr, renderAttrs, unwrap });
}
