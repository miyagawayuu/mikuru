import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { compileHydration, compileSsr } from "../src/compiler/index.js";
import { createMemoryHistory, createRouter } from "../src/router/index.js";
import type { RouterHistory } from "../src/router/index.js";
import { effect, inject, onMounted, onUnmounted, provide, ref, setAttribute, unwrap } from "../src/runtime/index.js";
import { escapeHtml, hydrateRoute, renderAttr, renderAttrs, renderComponentToString, renderRouteToString } from "../src/server.js";

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

  it("hydrates class and style bindings with object v-bind attr cleanup", async () => {
    const source = `<template>
  <section>
    <p class="card" :class="{ active }">{{ label }}</p>
    <em style="border-color: black" :style="{ color }">style</em>
    <div class="box" style="margin-top: 4px" v-bind="attrs">box</div>
    <button @click="toggle">Toggle</button>
  </section>
</template>
<script>
import { ref } from "mikuru";
const active = ref(true);
const label = ref("Ready");
const color = ref("red");
const attrs = ref({
  id: "status",
  "data-mode": "ready",
  class: ["bound"],
  style: { backgroundColor: "yellow" },
  title: "ready"
});
function toggle() {
  active.value = false;
  label.value = "Done";
  color.value = "blue";
  attrs.value = {
    "data-mode": "done",
    "aria-live": "polite"
  };
}
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);
    const paragraph = root.querySelector("p");
    const styleTarget = root.querySelector("em");
    const box = root.querySelector("div");

    expect(paragraph?.getAttribute("class")).toBe("card active");
    expect(styleTarget?.getAttribute("style")).toBe("border-color: black; color: red");
    expect(box?.getAttribute("class")).toBe("box bound");
    expect(box?.getAttribute("style")).toBe("margin-top: 4px; background-color: yellow");
    expect(box?.getAttribute("id")).toBe("status");
    expect(box?.getAttribute("title")).toBe("ready");
    expect(box?.getAttribute("data-mode")).toBe("ready");

    root.querySelector("button")?.dispatchEvent(new window.Event("click"));

    expect(paragraph?.getAttribute("class")).toBe("card");
    expect(paragraph?.textContent).toBe("Done");
    expect(styleTarget?.getAttribute("style")).toBe("border-color: black; color: blue");
    expect(box?.getAttribute("class")).toBe("box");
    expect(box?.getAttribute("style")).toBe("margin-top: 4px");
    expect(box?.hasAttribute("id")).toBe(false);
    expect(box?.hasAttribute("title")).toBe(false);
    expect(box?.getAttribute("data-mode")).toBe("done");
    expect(box?.getAttribute("aria-live")).toBe("polite");

    instance.unmount();
    root.querySelector("button")?.dispatchEvent(new window.Event("click"));
    expect(paragraph?.textContent).toBe("Done");
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

  it("scopes provide/inject and lifecycle callbacks during hydration", () => {
    const source = `<template>
  <section>
    <p>{{ inject(key) }}</p>
    <Child />
  </section>
</template>
<script>
import { inject, onMounted, onUnmounted, provide } from "mikuru";
const key = Symbol.for("mikuru.hydration.context");
provide(key, "parent");
onMounted(() => globalThis.__mikuruHydrationEvents.push("mounted"));
onUnmounted(() => globalThis.__mikuruHydrationEvents.push("unmounted"));
const Child = {
  hydrate(target, props) {
    let value = "missing";
    for (let context = props.__mikuru_context; context; context = context.parent) {
      if (context.provides?.has(key)) {
        value = context.provides.get(key);
        break;
      }
    }
    target.setAttribute("data-injected", value);
    return { element: target, unmount() { target.removeAttribute("data-injected"); } };
  }
};
</script>`;
    const previousEvents = (globalThis as { __mikuruHydrationEvents?: string[] }).__mikuruHydrationEvents;
    (globalThis as { __mikuruHydrationEvents?: string[] }).__mikuruHydrationEvents = [];
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    try {
      root.innerHTML = "<section><p>parent</p><span>child</span></section>";
      const instance = module.hydrate(root as unknown as Element);

      expect(root.querySelector("p")?.textContent).toBe("parent");
      expect(root.querySelector("span")?.getAttribute("data-injected")).toBe("parent");
      expect((globalThis as { __mikuruHydrationEvents?: string[] }).__mikuruHydrationEvents).toEqual(["mounted"]);

      instance.unmount();
      expect(root.querySelector("span")?.hasAttribute("data-injected")).toBe(false);
      expect((globalThis as { __mikuruHydrationEvents?: string[] }).__mikuruHydrationEvents).toEqual(["mounted", "unmounted"]);
    } finally {
      if (previousEvents === undefined) {
        delete (globalThis as { __mikuruHydrationEvents?: string[] }).__mikuruHydrationEvents;
      } else {
        (globalThis as { __mikuruHydrationEvents?: string[] }).__mikuruHydrationEvents = previousEvents;
      }
    }
  });

  it("hydrates DOM template refs and v-for array refs", async () => {
    const source = `<template>
  <section>
    <input ref="inputEl" value="initial" />
    <p v-for="item in items" ref="rows">{{ item }}</p>
  </section>
</template>
<script>
import { onMounted, onUnmounted, ref } from "mikuru";
const inputEl = ref(null);
const rows = ref([]);
const items = ["one", "two"];
onMounted(() => {
  globalThis.__mikuruHydrationRefs = {
    input: inputEl.value,
    rows: rows.value.slice()
  };
});
onUnmounted(() => {
  globalThis.__mikuruHydrationRefsAfterUnmount = {
    input: inputEl.value,
    rows: rows.value.slice()
  };
});
</script>`;
    const previousRefs = (globalThis as { __mikuruHydrationRefs?: unknown }).__mikuruHydrationRefs;
    const previousAfterUnmount = (globalThis as { __mikuruHydrationRefsAfterUnmount?: unknown }).__mikuruHydrationRefsAfterUnmount;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    try {
      root.innerHTML = await renderToString();
      const instance = module.hydrate(root as unknown as Element);
      const refs = (globalThis as { __mikuruHydrationRefs?: { input: Element | null; rows: Element[] } }).__mikuruHydrationRefs;

      expect(refs?.input).toBe(root.querySelector("input"));
      expect(refs?.rows).toEqual(Array.from(root.querySelectorAll("p")));
      expect(refs?.rows.map((row) => row.textContent)).toEqual(["one", "two"]);

      instance.unmount();
      expect((globalThis as { __mikuruHydrationRefsAfterUnmount?: { input: Element | null; rows: Element[] } }).__mikuruHydrationRefsAfterUnmount).toEqual({
        input: null,
        rows: []
      });
    } finally {
      if (previousRefs === undefined) {
        delete (globalThis as { __mikuruHydrationRefs?: unknown }).__mikuruHydrationRefs;
      } else {
        (globalThis as { __mikuruHydrationRefs?: unknown }).__mikuruHydrationRefs = previousRefs;
      }
      if (previousAfterUnmount === undefined) {
        delete (globalThis as { __mikuruHydrationRefsAfterUnmount?: unknown }).__mikuruHydrationRefsAfterUnmount;
      } else {
        (globalThis as { __mikuruHydrationRefsAfterUnmount?: unknown }).__mikuruHydrationRefsAfterUnmount = previousAfterUnmount;
      }
    }
  });

  it("hydrates component template refs", async () => {
    const source = `<template>
  <section>
    <Child ref="childRef" label="single" />
    <Child v-for="item in items" ref="childRefs" :label="item" />
  </section>
</template>
<script>
import { onMounted, onUnmounted, ref } from "mikuru";
const childRef = ref(null);
const childRefs = ref([]);
const items = ["one", "two"];
onMounted(() => {
  globalThis.__mikuruHydrationComponentRef = {
    single: childRef.value?.exposed,
    list: childRefs.value.map((child) => child.exposed)
  };
});
onUnmounted(() => {
  globalThis.__mikuruHydrationComponentRefAfterUnmount = {
    single: childRef.value,
    list: childRefs.value.slice()
  };
});
const Child = {
  renderToString(props) {
    return '<button>' + props.label + '</button>';
  },
  hydrate(target, props) {
    return { element: target, exposed: props.label, unmount() { target.setAttribute("data-unmounted", "true"); } };
  }
};
</script>`;
    const previousRef = (globalThis as { __mikuruHydrationComponentRef?: unknown }).__mikuruHydrationComponentRef;
    const previousAfterUnmount = (globalThis as { __mikuruHydrationComponentRefAfterUnmount?: unknown }).__mikuruHydrationComponentRefAfterUnmount;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    try {
      root.innerHTML = await renderToString();
      const instance = module.hydrate(root as unknown as Element);

      expect((globalThis as { __mikuruHydrationComponentRef?: unknown }).__mikuruHydrationComponentRef).toEqual({
        single: "single",
        list: ["one", "two"]
      });

      instance.unmount();
      expect((globalThis as { __mikuruHydrationComponentRefAfterUnmount?: unknown }).__mikuruHydrationComponentRefAfterUnmount).toEqual({
        single: null,
        list: []
      });
      expect(Array.from(root.querySelectorAll("button")).map((button) => button.getAttribute("data-unmounted"))).toEqual(["true", "true", "true"]);
    } finally {
      if (previousRef === undefined) {
        delete (globalThis as { __mikuruHydrationComponentRef?: unknown }).__mikuruHydrationComponentRef;
      } else {
        (globalThis as { __mikuruHydrationComponentRef?: unknown }).__mikuruHydrationComponentRef = previousRef;
      }
      if (previousAfterUnmount === undefined) {
        delete (globalThis as { __mikuruHydrationComponentRefAfterUnmount?: unknown }).__mikuruHydrationComponentRefAfterUnmount;
      } else {
        (globalThis as { __mikuruHydrationComponentRefAfterUnmount?: unknown }).__mikuruHydrationComponentRefAfterUnmount = previousAfterUnmount;
      }
    }
  });

  it("hydrates child component v-model props and update handlers", async () => {
    const source = `<template>
  <section>
    <ModelChild v-model.trim="name" v-model:checked="checked" />
    <p>{{ name }}:{{ checked }}</p>
  </section>
</template>
<script>
import { ref } from "mikuru";
const name = ref("Ada");
const checked = ref(false);
const ModelChild = {
  renderToString(props) {
    return '<button>' + props.modelValue + ':' + props.checked + '</button>';
  },
  hydrate(target, props) {
    target.setAttribute("data-model", props.modelValue);
    target.setAttribute("data-checked", String(props.checked));
    target.setAttribute("data-trim", String(props.modelModifiers.trim));
    props.onUpdateModelValue("Grace");
    props.onUpdateChecked(true);
    return { element: target, unmount() { target.removeAttribute("data-model"); } };
  }
};
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);

    expect(root.querySelector("button")?.getAttribute("data-model")).toBe("Ada");
    expect(root.querySelector("button")?.getAttribute("data-checked")).toBe("false");
    expect(root.querySelector("button")?.getAttribute("data-trim")).toBe("true");
    expect(root.querySelector("p")?.textContent).toBe("Grace:true");

    instance.unmount();
    expect(root.querySelector("button")?.hasAttribute("data-model")).toBe(false);
  });

  it("hydrates v-show and DOM v-model controls", async () => {
    const source = `<template>
  <form>
    <p v-show="visible">{{ name }}</p>
    <input v-model.trim="name" />
    <input type="checkbox" value="2" v-model.number="selected" />
    <select multiple v-model.number="selected">
      <option value="1">One</option>
      <option value="2">Two</option>
      <option value="3">Three</option>
    </select>
  </form>
</template>
<script>
import { ref } from "mikuru";
const visible = ref(false);
const name = ref("Ada");
const selected = ref([1]);
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);
    const paragraph = root.querySelector("p") as unknown as HTMLElement;
    const input = root.querySelector("input:not([type])") as unknown as HTMLInputElement;
    const checkbox = root.querySelector("input[type=checkbox]") as unknown as HTMLInputElement;
    const select = root.querySelector("select") as unknown as HTMLSelectElement;

    expect(paragraph.style.display).toBe("none");
    expect(input.value).toBe("Ada");
    expect(checkbox.checked).toBe(false);
    expect(Array.from(select.options).map((option) => option.selected)).toEqual([true, false, false]);

    input.value = "  Grace  ";
    input.dispatchEvent(new window.Event("input") as unknown as Event);
    expect(paragraph.textContent).toBe("Grace");

    checkbox.checked = true;
    checkbox.dispatchEvent(new window.Event("change") as unknown as Event);
    expect(Array.from(select.options).map((option) => option.selected)).toEqual([true, true, false]);

    select.options[0]!.selected = false;
    select.options[1]!.selected = false;
    select.options[2]!.selected = true;
    select.dispatchEvent(new window.Event("change") as unknown as Event);
    expect(checkbox.checked).toBe(false);

    instance.unmount();
    input.value = "Lovelace";
    input.dispatchEvent(new window.Event("input") as unknown as Event);
    expect(paragraph.textContent).toBe("Grace");
  });

  it("hydrates SSR Teleport content in its target", async () => {
    const source = `<template>
  <section>
    <h1>{{ title }}</h1>
    <Teleport to="#modal-root">
      <button @click="increment">{{ count }}</button>
    </Teleport>
    <p>after</p>
  </section>
</template>
<script>
import { ref } from "mikuru";
const title = "Teleport SSR";
const count = ref(1);
function increment() {
  count.value += 1;
}
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const window = new Window();
    const app = window.document.createElement("div");
    const modalRoot = window.document.createElement("div");
    modalRoot.id = "modal-root";
    window.document.body.append(app, modalRoot);
    const teleports: Record<string, string> = {};
    const module = loadHydrationModule(compileHydration(source).code, window.document as unknown as Document);

    app.innerHTML = await renderToString({ __mikuru_teleports: teleports });
    modalRoot.innerHTML = teleports["#modal-root"];

    expect(app.innerHTML).toBe("<section><h1>Teleport SSR</h1><!--teleport:t0--><!--/teleport:t0--><p>after</p></section>");
    expect(modalRoot.innerHTML).toBe("<!--teleport content:t0--><button>1</button><!--/teleport content:t0-->");

    const instance = module.hydrate(app as unknown as Element);
    const button = modalRoot.querySelector("button");
    button?.dispatchEvent(new window.Event("click"));

    expect(button?.textContent).toBe("2");
    expect(app.querySelector("p")?.textContent).toBe("after");

    instance.unmount();
    button?.dispatchEvent(new window.Event("click"));
    expect(button?.textContent).toBe("2");
  });

  it("hydrates disabled SSR Teleport content inline", async () => {
    const source = `<template>
  <section>
    <h1>{{ title }}</h1>
    <Teleport to="#modal-root" disabled>
      <button @click="increment">{{ count }}</button>
    </Teleport>
    <p>after</p>
  </section>
</template>
<script>
import { ref } from "mikuru";
const title = "Inline Teleport";
const count = ref(1);
function increment() {
  count.value += 1;
}
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const window = new Window();
    const app = window.document.createElement("div");
    const module = loadHydrationModule(compileHydration(source).code, window.document as unknown as Document);
    const teleports: Record<string, string> = {};

    app.innerHTML = await renderToString({ __mikuru_teleports: teleports });

    expect(app.innerHTML).toBe("<section><h1>Inline Teleport</h1><!--teleport:t0--><button>1</button><!--/teleport:t0--><p>after</p></section>");
    expect(teleports).toEqual({});

    const instance = module.hydrate(app as unknown as Element);
    const button = app.querySelector("button");
    button?.dispatchEvent(new window.Event("click"));

    expect(button?.textContent).toBe("2");
    expect(app.querySelector("p")?.textContent).toBe("after");

    instance.unmount();
    button?.dispatchEvent(new window.Event("click"));
    expect(button?.textContent).toBe("2");
  });

  it("hydrates dynamic disabled SSR Teleport content without shifting siblings", async () => {
    const source = `<template>
  <section>
    <h1>{{ title }}</h1>
    <Teleport to="#modal-root" :disabled="inline">
      <button @click="increment">{{ count }}</button>
    </Teleport>
    <p>after</p>
  </section>
</template>
<script>
import { ref } from "mikuru";
const title = "Dynamic Inline Teleport";
const inline = true;
const count = ref(1);
function increment() {
  count.value += 1;
}
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const window = new Window();
    const app = window.document.createElement("div");
    const module = loadHydrationModule(compileHydration(source).code, window.document as unknown as Document);
    const teleports: Record<string, string> = {};

    app.innerHTML = await renderToString({ __mikuru_teleports: teleports });

    expect(app.innerHTML).toBe("<section><h1>Dynamic Inline Teleport</h1><!--teleport:t0--><button>1</button><!--/teleport:t0--><p>after</p></section>");
    expect(teleports).toEqual({});

    const instance = module.hydrate(app as unknown as Element);
    const button = app.querySelector("button");
    button?.dispatchEvent(new window.Event("click"));

    expect(button?.textContent).toBe("2");
    expect(app.querySelector("p")?.textContent).toBe("after");

    instance.unmount();
    button?.dispatchEvent(new window.Event("click"));
    expect(button?.textContent).toBe("2");
  });

  it("hydrates dynamic enabled SSR Teleport content in its target", async () => {
    const source = `<template>
  <section>
    <h1>{{ title }}</h1>
    <Teleport to="#modal-root" :disabled="inline">
      <button @click="increment">{{ count }}</button>
    </Teleport>
    <p>after</p>
  </section>
</template>
<script>
import { ref } from "mikuru";
const title = "Dynamic Target Teleport";
const inline = false;
const count = ref(1);
function increment() {
  count.value += 1;
}
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const window = new Window();
    const app = window.document.createElement("div");
    const modalRoot = window.document.createElement("div");
    modalRoot.id = "modal-root";
    window.document.body.append(app, modalRoot);
    const module = loadHydrationModule(compileHydration(source).code, window.document as unknown as Document);
    const teleports: Record<string, string> = {};

    app.innerHTML = await renderToString({ __mikuru_teleports: teleports });
    modalRoot.innerHTML = teleports["#modal-root"];

    expect(app.innerHTML).toBe("<section><h1>Dynamic Target Teleport</h1><!--teleport:t0--><!--/teleport:t0--><p>after</p></section>");
    expect(modalRoot.innerHTML).toBe("<!--teleport content:t0--><button>1</button><!--/teleport content:t0-->");

    const instance = module.hydrate(app as unknown as Element);
    const button = modalRoot.querySelector("button");
    button?.dispatchEvent(new window.Event("click"));

    expect(button?.textContent).toBe("2");
    expect(app.querySelector("p")?.textContent).toBe("after");

    instance.unmount();
    button?.dispatchEvent(new window.Event("click"));
    expect(button?.textContent).toBe("2");
  });

  it("hydrates router matches with lazy nested route components and mount fallback", async () => {
    const window = new Window();
    const root = window.document.createElement("div");
    const hydrated: string[] = [];
    const Shell = {
      async renderToString(props: Record<string, any>) {
        return `<main data-route="${props.route.path}"><h1>Shell</h1><section id="child">${await props.children()}</section></main>`;
      },
      async hydrate(target: Element, props: Record<string, any>) {
        target.setAttribute("data-hydrated", "shell");
        expect(props.__mikuru_context?.provides?.get(Symbol.for("mikuru.router"))).toBe(router);
        hydrated.push("shell");
        await props.children(target.querySelector("#child") as unknown as Element, { __mikuru_context: props.__mikuru_context });
        return {
          element: target,
          unmount() {
            target.removeAttribute("data-hydrated");
          }
        };
      }
    };
    const UserPage = {
      renderToString(props: Record<string, any>) {
        return `<p data-id="${props.id}">User ${props.route.params.id}</p>`;
      },
      hydrate(target: Element, props: Record<string, any>) {
        expect(props.__mikuru_context?.provides?.get(Symbol.for("mikuru.router"))).toBe(router);
        const element = target.matches("p") ? target : target.firstElementChild as unknown as Element;
        element.setAttribute("data-hydrated", String(props.id));
        hydrated.push("user");
        return {
          element,
          unmount() {
            element.removeAttribute("data-hydrated");
          }
        };
      }
    };
    const MountOnly = {
      renderToString() {
        return "<em>mount-only</em>";
      },
      mount(target: Element | DocumentFragment) {
        const element = window.document.createElement("em");
        element.textContent = "mounted route";
        target.appendChild(element as unknown as Node);
        return {
          element,
          unmount() {
            element.remove();
          }
        };
      }
    };
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [
        {
          path: "/",
          component: Shell as any,
          children: [
            { path: "", redirect: "/users/7" },
            {
              path: "users/:id",
              component: async () => ({ default: UserPage as any }),
              props: true
            },
            {
              path: "fallback",
              component: MountOnly as any
            }
          ]
        }
      ]
    });

    root.innerHTML = (await renderRouteToString(router, "/")).html;
    const instance = await hydrateRoute(router, root.firstElementChild as unknown as Element, "/");

    expect(instance.route.fullPath).toBe("/users/7");
    expect(root.querySelector("main")?.getAttribute("data-hydrated")).toBe("shell");
    expect(root.querySelector("p")?.getAttribute("data-hydrated")).toBe("7");
    expect(hydrated).toEqual(["shell", "user"]);

    instance.unmount();
    expect(root.querySelector("main")?.hasAttribute("data-hydrated")).toBe(false);
    expect(root.querySelector("p")?.hasAttribute("data-hydrated")).toBe(false);

    root.innerHTML = (await renderRouteToString(router, "/fallback")).html;
    await hydrateRoute(router, root.firstElementChild as unknown as Element, "/fallback");
    expect(root.querySelector("em")?.textContent).toBe("mounted route");
  });

  it("can start and stop router history listening after route hydration", async () => {
    const window = new Window();
    const root = window.document.createElement("div");
    const baseHistory = createMemoryHistory("/users/7");
    const history: RouterHistory = {
      ...baseHistory,
      listen(fn) {
        const stop = baseHistory.listen(fn);
        return () => stop();
      }
    };
    const Shell = {
      async renderToString(props: Record<string, any>) {
        return `<main>${await props.children()}</main>`;
      },
      async hydrate(target: Element, props: Record<string, any>) {
        await props.children(target.firstElementChild as unknown as Element, { __mikuru_context: props.__mikuru_context });
        return { element: target, unmount() {} };
      }
    };
    const UserPage = {
      renderToString(props: Record<string, any>) {
        return `<p>User ${props.route.params.id}</p>`;
      },
      hydrate(target: Element) {
        return { element: target, unmount() {} };
      }
    };
    const router = createRouter({
      history,
      routes: [
        {
          path: "/",
          component: Shell as any,
          children: [
            {
              path: "users/:id",
              component: UserPage as any
            }
          ]
        },
        {
          path: "/fallback",
          component: UserPage as any
        }
      ]
    });

    root.innerHTML = (await renderRouteToString(router)).html;
    const instance = await hydrateRoute(router, root.firstElementChild as unknown as Element, { listen: true });

    expect(instance.route.fullPath).toBe("/users/7");
    history.push("/fallback");
    expect(router.currentRoute.value.fullPath).toBe("/fallback");

    instance.unmount();
    history.push("/users/9");
    expect(router.currentRoute.value.fullPath).toBe("/fallback");
  });
});

function loadSsrRender(code: string): (props?: Record<string, unknown>) => Promise<string> {
  const executable = code
    .replace(/import\s+\{([^}]+)\}\s+from\s+["']mikuru["'];?\n+/g, "")
    .replace("import { escapeHtml as __mikuru_escape, renderAttr as __mikuru_renderAttr, renderAttrs as __mikuru_renderAttrs, renderComponentToString as __mikuru_renderComponent } from \"mikuru/server\";", "const __mikuru_escape = helpers.escapeHtml; const __mikuru_renderAttr = helpers.renderAttr; const __mikuru_renderAttrs = helpers.renderAttrs; const __mikuru_renderComponent = helpers.renderComponentToString;")
    .replace("import { unwrap as __mikuru_unwrap } from \"mikuru/runtime\";", "const __mikuru_unwrap = helpers.unwrap;")
    .replace("export async function renderToString", "async function renderToString");
  const factory = new Function("helpers", `const { onMounted, onUnmounted, ref } = helpers;\n${executable}\nreturn renderToString;`) as (helpers: Record<string, unknown>) => (props?: Record<string, unknown>) => Promise<string>;
  return factory({ escapeHtml, renderAttr, renderAttrs, renderComponentToString, onMounted: () => {}, onUnmounted: () => {}, ref, unwrap });
}

function loadHydrationModule(code: string, documentOverride?: Document): { mount: (target: Element, props?: Record<string, unknown>) => any; hydrate: (target: Element, props?: Record<string, unknown>) => any } {
  const executable = code
    .replace(/import\s+\{[^}]+\}\s+from\s+["'][^"']*mikuru[^"']*["'];?\n+/g, "")
    .replace("export function mount", "function mount")
    .replace("export function hydrate", "function hydrate")
    .replace(/\nexport \{ hydrate \};\nconst __mikuru_hydrationComponent = \{ \.\.\.__mikuru_component, hydrate \};\nexport default __mikuru_hydrationComponent;\n?$/, "\n");
  const factory = new Function("effect", "inject", "onMounted", "onUnmounted", "provide", "ref", "setAttribute", "unwrap", "document", `${executable}\nreturn { mount, hydrate };`) as (
    effectArg: typeof effect,
    injectArg: typeof inject,
    onMountedArg: typeof onMounted,
    onUnmountedArg: typeof onUnmounted,
    provideArg: typeof provide,
    refArg: typeof ref,
    setAttributeArg: typeof setAttribute,
    unwrapArg: typeof unwrap,
    documentArg: Document
  ) => { mount: (target: Element, props?: Record<string, unknown>) => any; hydrate: (target: Element, props?: Record<string, unknown>) => any };
  const window = documentOverride ? undefined : new Window();
  return factory(effect, inject, onMounted, onUnmounted, provide, ref, setAttribute, unwrap, documentOverride ?? window!.document as unknown as Document);
}
