import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";

import { compileHydration, compileSsr } from "../src/compiler/index.js";
import { createMemoryHistory, createRouter, RouterLink, RouterView } from "../src/router/index.js";
import type { RouterHistory } from "../src/router/index.js";
import { defineAsyncComponent, effect, inject, onMounted, onUnmounted, provide, ref, setAttribute, unwrap } from "../src/runtime/index.js";
import { escapeHtml, hydrateRoute, renderAttr, renderAttrs, renderComponentToString, renderRouteToString, renderToStream } from "../src/server.js";

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

  it("hydrates DOM event modifiers and object-form listener options", async () => {
    const source = `<template>
  <form @submit.prevent="submit">
    <button type="submit">Submit</button>
    <button type="button" v-on.once="onceListeners">Once</button>
    <div v-on.capture="captureListeners">
      <button type="button" @click.stop="inner">Capture</button>
    </div>
    <p>{{ submitted }}:{{ onceCount }}:{{ order }}</p>
  </form>
</template>
<script>
import { ref } from "mikuru";
const submitted = ref(false);
const onceCount = ref(0);
const order = ref("");
const onceListeners = {
  click() {
    onceCount.value += 1;
  }
};
const captureListeners = {
  click() {
    order.value += "outer";
  }
};
function submit() {
  submitted.value = true;
}
function inner() {
  order.value += "-inner";
}
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);
    const form = root.querySelector("form") as HTMLFormElement | null;
    const buttons = root.querySelectorAll("button");
    const submitEvent = new window.Event("submit", { cancelable: true });

    form?.dispatchEvent(submitEvent as unknown as Event);
    expect(submitEvent.defaultPrevented).toBe(true);
    expect(root.querySelector("p")?.textContent).toBe("true:0:");

    buttons[1]?.dispatchEvent(new window.Event("click"));
    buttons[1]?.dispatchEvent(new window.Event("click"));
    expect(root.querySelector("p")?.textContent).toBe("true:1:");

    buttons[2]?.dispatchEvent(new window.Event("click", { bubbles: true }));
    expect(root.querySelector("p")?.textContent).toBe("true:1:outer-inner");

    instance.unmount();
    buttons[1]?.dispatchEvent(new window.Event("click"));
    expect(root.querySelector("p")?.textContent).toBe("true:1:outer-inner");
  });

  it("falls back to mount when the root does not match", () => {
    const source = `<template><p>{{ message }}</p></template><script>const message = "mounted";</script>`;
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      root.innerHTML = "<span>wrong</span>";
      const instance = module.hydrate(root as unknown as Element);

      expect(root.querySelector("p")?.textContent).toBe("mounted");
      expect(instance.element.tagName.toLowerCase()).toBe("p");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Root mismatch: expected <p>, got <span>; falling back to mount()."));
    } finally {
      warn.mockRestore();
    }
  });

  it("recovers structural child hydration mismatches by remounting", () => {
    const source = `<template>
  <section>
    <p>Ready</p>
    <span>{{ label }}</span>
  </section>
</template>
<script>
const label = "Label";
</script>`;
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      root.innerHTML = "<section><em>Wrong</em><!--extra--></section>";
      const instance = module.hydrate(root as unknown as Element);

      expect(root.innerHTML).toBe("<section><p>Ready</p><span>Label</span></section>");
      expect(instance.element.tagName.toLowerCase()).toBe("section");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Element mismatch: expected <p>, got <em>; remounting."));
    } finally {
      warn.mockRestore();
    }
  });

  it("warns when hydration leaves extra DOM nodes behind", () => {
    const source = `<template><section><p>Ready</p></section></template>`;
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      root.innerHTML = "<section><p>Ready</p><aside>extra</aside></section>";
      module.hydrate(root as unknown as Element);

      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Extra DOM nodes after hydration: <aside>."));
    } finally {
      warn.mockRestore();
    }
  });

  it("warns with expected and actual static attribute values", () => {
    const source = `<template>
  <section id="expected" data-state="ready" hidden>
    <p>Ready</p>
  </section>
</template>`;
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      root.innerHTML = '<section id="actual"><p>Ready</p></section>';
      module.hydrate(root as unknown as Element);

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Attribute mismatch on id: expected expected, got "actual".'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Attribute mismatch on data-state: expected ready, got null.'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Attribute mismatch on hidden: expected , got null.'));
    } finally {
      warn.mockRestore();
    }
  });

  it("warns with expected and actual text content values", () => {
    const source = `<template>
  <section>
    <p>{{ message }}</p>
  </section>
</template>
<script>
const message = "Expected";
</script>`;
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      root.innerHTML = "<section><p>Actual</p></section>";
      module.hydrate(root as unknown as Element);

      expect(root.querySelector("p")?.textContent).toBe("Expected");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Text content mismatch: expected "Expected", got "Actual".'));
    } finally {
      warn.mockRestore();
    }
  });

  it("warns with expected and actual content directive values", () => {
    const source = `<template>
  <section>
    <article v-html="html"></article>
    <p v-text="text"></p>
  </section>
</template>
<script>
const html = "<strong>Expected</strong>";
const text = "Expected text";
</script>`;
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      root.innerHTML = "<section><article><em>Actual</em></article><p>Actual text</p></section>";
      module.hydrate(root as unknown as Element);

      expect(root.querySelector("article")?.innerHTML).toBe("<strong>Expected</strong>");
      expect(root.querySelector("p")?.textContent).toBe("Expected text");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('v-html content mismatch: expected "<strong>Expected</strong>", got "<em>Actual</em>".'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('v-text content mismatch: expected "Expected text", got "Actual text".'));
    } finally {
      warn.mockRestore();
    }
  });

  it("warns with expected and actual v-model DOM property values", () => {
    const source = `<template>
  <section>
    <input v-model="name" />
    <input type="checkbox" v-model="enabled" />
  </section>
</template>
<script>
import { ref } from "mikuru";
const name = ref("Expected");
const enabled = ref(true);
</script>`;
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      root.innerHTML = '<section><input value="Actual"><input type="checkbox"></section>';
      module.hydrate(root as unknown as Element);
      const inputs = root.querySelectorAll("input");

      expect((inputs[0] as unknown as HTMLInputElement | undefined)?.value).toBe("Expected");
      expect((inputs[1] as unknown as HTMLInputElement | undefined)?.checked).toBe(true);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('v-model value mismatch: expected "Expected", got "Actual".'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("v-model checked mismatch: expected true, got false."));
    } finally {
      warn.mockRestore();
    }
  });

  it("warns with expected and actual multiple select v-model values", () => {
    const source = `<template>
  <section>
    <select multiple v-model="selected">
      <option value="a">A</option>
      <option value="b">B</option>
      <option value="c">C</option>
    </select>
  </section>
</template>
<script>
import { ref } from "mikuru";
const selected = ref(["b", "c"]);
</script>`;
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      root.innerHTML = '<section><select multiple><option value="a" selected>A</option><option value="b">B</option><option value="c">C</option></select></section>';
      module.hydrate(root as unknown as Element);
      const options = Array.from(root.querySelectorAll("option")) as unknown as HTMLOptionElement[];

      expect(options.map((option) => option.selected)).toEqual([false, true, true]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('v-model selected mismatch: expected ["b","c"], got ["a"].'));
    } finally {
      warn.mockRestore();
    }
  });

  it("hydrates object-valued select options before v-model sync", () => {
    const source = `<template>
  <section>
    <select v-model="selected">
      <option v-for="option in options" :value="option">{{ option.label }}</option>
    </select>
    <select multiple v-model="picked">
      <option v-for="option in options" :value="option">{{ option.label }}</option>
    </select>
  </section>
</template>
<script>
import { ref } from "mikuru";
const options = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" }
];
const selected = ref(options[1]);
const picked = ref([options[0], options[2]]);
</script>`;
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      root.innerHTML = '<section><select><option value="[object Object]">Alpha</option><option value="[object Object]">Beta</option><option value="[object Object]">Gamma</option></select><select multiple><option value="[object Object]" selected>Alpha</option><option value="[object Object]" selected>Beta</option><option value="[object Object]">Gamma</option></select></section>';
      module.hydrate(root as unknown as Element);
      const selects = root.querySelectorAll("select");
      const single = selects[0] as unknown as HTMLSelectElement | undefined;
      const multiple = selects[1] as unknown as HTMLSelectElement | undefined;

      expect(single?.selectedIndex).toBe(1);
      expect(Array.from(multiple?.options ?? []).map((option) => option.selected)).toEqual([true, false, true]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('v-model selected mismatch: expected {"id":"b","label":"Beta"}, got {"id":"a","label":"Alpha"}.'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('v-model selected mismatch: expected [{"id":"a","label":"Alpha"},{"id":"c","label":"Gamma"}], got [{"id":"a","label":"Alpha"},{"id":"b","label":"Beta"}].'));
    } finally {
      warn.mockRestore();
    }
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

  it("hydrates boolean and form property bindings", async () => {
    const source = `<template>
  <section>
    <button :disabled="disabled">Action</button>
    <input type="checkbox" :checked="checked" />
    <input :value="name" />
    <p :data-enabled="enabled">{{ enabled }}</p>
    <button @click="toggle">Toggle</button>
  </section>
</template>
<script>
import { ref } from "mikuru";
const disabled = ref(true);
const checked = ref(true);
const name = ref("Mikuru");
const enabled = ref(false);
function toggle() {
  disabled.value = false;
  checked.value = false;
  name.value = "Updated";
  enabled.value = true;
}
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);
    const button = root.querySelector("button") as HTMLButtonElement | null;
    const checkbox = root.querySelector("input[type='checkbox']") as HTMLInputElement | null;
    const textInput = root.querySelector("input:not([type])") as HTMLInputElement | null;
    const paragraph = root.querySelector("p");

    expect(button?.disabled).toBe(true);
    expect(checkbox?.checked).toBe(true);
    expect(textInput?.value).toBe("Mikuru");
    expect(paragraph?.getAttribute("data-enabled")).toBe("false");

    root.querySelectorAll("button")[1]?.dispatchEvent(new window.Event("click"));

    expect(button?.disabled).toBe(false);
    expect(button?.hasAttribute("disabled")).toBe(false);
    expect(checkbox?.checked).toBe(false);
    expect(checkbox?.hasAttribute("checked")).toBe(false);
    expect(textInput?.value).toBe("Updated");
    expect(paragraph?.getAttribute("data-enabled")).toBe("true");

    instance.unmount();
  });

  it("hydrates v-bind property, attribute, and camel modifiers", async () => {
    const source = `<template>
  <section>
    <input type="checkbox" :indeterminate.prop="mixed" />
    <input type="checkbox" :indeterminate.attr="mixed" />
    <div :data-user-id.camel="userId">profile</div>
    <button @click="toggle">Toggle</button>
  </section>
</template>
<script>
import { ref } from "mikuru";
const mixed = ref(true);
const userId = ref("42");
function toggle() {
  mixed.value = false;
  userId.value = "84";
}
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);
    const inputs = Array.from(root.querySelectorAll("input")) as unknown as HTMLInputElement[];
    const propertyInput = inputs[0];
    const attributeInput = inputs[1];
    const profile = root.querySelector("div");

    expect(propertyInput?.indeterminate).toBe(true);
    expect(propertyInput?.hasAttribute("indeterminate")).toBe(false);
    expect(attributeInput?.indeterminate).toBe(false);
    expect(attributeInput?.getAttribute("indeterminate")).toBe("true");
    expect(profile?.getAttribute("dataUserId")).toBe("42");

    root.querySelector("button")?.dispatchEvent(new window.Event("click"));

    expect(propertyInput?.indeterminate).toBe(false);
    expect(propertyInput?.hasAttribute("indeterminate")).toBe(false);
    expect(attributeInput?.getAttribute("indeterminate")).toBe("false");
    expect(profile?.getAttribute("dataUserId")).toBe("84");

    instance.unmount();
  });

  it("hydrates object-form v-bind modifiers", async () => {
    const source = `<template>
  <section>
    <input type="checkbox" v-bind.prop="propertyAttrs" />
    <input type="checkbox" v-bind.attr="attributeAttrs" />
    <p v-bind.camel="camelAttrs">profile</p>
    <button @click="toggle">Toggle</button>
  </section>
</template>
<script>
import { ref } from "mikuru";
const propertyAttrs = ref({ indeterminate: true });
const attributeAttrs = ref({ indeterminate: true });
const camelAttrs = ref({ "data-user-id": "42" });
function toggle() {
  propertyAttrs.value = { indeterminate: false };
  attributeAttrs.value = { indeterminate: false };
  camelAttrs.value = { "data-user-id": "84" };
}
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);
    const inputs = Array.from(root.querySelectorAll("input")) as unknown as HTMLInputElement[];
    const propertyInput = inputs[0];
    const attributeInput = inputs[1];
    const profile = root.querySelector("p");

    expect(propertyInput?.indeterminate).toBe(true);
    expect(propertyInput?.hasAttribute("indeterminate")).toBe(false);
    expect(attributeInput?.indeterminate).toBe(false);
    expect(attributeInput?.getAttribute("indeterminate")).toBe("true");
    expect(profile?.getAttribute("dataUserId")).toBe("42");

    root.querySelector("button")?.dispatchEvent(new window.Event("click"));

    expect(propertyInput?.indeterminate).toBe(false);
    expect(propertyInput?.hasAttribute("indeterminate")).toBe(false);
    expect(attributeInput?.getAttribute("indeterminate")).toBe("false");
    expect(profile?.getAttribute("dataUserId")).toBe("84");

    instance.unmount();
  });

  it("hydrates v-html and v-text content directives", async () => {
    const source = `<template>
  <section>
    <article v-html="html"><p>fallback</p></article>
    <p v-text="message">fallback</p>
    <button @click="update">Update</button>
  </section>
</template>
<script>
import { ref } from "mikuru";
const html = ref("<strong>raw</strong>");
const message = ref("<safe>");
function update() {
  html.value = "<em>next</em>";
  message.value = "updated";
}
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);
    const article = root.querySelector("article");
    const paragraph = root.querySelector("p");

    expect(article?.innerHTML).toBe("<strong>raw</strong>");
    expect(paragraph?.textContent).toBe("<safe>");
    expect(paragraph?.innerHTML).toBe("&lt;safe&gt;");

    root.querySelector("button")?.dispatchEvent(new window.Event("click"));

    expect(article?.innerHTML).toBe("<em>next</em>");
    expect(paragraph?.textContent).toBe("updated");

    instance.unmount();
    root.querySelector("button")?.dispatchEvent(new window.Event("click"));
    expect(article?.innerHTML).toBe("<em>next</em>");
  });

  it("hydrates v-pre literally and removes v-cloak", async () => {
    const source = `<template>
  <section>
    <article v-pre :id="rawId" @click="ignored">{{ message }}<span v-if="false">Raw</span></article>
    <p v-cloak>{{ message }}</p>
    <button @click="update">Update</button>
  </section>
</template>
<script>
import { ref } from "mikuru";
const message = ref("Hello");
const rawId = "raw";
function update() {
  message.value = "Updated";
}
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    expect(root.querySelector("p")?.hasAttribute("v-cloak")).toBe(true);

    const instance = module.hydrate(root as unknown as Element);
    const article = root.querySelector("article");
    const paragraph = root.querySelector("p");
    const span = root.querySelector("span");

    expect(article?.textContent).toBe("{{ message }}Raw");
    expect(article?.getAttribute(":id")).toBe("rawId");
    expect(article?.getAttribute("@click")).toBe("ignored");
    expect(span?.getAttribute("v-if")).toBe("false");
    expect(paragraph?.hasAttribute("v-cloak")).toBe(false);
    expect(paragraph?.textContent).toBe("Hello");

    root.querySelector("button")?.dispatchEvent(new window.Event("click"));

    expect(article?.textContent).toBe("{{ message }}Raw");
    expect(paragraph?.textContent).toBe("Updated");

    instance.unmount();
  });

  it("hydrates dynamic attribute and event arguments", async () => {
    const source = `<template>
  <section>
    <button :[attrName]="attrValue" @[eventName]="handle">{{ count }}</button>
    <button @click="switchBindings">Switch</button>
  </section>
</template>
<script>
import { ref } from "mikuru";
const attrName = ref("data-mode");
const attrValue = ref("ready");
const eventName = ref("click");
const count = ref(0);
function handle() {
  count.value += 1;
}
function switchBindings() {
  attrName.value = "title";
  attrValue.value = "done";
  eventName.value = "mouseover";
}
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);
    const target = root.querySelector("button");
    const switcher = root.querySelectorAll("button")[1];

    expect(target?.getAttribute("data-mode")).toBe("ready");
    expect(target?.textContent).toBe("0");

    target?.dispatchEvent(new window.Event("click"));
    expect(target?.textContent).toBe("1");

    switcher?.dispatchEvent(new window.Event("click"));
    expect(target?.getAttribute("data-mode")).toBe(null);
    expect(target?.getAttribute("title")).toBe("done");

    target?.dispatchEvent(new window.Event("click"));
    expect(target?.textContent).toBe("1");

    target?.dispatchEvent(new window.Event("mouseover"));
    expect(target?.textContent).toBe("2");

    instance.unmount();
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

  it("hydrates component default, named, dynamic, and scoped slots", async () => {
    const source = `<template>
  <section>
    <Panel>
      <template #header="{ title = 'Untitled', item: { label }, ...rest }">
        <h2>{{ title }}</h2>
        <p>{{ label }}</p>
        <small>{{ rest.extra }}</small>
      </template>
      <template #[activeSlot]="slotProps">
        <footer>{{ slotProps.note }}</footer>
      </template>
      <p>{{ message }}</p>
    </Panel>
  </section>
</template>
<script>
const message = "default body";
const activeSlot = "footer";
const Panel = {
  async renderToString(props) {
    return '<section><header>' +
      await props.slots.header({ title: "SSR title", item: { label: "SSR label" }, extra: "SSR rest" }) +
      '</header><main>' +
      await props.children() +
      '</main><aside>' +
      await props.slots.footer({ note: "SSR footer" }) +
      '</aside></section>';
  },
  hydrate(target, props) {
    props.slots.header(target.querySelector("header"), { title: "Hydrated title", item: { label: "Hydrated label" }, extra: "Hydrated rest" });
    props.children(target.querySelector("main"));
    props.slots.footer(target.querySelector("aside"), { note: "Hydrated footer" });
    target.setAttribute("data-slots", "hydrated");
    return { element: target, unmount() { target.removeAttribute("data-slots"); } };
  }
};
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);

    expect(root.querySelector("[data-slots]")?.getAttribute("data-slots")).toBe("hydrated");
    expect(root.querySelector("header h2")?.textContent).toBe("Hydrated title");
    expect(root.querySelector("header p")?.textContent).toBe("Hydrated label");
    expect(root.querySelector("header small")?.textContent).toBe("Hydrated rest");
    expect(root.querySelector("main p")?.textContent).toBe("default body");
    expect(root.querySelector("aside footer")?.textContent).toBe("Hydrated footer");

    instance.unmount();
    expect(root.querySelector("[data-slots]")).toBeNull();
  });

  it("hydrates dynamic components and skips empty dynamic branches", async () => {
    const source = `<template>
  <section>
    <component :is="current" :label="label" />
    <component :is="fallback" label="fallback" />
    <component :is="empty" />
    <p>after</p>
  </section>
</template>
<script>
const label = "dynamic";
const empty = null;
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
const current = HydratableChild;
const fallback = MountOnlyChild;
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      root.innerHTML = await renderToString();
      const instance = module.hydrate(root as unknown as Element);

      expect(root.querySelector("p[data-child]")?.getAttribute("data-hydrated")).toBe("dynamic");
      expect(root.querySelector("span")?.textContent).toBe("fallback mounted");
      expect(root.querySelector("section")?.lastElementChild?.textContent).toBe("after");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Dynamic component hydration fallback"));

      instance.unmount();
      expect(root.querySelector("p[data-child]")?.hasAttribute("data-hydrated")).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it("hydrates KeepAlive dynamic component children", async () => {
    const source = `<template>
  <section>
    <KeepAlive include="HydratableChild" :max="2">
      <component :is="current" :label="label" />
    </KeepAlive>
    <p>after</p>
  </section>
</template>
<script>
const label = "cached";
const HydratableChild = {
  renderToString(props) {
    return '<p data-child="' + props.label + '">' + props.label + '</p>';
  },
  hydrate(target, props) {
    target.setAttribute("data-hydrated", props.label);
    return { element: target, unmount() { target.removeAttribute("data-hydrated"); } };
  }
};
const current = HydratableChild;
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);

    expect(root.querySelector("p[data-child]")?.getAttribute("data-hydrated")).toBe("cached");
    expect(root.querySelector("section")?.lastElementChild?.textContent).toBe("after");

    instance.unmount();
    expect(root.querySelector("p[data-child]")?.hasAttribute("data-hydrated")).toBe(false);
  });

  it("hydrates AsyncBoundary children without shifting siblings", async () => {
    const source = `<template>
  <section>
    <AsyncBoundary :loading="Loading" :fallback="ErrorView" :delay="10" :timeout="1000">
      <HydratableChild :label="label" />
      <p>{{ label }}</p>
    </AsyncBoundary>
    <footer>after</footer>
  </section>
</template>
<script>
const label = "async-ready";
const Loading = { renderToString() { return "<span>loading</span>"; } };
const ErrorView = { renderToString() { return "<span>error</span>"; } };
const HydratableChild = {
  renderToString(props) {
    return '<article data-child="' + props.label + '">' + props.label + '</article>';
  },
  hydrate(target, props) {
    target.setAttribute("data-hydrated", props.label);
    return { element: target, unmount() { target.removeAttribute("data-hydrated"); } };
  }
};
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);

    expect(root.querySelector("article")?.getAttribute("data-hydrated")).toBe("async-ready");
    expect(root.querySelector("p")?.textContent).toBe("async-ready");
    expect(root.querySelector("footer")?.textContent).toBe("after");

    instance.unmount();
    expect(root.querySelector("article")?.hasAttribute("data-hydrated")).toBe(false);
  });

  it("streams and hydrates AsyncBoundary async component children", async () => {
    const source = `<template>
  <main>
    <AsyncBoundary :loading="Loading" :fallback="ErrorView" :delay="1" :timeout="1000">
      <AsyncPanel message="stream hydrate" />
      <p>{{ label }}</p>
    </AsyncBoundary>
    <footer>after</footer>
  </main>
</template>
<script>
import { defineAsyncComponent } from "mikuru";
const label = "inside async boundary";
const Loading = { renderToString() { return "<span>loading</span>"; }, mount() {} };
const ErrorView = { renderToString(props) { return "<span>" + props.errorInfo.phase + "</span>"; }, mount() {} };
const AsyncPanel = defineAsyncComponent(async () => {
  await Promise.resolve();
  return {
    renderToString(props) {
      return '<article data-async="' + props.message + '">' + props.message + '</article>';
    },
    hydrate(target, props) {
      target.setAttribute("data-hydrated", props.message);
      return { element: target, unmount() { target.removeAttribute("data-hydrated"); } };
    },
    mount(target, props) {
      const el = document.createElement("article");
      el.textContent = "mounted " + props.message;
      target.appendChild(el);
      return { element: el, unmount() { el.remove(); } };
    }
  };
});
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const hydrationModule = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");
    const streamed: string[] = [];

    for await (const chunk of renderToStream({ renderToString })) {
      streamed.push(chunk);
    }

    root.innerHTML = await renderToString();
    expect(streamed).toEqual([root.innerHTML]);
    const article = root.querySelector("article");
    const instance = hydrationModule.hydrate(root as unknown as Element);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.querySelector("article")).toBe(article);
    expect(root.querySelector("article")?.getAttribute("data-hydrated")).toBe("stream hydrate");
    expect(root.querySelector("p")?.textContent).toBe("inside async boundary");
    expect(root.querySelector("footer")?.textContent).toBe("after");

    instance.unmount();
    expect(root.querySelector("article")?.hasAttribute("data-hydrated")).toBe(false);
  });

  it("hydrates async component loader errors with fallback without shifting siblings", async () => {
    const source = `<template>
  <section>
    <AsyncBoundary :loading="Loading" :fallback="BoundaryError">
      <AsyncPanel message="broken" />
    </AsyncBoundary>
    <footer>after</footer>
  </section>
</template>
<script>
import { defineAsyncComponent } from "mikuru";
const Loading = { renderToString() { return "<span>loading</span>"; }, mount() {} };
const BoundaryError = { renderToString() { return "<span>boundary error</span>"; }, mount() {} };
const ErrorView = {
  renderToString(props) {
    return '<aside data-phase="' + props.errorInfo.phase + '">' + props.error.message + '</aside>';
  },
  mount(target, props) {
    const el = document.createElement("aside");
    el.setAttribute("data-phase", props.errorInfo.phase);
    el.textContent = props.error.message;
    target.appendChild(el);
    return { element: el, unmount() { el.remove(); } };
  }
};
const AsyncPanel = defineAsyncComponent({
  loader: async () => {
    throw new Error("load failed");
  },
  errorComponent: ErrorView
});
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const hydrationModule = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    expect(root.querySelector("aside")?.getAttribute("data-phase")).toBe("async-loader");
    const instance = hydrationModule.hydrate(root as unknown as Element);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.querySelector("aside")?.getAttribute("data-phase")).toBe("async-loader");
    expect(root.querySelector("aside")?.textContent).toBe("load failed");
    expect(root.querySelector("footer")?.textContent).toBe("after");

    instance.unmount();
    expect(root.querySelector("aside")).toBeNull();
  });

  it("hydrates async component timeouts with fallback without shifting siblings", async () => {
    const source = `<template>
  <section>
    <AsyncBoundary :loading="Loading" :fallback="BoundaryError">
      <AsyncPanel message="slow" />
    </AsyncBoundary>
    <footer>after</footer>
  </section>
</template>
<script>
import { defineAsyncComponent } from "mikuru";
const Loading = { renderToString() { return "<span>loading</span>"; }, mount() {} };
const BoundaryError = { renderToString() { return "<span>boundary error</span>"; }, mount() {} };
const ErrorView = {
  renderToString(props) {
    return '<aside data-phase="' + props.errorInfo.phase + '">' + props.error.message + '</aside>';
  },
  mount(target, props) {
    const el = document.createElement("aside");
    el.setAttribute("data-phase", props.errorInfo.phase);
    el.textContent = props.error.message;
    target.appendChild(el);
    return { element: el, unmount() { el.remove(); } };
  }
};
const AsyncPanel = defineAsyncComponent({
  loader: () => new Promise(() => {}),
  timeout: 1,
  errorComponent: ErrorView
});
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const hydrationModule = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    expect(root.querySelector("aside")?.getAttribute("data-phase")).toBe("async-timeout");
    const instance = hydrationModule.hydrate(root as unknown as Element);

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(root.querySelector("aside")?.getAttribute("data-phase")).toBe("async-timeout");
    expect(root.querySelector("aside")?.textContent).toBe("Async component timed out");
    expect(root.querySelector("footer")?.textContent).toBe("after");

    instance.unmount();
    expect(root.querySelector("aside")).toBeNull();
  });

  it("retries async component hydration fallback and mounts the resolved component", async () => {
    const source = `<template>
  <section>
    <AsyncBoundary :loading="Loading" :fallback="BoundaryError">
      <AsyncPanel message="retry ok" />
    </AsyncBoundary>
    <footer>after</footer>
  </section>
</template>
<script>
import { defineAsyncComponent } from "mikuru";
let attempts = 0;
const Loading = { renderToString() { return "<span>loading</span>"; }, mount() {} };
const BoundaryError = { renderToString() { return "<span>boundary error</span>"; }, mount() {} };
const ErrorView = {
  renderToString(props) {
    return '<button data-phase="' + props.errorInfo.phase + '">' + props.error.message + '</button>';
  },
  mount(target, props) {
    const el = document.createElement("button");
    el.setAttribute("data-phase", props.errorInfo.phase);
    el.textContent = props.error.message;
    el.addEventListener("click", () => props.retry());
    target.appendChild(el);
    return { element: el, unmount() { el.remove(); } };
  }
};
const AsyncPanel = defineAsyncComponent({
  loader: async () => {
    attempts += 1;
    if (attempts < 2) {
      throw new Error("try again");
    }
    return {
      renderToString(props) {
        return '<article>' + props.message + '</article>';
      },
      mount(target, props) {
        const el = document.createElement("article");
        el.textContent = props.message;
        target.appendChild(el);
        return { element: el, unmount() { el.remove(); } };
      }
    };
  },
  errorComponent: ErrorView
});
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const hydrationModule = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    expect(root.querySelector("button")?.getAttribute("data-phase")).toBe("async-loader");
    const instance = hydrationModule.hydrate(root as unknown as Element);

    await new Promise((resolve) => setTimeout(resolve, 0));
    const retry = root.querySelector("button");
    expect(retry?.textContent).toBe("try again");

    retry?.dispatchEvent(new window.Event("click"));
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(root.querySelector("article")?.textContent).toBe("retry ok");
    expect(root.querySelector("footer")?.textContent).toBe("after");

    instance.unmount();
    expect(root.querySelector("article")).toBeNull();
  });

  it("hydrates ErrorBoundary children without shifting siblings", async () => {
    const source = `<template>
  <section>
    <ErrorBoundary :fallback="ErrorView" :reset-key="version">
      <HydratableChild :label="label" />
    </ErrorBoundary>
    <footer>after</footer>
  </section>
</template>
<script>
const version = 1;
const label = "error-ready";
const ErrorView = { renderToString() { return "<span>error</span>"; } };
const HydratableChild = {
  renderToString(props) {
    return '<article data-child="' + props.label + '">' + props.label + '</article>';
  },
  hydrate(target, props) {
    target.setAttribute("data-hydrated", props.label);
    return { element: target, unmount() { target.removeAttribute("data-hydrated"); } };
  }
};
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);

    expect(root.querySelector("article")?.getAttribute("data-hydrated")).toBe("error-ready");
    expect(root.querySelector("footer")?.textContent).toBe("after");

    instance.unmount();
    expect(root.querySelector("article")?.hasAttribute("data-hydrated")).toBe(false);
  });

  it("hydrates Transition children and branches without shifting siblings", async () => {
    const source = `<template>
  <section>
    <Transition name="fade" appear>
      <HydratableChild :label="label" />
    </Transition>
    <Transition>
      <p v-if="ready">Ready</p>
      <span v-else>{{ label }}</span>
    </Transition>
    <footer>after</footer>
  </section>
</template>
<script>
const ready = false;
const label = "transition-ready";
const HydratableChild = {
  renderToString(props) {
    return '<article data-child="' + props.label + '">' + props.label + '</article>';
  },
  hydrate(target, props) {
    target.setAttribute("data-hydrated", props.label);
    return { element: target, unmount() { target.removeAttribute("data-hydrated"); } };
  }
};
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);

    expect(root.querySelector("article")?.getAttribute("data-hydrated")).toBe("transition-ready");
    expect(root.querySelector("span")?.textContent).toBe("transition-ready");
    expect(root.querySelector("footer")?.textContent).toBe("after");

    instance.unmount();
    expect(root.querySelector("article")?.hasAttribute("data-hydrated")).toBe(false);
  });

  it("hydrates TransitionGroup keyed lists without shifting siblings", async () => {
    const source = `<template>
  <section>
    <TransitionGroup :tag="groupTag" name="rows" move-class="move">
      <HydratableRow v-for="item in items" :key="item.id" :label="item.label" />
    </TransitionGroup>
    <footer>after</footer>
  </section>
</template>
<script>
const groupTag = "ul";
const items = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" }
];
const HydratableRow = {
  renderToString(props) {
    return '<li data-row="' + props.label + '">' + props.label + '</li>';
  },
  hydrate(target, props) {
    target.setAttribute("data-hydrated", props.label);
    return { element: target, unmount() { target.removeAttribute("data-hydrated"); } };
  }
};
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);

    expect(Array.from(root.querySelectorAll("li")).map((node) => node.getAttribute("data-hydrated"))).toEqual(["Alpha", "Beta"]);
    expect(root.querySelector("footer")?.textContent).toBe("after");

    instance.unmount();
    expect(Array.from(root.querySelectorAll("li")).map((node) => node.hasAttribute("data-hydrated"))).toEqual([false, false]);
  });

  it("hydrates nested built-in wrappers without shifting siblings", async () => {
    const source = `<template>
  <section>
    <AsyncBoundary :loading="Loading" :fallback="AsyncError">
      <ErrorBoundary :fallback="ErrorView">
        <Transition name="fade">
          <TransitionGroup tag="ul" name="rows">
            <HydratableRow v-for="item in items" :key="item.id" :label="item.label" />
          </TransitionGroup>
        </Transition>
      </ErrorBoundary>
    </AsyncBoundary>
    <footer>after</footer>
  </section>
</template>
<script>
const items = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" }
];
const Loading = { renderToString() { return "<span>loading</span>"; } };
const AsyncError = { renderToString() { return "<span>async error</span>"; } };
const ErrorView = { renderToString() { return "<span>error</span>"; } };
const HydratableRow = {
  renderToString(props) {
    return '<li data-row="' + props.label + '">' + props.label + '</li>';
  },
  hydrate(target, props) {
    target.setAttribute("data-hydrated", props.label);
    return { element: target, unmount() { target.removeAttribute("data-hydrated"); } };
  }
};
</script>`;
    const renderToString = loadSsrRender(compileSsr(source).code);
    const module = loadHydrationModule(compileHydration(source).code);
    const window = new Window();
    const root = window.document.createElement("div");

    root.innerHTML = await renderToString();
    const instance = module.hydrate(root as unknown as Element);

    expect(Array.from(root.querySelectorAll("li")).map((node) => node.getAttribute("data-hydrated"))).toEqual(["Alpha", "Beta"]);
    expect(root.querySelector("footer")?.textContent).toBe("after");

    instance.unmount();
    expect(Array.from(root.querySelectorAll("li")).map((node) => node.hasAttribute("data-hydrated"))).toEqual([false, false]);
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

  it("hydrates generated RouterView and RouterLink route components", async () => {
    const window = new Window();
    const root = window.document.createElement("div");
    const shellSource = `<template>
  <main>
    <RouterLink :to="userRoute" label="User" />
    <RouterView />
  </main>
</template>
<script>
import { RouterLink, RouterView } from "mikuru/router";
const userRoute = { name: "user", params: { id: "7" }, query: { tab: "info" } };
</script>`;
    const userSource = `<template>
  <p>User {{ id }}:{{ tab }}</p>
</template>
<script>
const id = props.id;
const tab = props.tab;
</script>`;
    const shellRender = loadSsrRender(compileSsr(shellSource).code);
    const userRender = loadSsrRender(compileSsr(userSource).code);
    const shellHydrate = loadHydrationModule(compileHydration(shellSource).code, window.document as unknown as Document);
    const userHydrate = loadHydrationModule(compileHydration(userSource).code, window.document as unknown as Document);
    const router = createRouter({
      history: createMemoryHistory("/users/7?tab=info"),
      routes: [
        {
          path: "/",
          component: { renderToString: shellRender, hydrate: shellHydrate.hydrate } as any,
          children: [
            {
              path: "users/:id",
              name: "user",
              component: { renderToString: userRender, hydrate: userHydrate.hydrate } as any,
              props: (route) => ({ id: route.params.id, tab: route.query.tab })
            },
            {
              path: "fallback",
              component: { renderToString: userRender, hydrate: userHydrate.hydrate } as any,
              props: { id: "fallback", tab: "none" }
            }
          ]
        }
      ]
    });

    root.innerHTML = (await renderRouteToString(router)).html;
    const instance = await hydrateRoute(router, root.firstElementChild as unknown as Element, { listen: true });

    expect(root.querySelector("a")?.getAttribute("href")).toBe("/users/7?tab=info");
    expect(root.querySelector("a")?.getAttribute("aria-current")).toBe("page");
    expect(root.querySelector("p")?.textContent).toBe("User 7:info");

    root.querySelector("a")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }) as any);
    await Promise.resolve();
    expect(router.currentRoute.value.fullPath).toBe("/users/7?tab=info");

    instance.unmount();
  });
});

