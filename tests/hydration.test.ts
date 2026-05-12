import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { compileHydration, compileSsr } from "../src/compiler/index.js";
import { effect, ref, setAttribute, unwrap } from "../src/runtime/index.js";
import { escapeHtml, renderAttr, renderAttrs, renderComponentToString } from "../src/server.js";

describe("hydration compiler", () => {
  it("reuses SSR DOM, attaches events, and syncs text and attributes", async () => {
    const source = `<template>
  <section class="card" :data-count="count">
    <button @click="increment">{{ label }}: {{ count }}</button>
  </section>
</template>
<script>
const count = ref(1);
const label = "Count";
function increment() {
  count.value += 1;
}
</script>`;
    const ssr = compileSsr(source, { filename: "HydrateCounter.mikuru" });
    const hydrate = compileHydration(source, { filename: "HydrateCounter.mikuru" });
    const renderToString = loadSsrRender(ssr.code);
    const module = loadHydrationModule(hydrate.code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const originalSection = root.firstElementChild;
    const instance = module.hydrate(root as unknown as Element);

    expect(instance.element).toBe(originalSection);
    expect(root.innerHTML).toBe('<section class="card" data-count="1"><button>Count: 1</button></section>');

    root.querySelector("button")?.dispatchEvent(new window.Event("click"));

    expect(root.innerHTML).toBe('<section class="card" data-count="2"><button>Count: 2</button></section>');

    instance.unmount();
    root.querySelector("button")?.dispatchEvent(new window.Event("click"));
    expect(root.innerHTML).toBe('<section class="card" data-count="2"><button>Count: 2</button></section>');
  });

  it("falls back to mount when the root does not match", () => {
    const source = `<template><p>{{ message }}</p></template><script>const message = "mounted";</script>`;
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = "<span>wrong</span>";
    const instance = module.hydrate(root as unknown as Element);

    expect(root.querySelector("p")?.textContent).toBe("mounted");
    expect(instance.element.tagName.toLowerCase()).toBe("p");
  });

  it("hydrates initial v-if and v-for DOM", async () => {
    const source = `<template>
  <section>
    <p v-if="ready">{{ message }}</p>
    <ul>
      <li v-for="(item, index) in items" :data-index="index">{{ item }}</li>
    </ul>
  </section>
</template>
<script>
const ready = true;
const message = "Ready";
const items = ["one", "two"];
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const section = root.firstElementChild;
    const instance = module.hydrate(root as unknown as Element);

    expect(instance.element).toBe(section);
    expect(root.innerHTML).toBe('<section><p>Ready</p><ul><li data-index="0">one</li><li data-index="1">two</li></ul></section>');
  });

  it("hydrates child components when they expose hydrate and falls back to mount otherwise", async () => {
    const source = `<template>
  <section>
    <HydratableChild :label="label" />
    <MountOnlyChild label="fallback" />
  </section>
</template>
<script>
const label = "child";
const HydratableChild = {
  renderToString(props) {
    return '<p data-child="' + props.label + '">' + props.label + '</p>';
  },
  hydrate(target, props) {
    target.setAttribute("data-hydrated", props.label);
    return { element: target, unmount() { target.removeAttribute("data-hydrated"); } };
  }
};
const MountOnlyChild = {
  renderToString(props) {
    return '<span>' + props.label + '</span>';
  },
  mount(target, props) {
    const el = document.createElement("span");
    el.textContent = props.label + " mounted";
    target.appendChild(el);
    return { element: el, unmount() { el.remove(); } };
  }
};
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);

    expect(root.querySelector("p")?.getAttribute("data-hydrated")).toBe("child");
    expect(root.querySelector("span")?.textContent).toBe("fallback mounted");

    instance.unmount();
    expect(root.querySelector("p")?.hasAttribute("data-hydrated")).toBe(false);
  });
});

function loadSsrRender(code: string): (props?: Record<string, unknown>) => Promise<string> {
  const executable = code
    .replace(/import\s+\{([^}]+)\}\s+from\s+["']mikuru["'];?\n+/g, "const { $1 } = helpers;\n")
    .replace("import { escapeHtml as __mikuru_escape, renderAttr as __mikuru_renderAttr, renderAttrs as __mikuru_renderAttrs, renderComponentToString as __mikuru_renderComponent } from \"mikuru/server\";", "const __mikuru_escape = helpers.escapeHtml; const __mikuru_renderAttr = helpers.renderAttr; const __mikuru_renderAttrs = helpers.renderAttrs; const __mikuru_renderComponent = helpers.renderComponentToString;")
    .replace("import { unwrap as __mikuru_unwrap } from \"mikuru/runtime\";", "const __mikuru_unwrap = helpers.unwrap;")
    .replace("export async function renderToString", "async function renderToString");
  const factory = new Function("helpers", `const { ref } = helpers;\n${executable}\nreturn renderToString;`) as (helpers: Record<string, unknown>) => (props?: Record<string, unknown>) => Promise<string>;
  return factory({ escapeHtml, renderAttr, renderAttrs, renderComponentToString, ref, unwrap });
}

function loadHydrationModule(code: string): { mount: (target: Element, props?: Record<string, unknown>) => any; hydrate: (target: Element, props?: Record<string, unknown>) => any } {
  const executable = code
    .replace(/import\s+\{[^}]+\}\s+from\s+["'][^"']*mikuru[^"']*["'];?\n+/g, "")
    .replace("export function mount", "function mount")
    .replace("export function hydrate", "function hydrate")
    .replace(/\nexport \{ hydrate \};\nconst __mikuru_hydrationComponent = \{ \.\.\.__mikuru_component, hydrate \};\nexport default __mikuru_hydrationComponent;\n?$/, "\n");
  const factory = new Function("effect", "ref", "setAttribute", "unwrap", "document", `${executable}\nreturn { mount, hydrate };`) as (
    effectArg: typeof effect,
    refArg: typeof ref,
    setAttributeArg: typeof setAttribute,
    unwrapArg: typeof unwrap,
    documentArg: Document
  ) => { mount: (target: Element, props?: Record<string, unknown>) => any; hydrate: (target: Element, props?: Record<string, unknown>) => any };
  const window = new Window();
  return factory(effect, ref, setAttribute, unwrap, window.document as unknown as Document);
}
