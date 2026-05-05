import { describe, expect, it } from "vitest";

import { analyzeTemplate, compile, MikuruCompileError, parseSfc, parseTemplate } from "../src/compiler/index.js";
import { mikuru } from "../src/vite.js";

const counterSource = `<template>
  <button @click="increment">count: {{ count }}</button>
</template>

<script>
import { ref } from "mikuru";

const count = ref(0);

function increment() {
  count.value += 1;
}
</script>`;

describe("compiler", () => {
  it("parses SFC blocks", () => {
    const descriptor = parseSfc(counterSource, "Counter.mikuru");

    expect(descriptor.template).toContain("@click");
    expect(descriptor.script).toContain("const count");
  });

  it("parses scoped style blocks", () => {
    const descriptor = parseSfc(`<template><p>Hello</p></template><style scoped>p { color: red; }</style>`);

    expect(descriptor.styleScoped).toBe(true);
    expect(descriptor.style).toBe("p { color: red; }");
  });

  it("parses template roots", () => {
    const ast = parseTemplate(`<button @click="increment">count: {{ count }}</button>`);

    expect(ast.tag).toBe("button");
    expect(ast.attrs).toContainEqual(expect.objectContaining({ name: "@click", value: "increment" }));
  });

  it("ignores HTML comments and keeps one meaningful root", () => {
    const ast = parseTemplate(`<!-- ignored --><section>content</section><!-- also ignored -->`);

    expect(ast.tag).toBe("section");
  });

  it("parses quoted angle brackets and single-quoted attributes", () => {
    const ast = parseTemplate(`<button title='1 > 0' @click='increment'>Compare</button>`);

    expect(ast.attrs).toContainEqual(expect.objectContaining({ name: "title", value: "1 > 0" }));
    expect(ast.attrs).toContainEqual(expect.objectContaining({ name: "@click", value: "increment" }));
  });

  it("treats void elements as self-closing", () => {
    const ast = parseTemplate(`<section><input v-model="name"><br><p>{{ name }}</p></section>`);

    expect(ast.children.filter((child) => child.type === "element").map((child) => child.tag)).toEqual([
      "input",
      "br",
      "p"
    ]);
  });

  it("analyzes long-form event and attribute directives", () => {
    const ast = parseTemplate(`<button v-on:click="increment" v-bind:class="className">Add</button>`);

    expect(analyzeTemplate(ast)).toEqual([
      { type: "event", event: "click", handler: "increment" },
      { type: "attribute", name: "class", expression: "className" }
    ]);
  });

  it("analyzes event modifiers", () => {
    const ast = parseTemplate(`<form @submit.prevent="save"><button v-on:click.stop="select">Select</button></form>`);

    expect(analyzeTemplate(ast)).toContainEqual({
      type: "event",
      event: "submit",
      handler: "save",
      modifiers: ["prevent"]
    });
    expect(analyzeTemplate(ast)).toContainEqual({
      type: "event",
      event: "click",
      handler: "select",
      modifiers: ["stop"]
    });
  });

  it("analyzes v-model directives", () => {
    const ast = parseTemplate(`<input v-model="name" />`);

    expect(analyzeTemplate(ast)).toEqual([{ type: "model", expression: "name" }]);
  });

  it("analyzes v-for aliases with optional index values", () => {
    const ast = parseTemplate(`<ul><li v-for="(item, index) of items" :key="item.id">{{ index }}: {{ item.label }}</li></ul>`);

    expect(analyzeTemplate(ast)).toContainEqual({
      type: "for",
      item: "item",
      index: "index",
      source: "items"
    });
  });

  it("analyzes v-show directives", () => {
    const ast = parseTemplate(`<p v-show="visible">Shown</p>`);

    expect(analyzeTemplate(ast)).toEqual([{ type: "show", expression: "visible" }]);
  });

  it("analyzes v-else-if and v-else directives", () => {
    const ast = parseTemplate(`<section><p v-if="a">A</p><p v-else-if="b">B</p><p v-else>C</p></section>`);

    expect(analyzeTemplate(ast)).toContainEqual({ type: "else-if", expression: "b" });
    expect(analyzeTemplate(ast)).toContainEqual({ type: "else" });
  });

  it("generates a mount function with direct DOM updates", () => {
    const result = compile(counterSource, { filename: "Counter.mikuru" });

    expect(result.code).toContain("export function mount(target, props = {})");
    expect(result.code).toContain('document.createElement("button")');
    expect(result.code).toContain("const handler");
    expect(result.code).toContain('addEventListener("click", handler');
    expect(result.code).toContain("removeEventListener");
    expect(result.code).toContain("effect(() =>");
    expect(result.code).toContain("textContent");
    expect(result.code).toContain("unmount()");
  });

  it("returns a source map with original SFC contents", () => {
    const result = compile(counterSource, { filename: "Counter.mikuru" });

    expect(result.map).toMatchObject({
      version: 3,
      file: "Counter.mikuru.js",
      sources: ["Counter.mikuru"],
      sourcesContent: [counterSource],
      names: []
    });
    expect(result.map.mappings.length).toBeGreaterThan(0);
  });

  it("keeps source map line coverage coarse but complete", () => {
    const result = compile(
      `<template>
  <section>
    <p>{{ message }}</p>
  </section>
</template>

<script>
const message = "mapped";
</script>

<style>
p { color: red; }
</style>`,
      { filename: "nested/Mapped.mikuru" }
    );

    expect(result.map).toMatchObject({
      version: 3,
      file: "nested/Mapped.mikuru.js",
      sources: ["nested/Mapped.mikuru"],
      sourcesContent: [expect.stringContaining('const message = "mapped";')],
      names: []
    });
    expect(result.map.mappings.split(";")).toHaveLength(result.code.split("\n").length);
  });

  it("scopes style selectors and generated elements", () => {
    const result = compile(`<template><section><p>Hello</p></section></template><style scoped>section, p:hover { color: red; }</style>`);

    expect(result.code).toContain("data-mikuru-scope-");
    expect(result.code).toMatch(/section\[data-mikuru-scope-[^\]]+\], p\[data-mikuru-scope-[^\]]+\]:hover/);
    expect(result.code).toContain(".setAttribute(\"data-mikuru-scope-");
  });

  it("moves component imports to module scope and emits default export", () => {
    const result = compile(`<template><Child title="Hello" /></template><script>import Child from "./Child.mikuru";</script>`);

    expect(result.code).toMatch(/^import Child from "\.\/Child\.mikuru";/);
    expect(result.code).toContain("Child.mount");
    expect(result.code).toContain("export default __mikuru_component");
  });

  it("generates component v-model props and update handlers", () => {
    const result = compile(`<template><Child v-model="name" /></template><script>import Child from "./Child.mikuru"; const name = ref("Mikuru");</script>`);

    expect(result.code).toContain("get modelValue() { return unwrap(unwrap(name)); }");
    expect(result.code).toContain("onUpdateModelValue: ($value) => { name.value = $value; }");
  });

  it("generates named slots and slot props", () => {
    const result = compile(`<template>
  <Panel>
    <template #header="{ title }">
      <h2>{{ title }}</h2>
    </template>
  </Panel>
</template>
<script>import Panel from "./Panel.mikuru";</script>`);

    expect(result.code).toContain("slots: {");
    expect(result.code).toContain("header(slotTarget");
    expect(result.code).toContain("const title = { get value() { return slotProps");
  });

  it("rejects event modifiers on component events", () => {
    expect(() =>
      compile(`<template><Child @select.stop="select" /></template><script>import Child from "./Child.mikuru"; function select() {}</script>`, {
        filename: "ComponentEventModifier.mikuru"
      })
    ).toThrow(/Event modifiers are not supported on component events yet/);
  });

  it("transforms multiline script macros", () => {
    const result = compile(`<template><Child :title="heading" @select="select" /></template>
<script>
import Child from "./Child.mikuru";

const {
  title: heading = "Untitled",
  active
} = defineProps();

const emit =
  defineEmits();

function select() {
  emit("select", active);
}
</script>`);

    expect(result.code).toContain('import Child from "./Child.mikuru";');
    expect(result.code).toContain('const heading = { get value() { const value = props.title; return value === undefined ? ("Untitled") : value; } };');
    expect(result.code).toContain("const active = { get value() { return props.active; } };");
    expect(result.code).toContain("const emit = __mikuru_emit;");
  });

  it("accepts props and emits declarations", () => {
    const result = compile(`<template><button @click="select">{{ title }}</button></template>
<script>
const { title, active } = defineProps({ title: String, active: Boolean });
const emit = defineEmits(["select", "item-select"]);

function select() {
  emit("select", active);
}
</script>`);

    expect(result.code).toContain("const title = { get value() { return props.title; } };");
    expect(result.code).toContain("const active = { get value() { return props.active; } };");
    expect(result.code).toContain("const emit = __mikuru_emit;");
  });

  it("rejects undeclared emit calls", () => {
    expect(() =>
      compile(`<template><button @click="select">Select</button></template>
<script>
const emit = defineEmits(["select"]);

function select() {
  emit("cancel");
}
</script>`, { filename: "BadEmit.mikuru" })
    ).toThrow(/Emit event "cancel" is not declared/);
  });

  it("reports script macro errors with filename, line, and column", () => {
    expect(() =>
      compile(
        `<template><p>Broken</p></template>
<script>
function setup() {
  const props = defineProps();
}
</script>`,
        { filename: "BrokenMacro.mikuru" }
      )
    ).toThrow(/BrokenMacro\.mikuru:4:17/);

    expect(() =>
      compile(`<template><p>Broken</p></template><script>const props = defineProps(["title"]);</script>`)
    ).toThrow(/defineProps\(\) only supports an object declaration argument/);
  });

  it("rejects invalid and unsafe template expressions", () => {
    expect(() =>
      compile(`<template><p>{{ count; alert(1) }}</p></template><script>const count = 0;</script>`)
    ).toThrow(/Invalid template expression/);
    expect(() => compile(`<template><button @click="count.value = 1">Set</button></template>`)).toThrow(
      /Unsupported template expression/
    );
  });

  it("reports filename, line, column, and frame for template expression errors", () => {
    expect(() =>
      compile(
        `<template>
  <section>
    <p>{{ count; alert(1) }}</p>
  </section>
</template>`,
        { filename: "Broken.mikuru" }
      )
    ).toThrow(/Broken\.mikuru:3:11/);

    try {
      compile(
        `<template>
  <section>
    <p>{{ count; alert(1) }}</p>
  </section>
</template>`,
        { filename: "Broken.mikuru" }
      );
    } catch (error) {
      expect(error).toMatchObject({
        name: "MikuruCompileError",
        filename: "Broken.mikuru",
        line: 3,
        column: 11
      });
      expect((error as { frame?: string }).frame).toContain("{{ count; alert(1) }}");
    }
  });

  it("reports line and column for template structure errors", () => {
    expect(() => compile(`<template>\n  <section>\n    </article>\n  </section>\n</template>`, { filename: "Broken.mikuru" }))
      .toThrow(/Broken\.mikuru:3:5/);
  });

  it("reports orphan v-else branches", () => {
    expect(() =>
      compile(`<template>\n  <section>\n    <p v-else>Fallback</p>\n  </section>\n</template>`, {
        filename: "BrokenElse.mikuru"
      })
    ).toThrow(/v-else must follow v-if or v-else-if \(BrokenElse\.mikuru:3:8\)/);
  });

  it("documents parser limits with explicit compile errors", () => {
    expect(() => compile(`<template><p>One</p><p>Two</p></template>`)).toThrow(/exactly one root element/);
    expect(() => compile(`<template><p class="a" class="b">Duplicate</p></template>`)).toThrow(/Duplicate template attribute: class/);
    expect(() => compile(`<template><1bad>Broken</1bad></template>`)).toThrow(/Invalid template tag name/);
    expect(() => compile(`<template><ul><li v-for="({ id }) in items">{{ id }}</li></ul></template>`)).toThrow(
      /Invalid v-for expression/
    );
    expect(() => compile(`<template><Child v-show="visible" /></template><script>const visible = true; const Child = { mount() {} };</script>`)).toThrow(
      /Unsupported component directive v-show/
    );
  });

  it("reports filename, line, column, and frame for unsupported v1 syntax", () => {
    const error = captureCompileError(
      `<template>
  <section>
    <article v-html="html"></article>
  </section>
</template>`,
      "UnsupportedSyntax.mikuru"
    );

    expect(error).toMatchObject({
      name: "MikuruCompileError",
      filename: "UnsupportedSyntax.mikuru",
      line: 3,
      column: 14
    });
    expect(error.message).toMatch(/v-html is not supported in v1 \(UnsupportedSyntax\.mikuru:3:14\)/);
    expect(error.frame).toContain('<article v-html="html"></article>');
    expect(error.frame).toContain("^");
  });

  it("reports SFC block errors with a code frame", () => {
    const duplicate = captureCompileError(
      `<template><p>One</p></template>
<template><p>Two</p></template>`,
      "DuplicateBlock.mikuru"
    );
    const unsupported = captureCompileError(
      `<template><p>One</p></template>
<docs>Notes</docs>`,
      "UnsupportedBlock.mikuru"
    );
    const missing = captureCompileError(
      `<script>
const count = 0;
</script>`,
      "MissingTemplate.mikuru"
    );

    expect(duplicate.message).toMatch(/Duplicate SFC block <template> \(DuplicateBlock\.mikuru:2:1\)/);
    expect(duplicate.frame).toContain("<template><p>Two</p></template>");
    expect(unsupported.message).toMatch(/Unsupported SFC block <docs> \(UnsupportedBlock\.mikuru:2:1\)/);
    expect(unsupported.frame).toContain("<docs>Notes</docs>");
    expect(missing.message).toMatch(/Missing required <template> block \(MissingTemplate\.mikuru:1:1\)/);
    expect(missing.frame).toContain("<script>");
  });

  it("rejects unsupported v1 template constructs explicitly", () => {
    expect(() => compile(`<template><section v-html="html"></section></template>`)).toThrow(/v-html is not supported in v1/);
    expect(() => compile(`<template><section v-bind="attrs"></section></template>`)).toThrow(
      /Object-form v-bind is not supported in v1/
    );
    expect(() => compile(`<template><section v-on="listeners"></section></template>`)).toThrow(
      /Object-form v-on is not supported in v1/
    );
    expect(() => compile(`<template><component :is="current" /></template>`)).toThrow(
      /Dynamic components are not supported in v1/
    );
    expect(() => compile(`<template><Panel v-slot:header>Header</Panel></template>`)).toThrow(
      /v-slot must be used on a <template> child in Mikuru/
    );
  });

  it("adds generated source URLs in Vite debug mode", async () => {
    const plugin = mikuru({ debug: true });
    const transform = plugin.transform as unknown as Function;
    const result = await transform.call(
      {
        error(error: string | Error) {
          throw error instanceof Error ? error : new Error(error);
        }
      },
      `<template><p>{{ message }}</p></template><script>const message = "debug";</script>`,
      "Debuggable.mikuru"
    );

    expect(result).toMatchObject({
      code: expect.stringContaining("//# sourceURL=Debuggable.mikuru?mikuru-generated"),
      map: expect.objectContaining({
        sources: ["Debuggable.mikuru"],
        sourcesContent: [expect.stringContaining("debug")]
      })
    });
  });

  it("normalizes Windows paths in Vite debug source URLs", async () => {
    const plugin = mikuru({ debug: true });
    const transform = plugin.transform as unknown as Function;
    const result = await transform.call(
      {
        error(error: string | Error) {
          throw error instanceof Error ? error : new Error(error);
        }
      },
      `<template><p>{{ message }}</p></template><script>const message = "debug";</script>`,
      "C:\\repo\\src\\Debuggable.mikuru"
    );

    expect(result.code).toContain("//# sourceURL=C:/repo/src/Debuggable.mikuru?mikuru-generated");
  });

  it("forwards Mikuru compile errors through Vite with location and frame", () => {
    const plugin = mikuru();
    const transform = plugin.transform as unknown as Function;
    let forwarded:
      | {
          message: string;
          id: string;
          loc: { line: number; column: number };
          frame?: string;
        }
      | undefined;

    expect(() =>
      transform.call(
        {
          error(error: typeof forwarded) {
            forwarded = error;
            throw new Error("vite forwarded");
          }
        },
        `<template>
  <section>
    <p>{{ count; alert(1) }}</p>
  </section>
</template>`,
        "src/BrokenForwarding.mikuru"
      )
    ).toThrow(/vite forwarded/);

    expect(forwarded).toMatchObject({
      id: "src/BrokenForwarding.mikuru",
      loc: { line: 3, column: 11 }
    });
    expect(forwarded?.message).toMatch(/Invalid template expression/);
    expect(forwarded?.frame).toContain("{{ count; alert(1) }}");
  });
});

function captureCompileError(source: string, filename: string): MikuruCompileError {
  try {
    compile(source, { filename });
  } catch (error) {
    if (error instanceof MikuruCompileError) {
      return error;
    }

    throw error;
  }

  throw new Error("Expected compile to fail");
}