function loadSsrRender(code: string): (props?: Record<string, unknown>) => Promise<string> {
  const executable = code
    .replace(/import\s+\{([^}]+)\}\s+from\s+["']mikuru["'];?\n+/g, "")
    .replace(/import\s+\{([^}]+)\}\s+from\s+["']mikuru\/router["'];?\n+/g, "const { $1 } = helpers;\n")
    .replace("import { escapeHtml as __mikuru_escape, renderAttr as __mikuru_renderAttr, renderAttrs as __mikuru_renderAttrs, renderComponentToString as __mikuru_renderComponent } from \"mikuru/server\";", "const __mikuru_escape = helpers.escapeHtml; const __mikuru_renderAttr = helpers.renderAttr; const __mikuru_renderAttrs = helpers.renderAttrs; const __mikuru_renderComponent = helpers.renderComponentToString;")
    .replace("import { unwrap as __mikuru_unwrap } from \"mikuru/runtime\";", "const __mikuru_unwrap = helpers.unwrap;")
    .replace("export async function renderToString", "async function renderToString");
  const factory = new Function("helpers", `const { defineAsyncComponent, onMounted, onUnmounted, ref } = helpers;\n${executable}\nreturn renderToString;`) as (helpers: Record<string, unknown>) => (props?: Record<string, unknown>) => Promise<string>;
  return factory({ defineAsyncComponent, escapeHtml, renderAttr, renderAttrs, renderComponentToString, onMounted: () => {}, onUnmounted: () => {}, ref, unwrap, RouterLink, RouterView });
}

function loadHydrationModule(code: string, documentOverride?: Document): { mount: (target: Element, props?: Record<string, unknown>) => any; hydrate: (target: Element, props?: Record<string, unknown>) => any } {
  const executable = code
    .replace(/import\s+\{[^}]+\}\s+from\s+["'][^"']*mikuru[^"']*["'];?\n+/g, "")
    .replace("export function mount", "function mount")
    .replace("export function hydrate", "function hydrate")
    .replace(/\n(?:export \{ hydrate \};\n)?const __mikuru_hydrationComponent = \{ \.\.\.__mikuru_component, hydrate \};\nexport default __mikuru_hydrationComponent;\n?$/, "\n");
  const factory = new Function("defineAsyncComponent", "effect", "inject", "onMounted", "onUnmounted", "provide", "ref", "setAttribute", "unwrap", "document", "RouterLink", "RouterView", `${executable}\nreturn { mount, hydrate };`) as (
    defineAsyncComponentArg: typeof defineAsyncComponent,
    effectArg: typeof effect,
    injectArg: typeof inject,
    onMountedArg: typeof onMounted,
    onUnmountedArg: typeof onUnmounted,
    provideArg: typeof provide,
    refArg: typeof ref,
    setAttributeArg: typeof setAttribute,
    unwrapArg: typeof unwrap,
    documentArg: Document,
    routerLinkArg: typeof RouterLink,
    routerViewArg: typeof RouterView
  ) => { mount: (target: Element, props?: Record<string, unknown>) => any; hydrate: (target: Element, props?: Record<string, unknown>) => any };
  const window = documentOverride ? undefined : new Window();
  return factory(defineAsyncComponent, effect, inject, onMounted, onUnmounted, provide, ref, setAttribute, unwrap, documentOverride ?? window!.document as unknown as Document, RouterLink, RouterView);
}
