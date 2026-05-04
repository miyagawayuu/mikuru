import { performance } from "node:perf_hooks";

import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { compile } from "../src/compiler/index.js";
import { computed, effect, ref, setAttribute, unwrap } from "../src/runtime/index.js";

type CompiledModule = {
  mount(target: Element | DocumentFragment): { element: Element | Comment; unmount(): void };
};

describe("generated DOM performance smoke", () => {
  it("renders and refreshes a medium task list without pathological slowdown", () => {
    const window = new Window();
    const document = window.document as unknown as Document;
    const root = document.createElement("div");
    const module = loadCompiledModule(
      compile(`<template>
  <section>
    <button @click="append">Append</button>
    <p>{{ items.length }} tasks</p>
    <article v-for="(item, index) in items" :key="item.id">
      <strong>{{ index }}: {{ item.title }}</strong>
      <span>{{ item.owner }}</span>
    </article>
  </section>
</template>

<script>
import { ref } from "mikuru";

const items = ref(Array.from({ length: 500 }, (_, index) => ({
  id: "task-" + index,
  title: "Task " + index,
  owner: index % 2 === 0 ? "Compiler" : "Runtime"
})));

function append() {
  items.value = [
    ...items.value,
    { id: "task-" + items.value.length, title: "Task " + items.value.length, owner: "DX" }
  ];
}
</script>`).code,
      document
    );

    const startedAt = performance.now();
    const instance = module.mount(root);
    root.querySelector("button")?.dispatchEvent(new window.Event("click") as unknown as Event);
    const elapsed = performance.now() - startedAt;

    expect(root.querySelectorAll("article")).toHaveLength(501);
    expect(root.querySelector("p")?.textContent).toBe("501 tasks");
    expect(elapsed).toBeLessThan(3000);

    instance.unmount();
    expect(root.querySelector("section")).toBeNull();
  });
});

function loadCompiledModule(code: string, document: Document): CompiledModule {
  const executableCode = code
    .replace(/import\s+\{[^}]+\}\s+from\s+["'][^"']*(?:mikuru|mikuru)[^"']*["'];?\n+/g, "")
    .replace("export function mount", "function mount")
    .replace(/\nexport default __mikuru_component;\n?$/, "\n");
  const factory = new Function(
    "computed",
    "effect",
    "ref",
    "setAttribute",
    "unwrap",
    "document",
    `${executableCode}\nreturn { mount };`
  ) as (
    computedArg: typeof computed,
    effectArg: typeof effect,
    refArg: typeof ref,
    setAttributeArg: typeof setAttribute,
    unwrapArg: typeof unwrap,
    documentArg: Document
  ) => CompiledModule;

  return factory(computed, effect, ref, setAttribute, unwrap, document);
}
