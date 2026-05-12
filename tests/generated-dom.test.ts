import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { compile } from "../src/compiler/index.js";
import { createMemoryHistory, createRouter, provideRouter, RouterLink, RouterView, useRoute, useRouter } from "../src/router/index.js";
import {
  computed,
  defineAsyncComponent,
  emitDebugEvent,
  effect,
  inject,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  onUnmounted,
  provide,
  queueJob,
  reactive,
  ref,
  registerDebugComponent,
  setAttribute,
  toRef,
  toRefs,
  unref,
  unwrap,
  watch,
  watchEffect
} from "../src/runtime/index.js";

type CompiledModule = {
  inheritAttrs?: boolean;
  mount(target: Element | DocumentFragment, props?: Record<string, unknown>): MikuruComponentInstance;
};

type MikuruComponentInstance = {
  element: Element | Comment;
  activate?: () => void;
  deactivate?: () => void;
  unmount(): void;
};

type CompiledFixture = {
  document: Document;
  module: CompiledModule;
  root: HTMLDivElement;
  window: Window;
};

describe("generated DOM code", () => {
  it("registers debug metadata only for debug builds", () => {
    const previousHook = (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__;
    delete (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__;

    try {
      const normalCode = compile(`<template><p>{{ message }}</p></template><script>const message = "quiet";</script>`, {
        filename: "QuietDebug.mikuru"
      }).code;
      expect(normalCode).not.toContain("__MIKURU_DEVTOOLS__");

      const fixture = compileForDom(
        `<template><p>{{ message }}</p></template><script>const message = "debug";</script>`,
        { debug: true, filename: "DebugPanel.mikuru" }
      );
      const instance = fixture.module.mount(fixture.root, { label: "Visible", __mikuru_context: {} });
      const hook = (globalThis as { __MIKURU_DEVTOOLS__?: { components?: Map<number, unknown>; events?: Array<{ type: string }> } }).__MIKURU_DEVTOOLS__;
      const component = Array.from(hook?.components?.values() ?? [])[0] as
        | {
            id?: number;
            filename?: string;
            name?: string;
            props?: Record<string, unknown>;
            root?: Element | Comment;
            mountedAt?: number;
            children?: Set<number>;
          }
        | undefined;

      expect(component).toMatchObject({
        filename: "DebugPanel.mikuru",
        name: "DebugPanel.mikuru",
        props: { label: "Visible" },
        propKeys: ["label"],
        attrs: {},
        attrKeys: [],
        root: instance.element
      });
      expect(component?.id).toBe(1);
      expect(component?.mountedAt).toEqual(expect.any(Number));
      expect(component?.children).toBeInstanceOf(Set);
      expect(hook?.events?.map((event) => event.type)).toContain("component:mount");

      instance.unmount();

      expect(hook?.components?.size).toBe(0);
      expect(hook?.events?.map((event) => event.type)).toContain("component:unmount");
    } finally {
      if (previousHook === undefined) {
        delete (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__;
      } else {
        (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__ = previousHook;
      }
    }
  });

  it("emits debug events for ErrorBoundary fallbacks", () => {
    const previousHook = (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__;
    delete (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__;

    try {
      const fixture = compileForDom(
        `<template><ErrorBoundary :fallback="ErrorView"><Broken /></ErrorBoundary></template>
<script>
const Broken = {
  mount() {
    throw new Error("debug boom");
  }
};
const ErrorView = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.errorInfo.phase + ":" + props.error.message;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};
</script>`,
        { debug: true, filename: "DebugError.mikuru" }
      );

      fixture.module.mount(fixture.root, {});
      const hook = (globalThis as { __MIKURU_DEVTOOLS__?: { events?: Array<{ type: string; payload?: { errorInfo?: { phase?: string } } }> } }).__MIKURU_DEVTOOLS__;
      const errorEvent = hook?.events?.find((event) => event.type === "component:error");

      expect(fixture.root.textContent).toBe("mount:debug boom");
      expect(errorEvent?.payload?.errorInfo?.phase).toBe("mount");
    } finally {
      if (previousHook === undefined) {
        delete (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__;
      } else {
        (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__ = previousHook;
      }
    }
  });

  it("emits debug events for AsyncBoundary pending and resolved states", async () => {
    const previousHook = (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__;
    delete (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__;

    try {
      const fixture = compileForDom(
        `<template><AsyncBoundary :loading="Loading" :fallback="ErrorView"><AsyncMessage /></AsyncBoundary></template>
<script>
import { defineAsyncComponent } from "mikuru";
const Loading = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = "pending " + props.pending;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};
const ErrorView = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.error.message;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};
const Message = {
  mount(target) {
    const p = document.createElement("p");
    p.textContent = "loaded";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};
const AsyncMessage = defineAsyncComponent(() => Promise.resolve(Message));
</script>`,
        { debug: true, filename: "DebugAsync.mikuru" }
      );

      fixture.module.mount(fixture.root, {});
      await Promise.resolve();
      await Promise.resolve();

      const hook = (globalThis as { __MIKURU_DEVTOOLS__?: { events?: Array<{ type: string }> } }).__MIKURU_DEVTOOLS__;
      expect(hook?.events?.map((event) => event.type)).toEqual(expect.arrayContaining(["async:pending", "async:resolved"]));
      expect(fixture.root.textContent).toBe("loaded");
    } finally {
      if (previousHook === undefined) {
        delete (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__;
      } else {
        (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__ = previousHook;
      }
    }
  });

  it("updates interpolated text after an event handler changes state", () => {
    const fixture = compileForDom(`<template>
  <button @click="increment">count: {{ count }}</button>
</template>

<script>
import { ref } from "mikuru";

const count = ref(0);

function increment() {
  count.value += 1;
}
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");

    expect(button?.textContent).toBe("count: 0");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(button?.textContent).toBe("count: 1");
  });

  it("updates bound attributes", () => {
    const fixture = compileForDom(`<template>
  <section>
    <p :class="className">{{ className }}</p>
    <button @click="toggle">Toggle</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const className = ref("idle");

function toggle() {
  className.value = "active";
}
</script>`);

    fixture.module.mount(fixture.root);
    const paragraph = fixture.root.querySelector("p");
    const button = fixture.root.querySelector("button");

    expect(paragraph?.className).toBe("idle");
    expect(paragraph?.textContent).toBe("idle");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(paragraph?.className).toBe("active");
    expect(paragraph?.textContent).toBe("active");
  });

  it("supports v-html and v-text content directives", () => {
    const fixture = compileForDom(`<template>
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
</script>`);

    fixture.module.mount(fixture.root);
    const article = fixture.root.querySelector("article");
    const paragraph = fixture.root.querySelector("p");

    expect(article?.innerHTML).toBe("<strong>raw</strong>");
    expect(paragraph?.textContent).toBe("<safe>");
    expect(paragraph?.innerHTML).toBe("&lt;safe&gt;");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(article?.innerHTML).toBe("<em>next</em>");
    expect(paragraph?.textContent).toBe("updated");
  });

  it("supports v-pre and v-cloak directives", () => {
    const fixture = compileForDom(`<template>
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
</script>`);

    fixture.module.mount(fixture.root);
    const article = fixture.root.querySelector("article");
    const paragraph = fixture.root.querySelector("p");
    const span = fixture.root.querySelector("span");

    expect(article?.textContent).toBe("{{ message }}Raw");
    expect(article?.getAttribute(":id")).toBe("rawId");
    expect(article?.getAttribute("@click")).toBe("ignored");
    expect(span?.getAttribute("v-if")).toBe("false");
    expect(paragraph?.hasAttribute("v-cloak")).toBe(false);
    expect(paragraph?.textContent).toBe("Hello");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(article?.textContent).toBe("{{ message }}Raw");
    expect(paragraph?.textContent).toBe("Updated");
  });

  it("supports dynamic attribute and event arguments", () => {
    const fixture = compileForDom(`<template>
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
</script>`);

    fixture.module.mount(fixture.root);
    const target = fixture.root.querySelector("button");
    const switcher = fixture.root.querySelectorAll("button")[1];

    expect(target?.getAttribute("data-mode")).toBe("ready");
    expect(target?.getAttribute("title")).toBe(null);
    expect(target?.textContent).toBe("0");

    target?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(target?.textContent).toBe("1");

    switcher?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(target?.getAttribute("data-mode")).toBe(null);
    expect(target?.getAttribute("title")).toBe("done");

    target?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(target?.textContent).toBe("1");

    target?.dispatchEvent(createEvent(fixture.window, "mouseover"));
    expect(target?.textContent).toBe("2");
  });

  it("supports keyboard and system event modifiers", () => {
    const fixture = compileForDom(`<template>
  <section>
    <input @keydown.enter="submit" @keydown.escape="cancel" @keydown.ctrl.enter="submitCtrl" />
    <p>{{ submitted }}:{{ cancelled }}:{{ submittedCtrl }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const submitted = ref(0);
const cancelled = ref(0);
const submittedCtrl = ref(0);

function submit() {
  submitted.value += 1;
}

function cancel() {
  cancelled.value += 1;
}

function submitCtrl() {
  submittedCtrl.value += 1;
}
</script>`);

    fixture.module.mount(fixture.root);
    const input = fixture.root.querySelector("input");
    const summary = fixture.root.querySelector("p");

    input?.dispatchEvent(new fixture.window.KeyboardEvent("keydown", { key: "a" }) as unknown as Event);
    expect(summary?.textContent).toBe("0:0:0");

    input?.dispatchEvent(new fixture.window.KeyboardEvent("keydown", { key: "Enter" }) as unknown as Event);
    expect(summary?.textContent).toBe("1:0:0");

    input?.dispatchEvent(new fixture.window.KeyboardEvent("keydown", { key: "Escape" }) as unknown as Event);
    expect(summary?.textContent).toBe("1:1:0");

    input?.dispatchEvent(new fixture.window.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }) as unknown as Event);
    expect(summary?.textContent).toBe("2:1:1");
  });

  it("supports mouse button and exact event modifiers", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click.left="left += 1" @click.right="right += 1" @click.middle="middle += 1" @click.ctrl.exact="exact += 1">{{ left }}:{{ right }}:{{ middle }}:{{ exact }}</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const left = ref(0);
const right = ref(0);
const middle = ref(0);
const exact = ref(0);
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");

    button?.dispatchEvent(new fixture.window.MouseEvent("click", { button: 0 }) as unknown as Event);
    expect(button?.textContent).toBe("1:0:0:0");

    button?.dispatchEvent(new fixture.window.MouseEvent("click", { button: 2 }) as unknown as Event);
    expect(button?.textContent).toBe("1:1:0:0");

    button?.dispatchEvent(new fixture.window.MouseEvent("click", { button: 1 }) as unknown as Event);
    expect(button?.textContent).toBe("1:1:1:0");

    button?.dispatchEvent(new fixture.window.MouseEvent("click", { button: 0, ctrlKey: true, shiftKey: true }) as unknown as Event);
    expect(button?.textContent).toBe("2:1:1:0");

    button?.dispatchEvent(new fixture.window.MouseEvent("click", { button: 0, ctrlKey: true }) as unknown as Event);
    expect(button?.textContent).toBe("3:1:1:1");
  });

  it("supports inline event handler assignments and updates", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="count += 1">{{ count }}</button>
    <input @input="name = $event.target.value" />
    <p>{{ name }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const count = ref(0);
const name = ref("Mikuru");
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");
    const input = fixture.root.querySelector("input") as HTMLInputElement | null;
    const paragraph = fixture.root.querySelector("p");

    expect(button?.textContent).toBe("0");
    button?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(button?.textContent).toBe("1");

    if (input) {
      input.value = "Inline";
      input.dispatchEvent(createEvent(fixture.window, "input"));
    }

    expect(paragraph?.textContent).toBe("Inline");
  });

  it("syncs boolean and form property bindings", () => {
    const fixture = compileForDom(`<template>
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
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");
    const checkbox = fixture.root.querySelector("input[type='checkbox']") as HTMLInputElement | null;
    const textInput = fixture.root.querySelector("input:not([type])") as HTMLInputElement | null;
    const paragraph = fixture.root.querySelector("p");

    expect(button?.disabled).toBe(true);
    expect(button?.hasAttribute("disabled")).toBe(true);
    expect(checkbox?.checked).toBe(true);
    expect(checkbox?.hasAttribute("checked")).toBe(true);
    expect(textInput?.value).toBe("Mikuru");
    expect(paragraph?.getAttribute("data-enabled")).toBe("false");

    fixture.root.querySelectorAll("button")[1]?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(button?.disabled).toBe(false);
    expect(button?.hasAttribute("disabled")).toBe(false);
    expect(checkbox?.checked).toBe(false);
    expect(checkbox?.hasAttribute("checked")).toBe(false);
    expect(textInput?.value).toBe("Updated");
    expect(paragraph?.getAttribute("data-enabled")).toBe("true");
  });

  it("supports v-bind .prop, .attr, and .camel modifiers", () => {
    const fixture = compileForDom(`<template>
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
</script>`);

    fixture.module.mount(fixture.root);
    const inputs = fixture.root.querySelectorAll<HTMLInputElement>("input");
    const propertyInput = inputs[0];
    const attributeInput = inputs[1];
    const profile = fixture.root.querySelector("div");

    expect(propertyInput?.indeterminate).toBe(true);
    expect(propertyInput?.hasAttribute("indeterminate")).toBe(false);
    expect(attributeInput?.indeterminate).toBe(false);
    expect(attributeInput?.getAttribute("indeterminate")).toBe("true");
    expect(profile?.getAttribute("dataUserId")).toBe("42");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(propertyInput?.indeterminate).toBe(false);
    expect(propertyInput?.hasAttribute("indeterminate")).toBe(false);
    expect(attributeInput?.getAttribute("indeterminate")).toBe("false");
    expect(profile?.getAttribute("dataUserId")).toBe("84");
  });

  it("supports object-form v-bind modifiers on native elements", () => {
    const fixture = compileForDom(`<template>
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
</script>`);

    fixture.module.mount(fixture.root);
    const inputs = fixture.root.querySelectorAll<HTMLInputElement>("input");
    const propertyInput = inputs[0];
    const attributeInput = inputs[1];
    const profile = fixture.root.querySelector("p");

    expect(propertyInput?.indeterminate).toBe(true);
    expect(propertyInput?.hasAttribute("indeterminate")).toBe(false);
    expect(attributeInput?.indeterminate).toBe(false);
    expect(attributeInput?.getAttribute("indeterminate")).toBe("true");
    expect(profile?.getAttribute("dataUserId")).toBe("42");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(propertyInput?.indeterminate).toBe(false);
    expect(propertyInput?.hasAttribute("indeterminate")).toBe(false);
    expect(attributeInput?.getAttribute("indeterminate")).toBe("false");
    expect(profile?.getAttribute("dataUserId")).toBe("84");
  });

  it("normalizes array and object class bindings", () => {
    const fixture = compileForDom(`<template>
  <section>
    <p :class="['base', { active: isActive, hidden: false }]">classed</p>
    <button @click="toggle">Toggle</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const isActive = ref(false);

function toggle() {
  isActive.value = true;
}
</script>`);

    fixture.module.mount(fixture.root);
    const paragraph = fixture.root.querySelector("p");
    const button = fixture.root.querySelector("button");

    expect(paragraph?.className).toBe("base");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(paragraph?.className).toBe("base active");
  });

  it("preserves static classes when dynamic class bindings update", () => {
    const fixture = compileForDom(`<template>
  <section>
    <p class="note-card" :class="{ archived }">Card</p>
    <button @click="toggle">Toggle</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const archived = ref(false);

function toggle() {
  archived.value = true;
}
</script>`);

    fixture.module.mount(fixture.root);
    const paragraph = fixture.root.querySelector("p");

    expect(paragraph?.className).toBe("note-card");
    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(paragraph?.className).toBe("note-card archived");
  });

  it("normalizes object and array style bindings", () => {
    const fixture = compileForDom(`<template>
  <section>
    <p :style="[{ color }, { fontSize: size, display: visible ? 'block' : null }]">styled</p>
    <button @click="update">Update</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const color = ref("red");
const size = ref("12px");
const visible = ref(true);

function update() {
  color.value = "blue";
  size.value = "16px";
  visible.value = false;
}
</script>`);

    fixture.module.mount(fixture.root);
    const paragraph = fixture.root.querySelector("p");

    expect(paragraph?.getAttribute("style")).toBe("color: red; font-size: 12px; display: block");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(paragraph?.getAttribute("style")).toBe("color: blue; font-size: 16px");
  });

  it("preserves static styles when dynamic style bindings update", () => {
    const fixture = compileForDom(`<template>
  <section>
    <p style="border-color: black" :style="{ color, fontSize: size }">styled</p>
    <div style="margin-top: 4px" v-bind="attrs">bound</div>
    <button @click="update">Update</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const color = ref("red");
const size = ref("12px");
const attrs = ref({
  style: { backgroundColor: "yellow" },
  title: "ready"
});

function update() {
  color.value = "blue";
  size.value = "16px";
  attrs.value = {
    "data-mode": "done"
  };
}
</script>`);

    fixture.module.mount(fixture.root);
    const paragraph = fixture.root.querySelector("p");
    const bound = fixture.root.querySelector("div");

    expect(paragraph?.getAttribute("style")).toBe("border-color: black; color: red; font-size: 12px");
    expect(bound?.getAttribute("style")).toBe("margin-top: 4px; background-color: yellow");
    expect(bound?.getAttribute("title")).toBe("ready");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(paragraph?.getAttribute("style")).toBe("border-color: black; color: blue; font-size: 16px");
    expect(bound?.getAttribute("style")).toBe("margin-top: 4px");
    expect(bound?.hasAttribute("title")).toBe(false);
    expect(bound?.getAttribute("data-mode")).toBe("done");
  });

  it("auto-unwraps refs inside event call expressions", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="select(current.id)">Select</button>
    <p>{{ selected }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const current = ref({ id: "note-1" });
const selected = ref("none");

function select(id) {
  selected.value = id;
}
</script>`);

    fixture.module.mount(fixture.root);
    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")?.textContent).toBe("note-1");
  });

  it("supports long-form v-on and v-bind directives", () => {
    const fixture = compileForDom(`<template>
  <button v-on:click="toggle" v-bind:class="className">{{ className }}</button>
</template>

<script>
import { ref } from "mikuru";

const className = ref("idle");

function toggle() {
  className.value = "active";
}
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");

    expect(button?.className).toBe("idle");
    expect(button?.textContent).toBe("idle");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(button?.className).toBe("active");
    expect(button?.textContent).toBe("active");
  });

  it("supports object-form v-bind on DOM elements", () => {
    const fixture = compileForDom(`<template>
  <section>
    <p class="static" v-bind="attrs">bound</p>
    <button @click="update">Update</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const attrs = ref({
  title: "Initial",
  "data-state": "ready"
});

function update() {
  attrs.value = {
    title: "Updated",
    hidden: false
  };
}
</script>`);

    fixture.module.mount(fixture.root);
    const paragraph = fixture.root.querySelector("p");

    expect(paragraph?.getAttribute("title")).toBe("Initial");
    expect(paragraph?.getAttribute("data-state")).toBe("ready");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(paragraph?.getAttribute("title")).toBe("Updated");
    expect(paragraph?.hasAttribute("data-state")).toBe(false);
    expect(paragraph?.hasAttribute("hidden")).toBe(false);
  });

  it("supports object-form v-on on DOM elements", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button v-on="listeners">Select</button>
    <button @click="swap">Swap</button>
    <p>{{ selected }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const selected = ref("none");
const listeners = ref({
  click() {
    selected.value = "first";
  },
  mouseover() {
    selected.value = "hover";
  }
});

function swap() {
  listeners.value = {
    click() {
      selected.value = "second";
    }
  };
}
</script>`);

    fixture.module.mount(fixture.root);
    const buttons = fixture.root.querySelectorAll("button");

    buttons[0]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(fixture.root.querySelector("p")?.textContent).toBe("first");
    buttons[0]?.dispatchEvent(createEvent(fixture.window, "mouseover"));
    expect(fixture.root.querySelector("p")?.textContent).toBe("hover");

    buttons[1]?.dispatchEvent(createEvent(fixture.window, "click"));
    buttons[0]?.dispatchEvent(createEvent(fixture.window, "mouseover"));
    expect(fixture.root.querySelector("p")?.textContent).toBe("hover");
    buttons[0]?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")?.textContent).toBe("second");
  });

  it("supports prevent and stop event modifiers on DOM events", () => {
    const fixture = compileForDom(`<template>
  <form @submit.prevent="submit">
    <div @click="outer">
      <button @click.stop="inner">Inner</button>
    </div>
    <button type="submit">Submit</button>
    <p>{{ submitted }}:{{ outerCount }}:{{ innerCount }}</p>
  </form>
</template>

<script>
import { ref } from "mikuru";

const submitted = ref(false);
const outerCount = ref(0);
const innerCount = ref(0);

function submit() {
  submitted.value = true;
}

function outer() {
  outerCount.value += 1;
}

function inner() {
  innerCount.value += 1;
}
</script>`);

    fixture.module.mount(fixture.root);
    const buttons = fixture.root.querySelectorAll("button");
    const form = fixture.root.querySelector("form");
    const innerClick = createEvent(fixture.window, "click");
    const submit = createEvent(fixture.window, "submit", { cancelable: true });

    buttons[0]?.dispatchEvent(innerClick);
    form?.dispatchEvent(submit);

    expect(fixture.root.querySelector("p")?.textContent).toBe("true:0:1");
    expect(innerClick.cancelBubble).toBe(true);
    expect(submit.defaultPrevented).toBe(true);
  });

  it("supports self, once, and capture event modifiers on DOM events", () => {
    const fixture = compileForDom(`<template>
  <section>
    <div @click.capture="parentCapture" @click.self="selfOnly">
      <button @click.once="child">Child</button>
    </div>
    <p>{{ log }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const log = ref("");

function push(value) {
  log.value = log.value ? log.value + "," + value : value;
}

function parentCapture() {
  push("capture");
}

function selfOnly() {
  push("self");
}

function child() {
  push("child");
}
</script>`);

    fixture.module.mount(fixture.root);
    const div = fixture.root.querySelector("div");
    const button = fixture.root.querySelector("button");

    button?.dispatchEvent(createEvent(fixture.window, "click"));
    button?.dispatchEvent(createEvent(fixture.window, "click"));
    div?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")?.textContent).toBe("capture,child,capture,capture,self");
  });

  it("syncs text inputs with v-model", () => {
    const fixture = compileForDom(`<template>
  <section>
    <input v-model="name" />
    <p>{{ name }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const name = ref("Mikuru");
</script>`);

    fixture.module.mount(fixture.root);
    const input = fixture.root.querySelector("input");
    const paragraph = fixture.root.querySelector("p");

    expect(input?.value).toBe("Mikuru");
    expect(paragraph?.textContent).toBe("Mikuru");

    if (input) {
      input.value = "Vue-like";
      input.dispatchEvent(createEvent(fixture.window, "input"));
    }

    expect(paragraph?.textContent).toBe("Vue-like");
  });

  it("batches generated DOM updates when enabled", async () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="update">Update</button>
    <p>{{ first }}:{{ second }}</p>
  </section>
</template>

<script>
import { nextTick, ref } from "mikuru";

const first = ref("a");
const second = ref("b");

function update() {
  first.value = "A";
  second.value = "B";
}
</script>`, { batchedUpdates: true });

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");
    const paragraph = fixture.root.querySelector("p");

    expect(paragraph?.textContent).toBe("a:b");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(paragraph?.textContent).toBe("a:b");

    await nextTick();

    expect(paragraph?.textContent).toBe("A:B");
  });

  it("renders reactive object state in generated DOM", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="increment">Increment</button>
    <p>{{ state.count }}:{{ state.items.length }}</p>
  </section>
</template>

<script>
import { reactive } from "mikuru";

const state = reactive({ count: 0, items: ["a"] });

function increment() {
  state.count += 1;
  state.items.push("b");
}
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");
    const paragraph = fixture.root.querySelector("p");

    expect(paragraph?.textContent).toBe("0:1");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(paragraph?.textContent).toBe("1:2");
  });

  it("syncs textarea, checkbox, and select controls with v-model", () => {
    const fixture = compileForDom(`<template>
  <section>
    <textarea v-model="message"></textarea>
    <input type="checkbox" v-model="enabled">
    <select v-model="flavor">
      <option value="mint">Mint</option>
      <option value="berry">Berry</option>
    </select>
    <p>{{ message }}:{{ enabled }}:{{ flavor }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const message = ref("hello");
const enabled = ref(false);
const flavor = ref("mint");
</script>`);

    fixture.module.mount(fixture.root);
    const textarea = fixture.root.querySelector("textarea");
    const checkbox = fixture.root.querySelector("input");
    const select = fixture.root.querySelector("select");
    const paragraph = fixture.root.querySelector("p");

    expect(textarea?.value).toBe("hello");
    expect(checkbox?.checked).toBe(false);
    expect(select?.value).toBe("mint");
    expect(paragraph?.textContent).toBe("hello:false:mint");

    if (textarea && checkbox && select) {
      textarea.value = "updated";
      textarea.dispatchEvent(createEvent(fixture.window, "input"));
      checkbox.checked = true;
      checkbox.dispatchEvent(createEvent(fixture.window, "change"));
      select.value = "berry";
      select.dispatchEvent(createEvent(fixture.window, "change"));
    }

    expect(paragraph?.textContent).toBe("updated:true:berry");
  });

  it("syncs radio, multiple select, and v-model modifiers", () => {
    const fixture = compileForDom(`<template>
  <section>
    <input type="radio" value="1" v-model.number="choice">
    <input type="radio" value="2" v-model.number="choice">
    <input v-model.trim.lazy="name">
    <input v-model.number="amount">
    <select multiple v-model.number="selected">
      <option value="1">One</option>
      <option value="2">Two</option>
      <option value="3">Three</option>
    </select>
    <p>{{ choice }}:{{ name }}:{{ amount }}:{{ selected.join(",") }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const choice = ref(2);
const name = ref("Mikuru");
const amount = ref(1);
const selected = ref([1, 3]);
</script>`);

    fixture.module.mount(fixture.root);
    const radios = fixture.root.querySelectorAll<HTMLInputElement>("input[type='radio']");
    const textInputs = fixture.root.querySelectorAll<HTMLInputElement>("input:not([type='radio'])");
    const select = fixture.root.querySelector("select");
    const paragraph = fixture.root.querySelector("p");

    expect(radios[0]?.checked).toBe(false);
    expect(radios[1]?.checked).toBe(true);
    expect(textInputs[0]?.value).toBe("Mikuru");
    expect(textInputs[1]?.value).toBe("1");
    expect(Array.from(select?.selectedOptions ?? []).map((option) => option.getAttribute("value"))).toEqual(["1", "3"]);
    expect(paragraph?.textContent).toBe("2:Mikuru:1:1,3");

    if (radios[0] && textInputs[0] && textInputs[1] && select) {
      radios[0].checked = true;
      radios[0].dispatchEvent(createEvent(fixture.window, "change"));
      textInputs[0].value = "  trimmed  ";
      textInputs[0].dispatchEvent(createEvent(fixture.window, "input"));
      expect(paragraph?.textContent).toBe("1:Mikuru:1:1,3");
      textInputs[0].dispatchEvent(createEvent(fixture.window, "change"));
      textInputs[1].value = "42";
      textInputs[1].dispatchEvent(createEvent(fixture.window, "input"));
      for (const option of Array.from(select.options)) {
        option.selected = option.getAttribute("value") !== "1";
      }
      select.dispatchEvent(createEvent(fixture.window, "change"));
    }

    expect(paragraph?.textContent).toBe("1:trimmed:42:2,3");
  });

  it("syncs checkbox arrays with v-model", () => {
    const fixture = compileForDom(`<template>
  <section>
    <input type="checkbox" value="1" v-model.number="selected">
    <input type="checkbox" value="2" v-model.number="selected">
    <p>{{ selected.join(",") }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const selected = ref([2]);
</script>`);

    fixture.module.mount(fixture.root);
    const checkboxes = fixture.root.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    const paragraph = fixture.root.querySelector("p");

    expect(checkboxes[0]?.checked).toBe(false);
    expect(checkboxes[1]?.checked).toBe(true);
    expect(paragraph?.textContent).toBe("2");

    checkboxes[0].checked = true;
    checkboxes[0].dispatchEvent(createEvent(fixture.window, "change"));
    expect(paragraph?.textContent).toBe("2,1");

    checkboxes[1].checked = false;
    checkboxes[1].dispatchEvent(createEvent(fixture.window, "change"));
    expect(paragraph?.textContent).toBe("1");
  });

  it("adds scoped style attributes and injects scoped CSS", () => {
    const fixture = compileForDom(`<template>
  <section>
    <p>Hello</p>
  </section>
</template>

<style scoped>
section, p:hover {
  color: red;
}
</style>`);

    fixture.module.mount(fixture.root);
    const section = fixture.root.querySelector("section");
    const paragraph = fixture.root.querySelector("p");
    const style = fixture.document.head.querySelector("style[data-mikuru-style]");
    const scopeAttr = Array.from(section?.attributes ?? []).find((attr) => attr.name.startsWith("data-mikuru-scope-"))?.name;

    expect(scopeAttr).toBeTruthy();
    expect(paragraph?.hasAttribute(scopeAttr ?? "")).toBe(true);
    expect(style?.textContent).toContain(`section[${scopeAttr}]`);
    expect(style?.textContent).toContain(`p[${scopeAttr}]:hover`);
  });

  it("toggles visibility with v-show without removing the element", () => {
    const fixture = compileForDom(`<template>
  <section>
    <p v-show="visible">Visible</p>
    <button @click="toggle">Toggle</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const visible = ref(true);

function toggle() {
  visible.value = !visible.value;
}
</script>`);

    fixture.module.mount(fixture.root);
    const paragraph = fixture.root.querySelector("p") as HTMLParagraphElement | null;
    const button = fixture.root.querySelector("button");

    expect(paragraph?.style.display).toBe("");
    expect(paragraph?.textContent).toBe("Visible");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")).toBe(paragraph);
    expect(paragraph?.style.display).toBe("none");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(paragraph?.style.display).toBe("");
  });

  it("renders v-once element bindings only once", async () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="change">Change</button>
    <p v-once :title="message">{{ message }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const message = ref("Initial");

function change() {
  message.value = "Updated";
}
</script>`);

    fixture.module.mount(fixture.root);
    const paragraph = fixture.root.querySelector("p");
    expect(paragraph?.textContent).toBe("Initial");
    expect(paragraph?.getAttribute("title")).toBe("Initial");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));
    await Promise.resolve();

    expect(paragraph?.textContent).toBe("Initial");
    expect(paragraph?.getAttribute("title")).toBe("Initial");
  });

  it("passes v-once component props as one-time snapshots", async () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="change">Change</button>
    <Child v-once :message="message" />
  </section>
</template>

<script>
import { ref } from "mikuru";

const message = ref("Initial");

const Child = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.message;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

function change() {
  message.value = "Updated";
}
</script>`);

    fixture.module.mount(fixture.root);
    expect(fixture.root.querySelector("p")?.textContent).toBe("Initial");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));
    await Promise.resolve();

    expect(fixture.root.querySelector("p")?.textContent).toBe("Initial");
  });

  it("mounts and unmounts v-if branches", () => {
    const fixture = compileForDom(`<template>
  <section>
    <p v-if="visible">Visible</p>
    <button @click="toggle">Toggle</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const visible = ref(true);

function toggle() {
  visible.value = !visible.value;
}
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");

    expect(fixture.root.querySelector("p")?.textContent).toBe("Visible");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")).toBeNull();

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")?.textContent).toBe("Visible");
  });

  it("switches v-if, v-else-if, and v-else branches", () => {
    const fixture = compileForDom(`<template>
  <section>
    <p v-if="mode === 'one'">One</p>
    <p v-else-if="mode === 'two'">Two</p>
    <p v-else>Fallback</p>
    <button @click="next">Next</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const mode = ref("one");

function next() {
  mode.value = mode.value === "one" ? "two" : mode.value === "two" ? "other" : "one";
}
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");

    expect(fixture.root.querySelector("p")?.textContent).toBe("One");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")?.textContent).toBe("Two");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")?.textContent).toBe("Fallback");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")?.textContent).toBe("One");
  });

  it("auto-unwraps refs inside template expressions", () => {
    const fixture = compileForDom(`<template>
  <section>
    <p :class="{ active: mode === 'one' }">{{ mode === 'one' ? 'active' : 'paused' }}</p>
    <button @click="toggle">Toggle</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const mode = ref("one");

function toggle() {
  mode.value = "two";
}
</script>`);

    fixture.module.mount(fixture.root);
    const paragraph = fixture.root.querySelector("p");
    const button = fixture.root.querySelector("button");

    expect(paragraph?.className).toBe("active");
    expect(paragraph?.textContent).toBe("active");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(paragraph?.className).toBe("");
    expect(paragraph?.textContent).toBe("paused");
  });

  it("keeps ref interop helpers usable from script imports", () => {
    const fixture = compileForDom(`<template>
  <section>
    <p>{{ count }}:{{ label }}:{{ plain }}</p>
    <button @click="update">Update</button>
  </section>
</template>

<script>
import { reactive, toRef, toRefs, unref } from "mikuru";

const state = reactive({ count: 0, label: "idle" });
const count = toRef(state, "count");
const { label } = toRefs(state);
const plain = unref("plain");

function update() {
  count.value += 1;
  label.value = "ready";
}
</script>`);

    fixture.module.mount(fixture.root);
    const paragraph = fixture.root.querySelector("p");
    const button = fixture.root.querySelector("button");

    expect(paragraph?.textContent).toBe("0:idle:plain");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(paragraph?.textContent).toBe("1:ready:plain");
  });

  it("renders v-for items", () => {
    const fixture = compileForDom(`<template>
  <section>
    <ul>
      <li v-for="item in items">{{ item }}</li>
    </ul>
    <button @click="add">Add</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const items = ref(["one", "two"]);

function add() {
  items.value = [...items.value, "three"];
}
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");

    expect(Array.from(fixture.root.querySelectorAll("li")).map((item) => item.textContent)).toEqual(["one", "two"]);

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(Array.from(fixture.root.querySelectorAll("li")).map((item) => item.textContent)).toEqual([
      "one",
      "two",
      "three"
    ]);
  });

  it("renders v-for items with of syntax and index aliases", () => {
    const fixture = compileForDom(`<template>
  <section>
    <p v-for="(item, index) of items" :key="item.id">{{ index }}:{{ item.label }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const items = ref([
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" }
]);
</script>`);

    fixture.module.mount(fixture.root);

    expect(Array.from(fixture.root.querySelectorAll("p")).map((item) => item.textContent)).toEqual(["0:Alpha", "1:Beta"]);
    expect(Array.from(fixture.root.querySelectorAll("p")).some((item) => item.hasAttribute("key"))).toBe(false);
  });

  it("reuses keyed v-for elements across reorders", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="swap">Swap</button>
    <article v-for="(item, index) in items" :key="item.id">{{ index }}:{{ item.label }}</article>
  </section>
</template>

<script>
import { ref } from "mikuru";

const items = ref([
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" }
]);

function swap() {
  items.value = [
    { id: "b", label: "Beta updated" },
    { id: "a", label: "Alpha updated" }
  ];
}
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");
    const firstRender = Array.from(fixture.root.querySelectorAll("article"));

    button?.dispatchEvent(createEvent(fixture.window, "click"));
    const secondRender = Array.from(fixture.root.querySelectorAll("article"));

    expect(secondRender).toEqual([firstRender[1], firstRender[0]]);
    expect(secondRender.map((item) => item.textContent)).toEqual(["0:Beta updated", "1:Alpha updated"]);
  });

  it("handles keyed v-for insert, remove, and reorder while preserving matching elements", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="shuffle">Shuffle</button>
    <article v-for="item in items" :key="item.id">{{ item.label }}</article>
  </section>
</template>

<script>
import { ref } from "mikuru";

const items = ref([
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" }
]);

function shuffle() {
  items.value = [
    { id: "c", label: "Gamma updated" },
    { id: "d", label: "Delta" },
    { id: "a", label: "Alpha updated" }
  ];
}
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");
    const firstRender = Array.from(fixture.root.querySelectorAll("article"));

    button?.dispatchEvent(createEvent(fixture.window, "click"));
    const secondRender = Array.from(fixture.root.querySelectorAll("article"));

    expect(secondRender.map((item) => item.textContent)).toEqual(["Gamma updated", "Delta", "Alpha updated"]);
    expect(secondRender[0]).toBe(firstRender[2]);
    expect(secondRender[2]).toBe(firstRender[0]);
    expect(secondRender).not.toContain(firstRender[1]);
  });

  it("cleans removed keyed v-for element listeners", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="removeFirst">Remove first</button>
    <article v-for="item in items" :key="item.id">
      <button @click="select(item.id)">Select {{ item.id }}</button>
    </article>
    <p>{{ selected }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const selected = ref("none");
const items = ref([
  { id: "a" },
  { id: "b" }
]);

function select(id) {
  selected.value = id;
}

function removeFirst() {
  items.value = items.value.slice(1);
}
</script>`);

    fixture.module.mount(fixture.root);
    const removeButton = fixture.root.querySelector("section > button");
    const removedItemButton = fixture.root.querySelector("article button");

    removedItemButton?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(fixture.root.querySelector("p")?.textContent).toBe("a");

    removeButton?.dispatchEvent(createEvent(fixture.window, "click"));
    removedItemButton?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(Array.from(fixture.root.querySelectorAll("article button")).map((button) => button.textContent)).toEqual(["Select b"]);
    expect(fixture.root.querySelector("p")?.textContent).toBe("a");
  });

  it("keeps keyed component v-for event updates stable", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Child v-for="item in items" :key="item.id" :item="item" @toggle="toggle" />
    <p>{{ visible.length }}</p>
  </section>
</template>

<script>
import { computed, ref } from "mikuru";

const items = ref([
  { id: "a", archived: false },
  { id: "b", archived: true }
]);
const visible = computed(() => items.value.filter((item) => true));

const Child = {
  mount(target, props) {
    const button = document.createElement("button");
    const stop = effect(() => {
      button.textContent = props.item.archived ? "Restore" : "Archive";
    });
    button.addEventListener("click", () => props.onToggle(props.item.id));
    target.appendChild(button);
    return {
      element: button,
      unmount() {
        stop();
        button.remove();
      }
    };
  }
};

function toggle(id) {
  items.value = items.value.map((item) => item.id === id ? { ...item, archived: !item.archived } : item);
}
</script>`);

    fixture.module.mount(fixture.root);

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(Array.from(fixture.root.querySelectorAll("button")).map((button) => button.textContent)).toEqual(["Restore", "Restore"]);
    expect(fixture.root.querySelector("p")?.textContent).toBe("2");
  });

  it("skips keyed v-for updates while v-memo dependencies are unchanged", async () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="renameWithoutMemoChange">Hidden</button>
    <button @click="renameWithMemoChange">Visible</button>
    <article v-for="item in items" :key="item.id" v-memo="[item.version]">{{ item.label }}</article>
  </section>
</template>

<script>
import { ref } from "mikuru";

const items = ref([{ id: "a", version: 1, label: "Alpha" }]);

function renameWithoutMemoChange() {
  items.value = [{ id: "a", version: 1, label: "Hidden" }];
}

function renameWithMemoChange() {
  items.value = [{ id: "a", version: 2, label: "Visible" }];
}
</script>`);

    fixture.module.mount(fixture.root);
    expect(fixture.root.querySelector("article")?.textContent).toBe("Alpha");

    fixture.root.querySelectorAll("button")[0]?.dispatchEvent(createEvent(fixture.window, "click"));
    await Promise.resolve();
    expect(fixture.root.querySelector("article")?.textContent).toBe("Alpha");

    fixture.root.querySelectorAll("button")[1]?.dispatchEvent(createEvent(fixture.window, "click"));
    await Promise.resolve();
    expect(fixture.root.querySelector("article")?.textContent).toBe("Visible");
  });

  it("treats v-once keyed v-for records like empty memo dependencies", async () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="rename">Rename</button>
    <article v-for="item in items" :key="item.id" v-once>{{ item.label }}</article>
  </section>
</template>

<script>
import { ref } from "mikuru";

const items = ref([{ id: "a", label: "Alpha" }]);

function rename() {
  items.value = [{ id: "a", label: "Hidden" }];
}
</script>`);

    fixture.module.mount(fixture.root);
    expect(fixture.root.querySelector("article")?.textContent).toBe("Alpha");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));
    await Promise.resolve();

    expect(fixture.root.querySelector("article")?.textContent).toBe("Alpha");
  });

  it("unmounts removed keyed component records exactly once", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="removeFirst">Remove first</button>
    <Child v-for="item in items" :key="item.id" :item="item" @select="select" />
    <p>{{ selected }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const selected = ref("none");
const items = ref([
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" }
]);

const Child = {
  mount(target, props) {
    const button = document.createElement("button");
    const stop = effect(() => {
      button.textContent = props.item.label;
    });
    button.addEventListener("click", () => props.onSelect(props.item.id));
    target.appendChild(button);
    return {
      element: button,
      unmount() {
        globalThis.__mikuruGeneratedDomEvents.push("unmount:" + props.item.id);
        stop();
        button.remove();
      }
    };
  }
};

function select(id) {
  selected.value = id;
}

function removeFirst() {
  items.value = items.value.slice(1);
}
</script>`);

    const events: string[] = [];
    const previousEvents = (globalThis as { __mikuruGeneratedDomEvents?: string[] }).__mikuruGeneratedDomEvents;
    (globalThis as { __mikuruGeneratedDomEvents?: string[] }).__mikuruGeneratedDomEvents = events;

    try {
      fixture.module.mount(fixture.root);
      const removeButton = fixture.root.querySelector("section > button");
      const removedChildButton = fixture.root.querySelectorAll("section > button")[1];

      removedChildButton?.dispatchEvent(createEvent(fixture.window, "click"));
      expect(fixture.root.querySelector("p")?.textContent).toBe("a");

      removeButton?.dispatchEvent(createEvent(fixture.window, "click"));
      removedChildButton?.dispatchEvent(createEvent(fixture.window, "click"));

      expect(events).toEqual(["unmount:a"]);
      expect(Array.from(fixture.root.querySelectorAll("section > button")).map((button) => button.textContent)).toEqual([
        "Remove first",
        "Beta"
      ]);
      expect(fixture.root.querySelector("p")?.textContent).toBe("a");
    } finally {
      (globalThis as { __mikuruGeneratedDomEvents?: string[] }).__mikuruGeneratedDomEvents = previousEvents;
    }
  });

  it("cleans keyed component records when the parent unmounts", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Child v-for="item in items" :key="item.id" :item="item" />
  </section>
</template>

<script>
import { ref } from "mikuru";

const items = ref([
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" }
]);

const Child = {
  mount(target, props) {
    const span = document.createElement("span");
    const stop = effect(() => {
      span.textContent = props.item.label;
    });
    target.appendChild(span);
    return {
      element: span,
      unmount() {
        globalThis.__mikuruGeneratedDomEvents.push("unmount:" + props.item.id);
        stop();
        span.remove();
      }
    };
  }
};
</script>`);

    const events: string[] = [];
    const previousEvents = (globalThis as { __mikuruGeneratedDomEvents?: string[] }).__mikuruGeneratedDomEvents;
    (globalThis as { __mikuruGeneratedDomEvents?: string[] }).__mikuruGeneratedDomEvents = events;

    try {
      const instance = fixture.module.mount(fixture.root);

      expect(Array.from(fixture.root.querySelectorAll("span")).map((span) => span.textContent)).toEqual(["Alpha", "Beta"]);

      instance.unmount();

      expect(events).toEqual(["unmount:a", "unmount:b"]);
      expect(fixture.root.querySelector("section")).toBeNull();
    } finally {
      (globalThis as { __mikuruGeneratedDomEvents?: string[] }).__mikuruGeneratedDomEvents = previousEvents;
    }
  });

  it("cleans slot content effects when a child component unmounts", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="toggle">Toggle</button>
    <Card v-if="visible">
      <button @click="increment">slot count: {{ count }}</button>
    </Card>
    <p>{{ count }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const visible = ref(true);
const count = ref(0);

const Card = {
  mount(target, props) {
    const article = document.createElement("article");
    const cleanup = props.children(article);
    target.appendChild(article);
    return {
      element: article,
      unmount() {
        cleanup();
        article.remove();
      }
    };
  }
};

function increment() {
  count.value += 1;
}

function toggle() {
  visible.value = !visible.value;
}
</script>`);

    fixture.module.mount(fixture.root);
    const toggle = fixture.root.querySelector("section > button");
    const removedSlotButton = fixture.root.querySelector("article button");

    removedSlotButton?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(removedSlotButton?.textContent).toBe("slot count: 1");
    expect(fixture.root.querySelector("p")?.textContent).toBe("1");

    toggle?.dispatchEvent(createEvent(fixture.window, "click"));
    removedSlotButton?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("article")).toBeNull();
    expect(removedSlotButton?.textContent).toBe("slot count: 1");
    expect(fixture.root.querySelector("p")?.textContent).toBe("1");
  });

  it("renders named slots with reactive slot props", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Card>
      <template #header="{ title }">
        <h2>{{ title }}</h2>
      </template>
      <template #default="{ count }">
        <p>count: {{ count }}</p>
      </template>
    </Card>
    <button @click="rename">Rename</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const title = ref("Initial");
const count = ref(1);

const Card = {
  mount(target, props) {
    const article = document.createElement("article");
    const header = document.createElement("header");
    const body = document.createElement("div");
    const cleanups = [
      props.slots.header(header, { get title() { return title.value; } }),
      props.children(body, { get count() { return count.value; } })
    ];
    article.appendChild(header);
    article.appendChild(body);
    target.appendChild(article);
    return {
      element: article,
      unmount() {
        for (const cleanup of cleanups) cleanup();
        article.remove();
      }
    };
  }
};

function rename() {
  title.value = "Updated";
  count.value += 1;
}
</script>`);

    fixture.module.mount(fixture.root);

    expect(fixture.root.querySelector("h2")?.textContent).toBe("Initial");
    expect(fixture.root.querySelector("p")?.textContent).toBe("count: 1");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("h2")?.textContent).toBe("Updated");
    expect(fixture.root.querySelector("p")?.textContent).toBe("count: 2");
  });

  it("renders slot scope destructuring defaults", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Card>
      <template #default="{ title = 'Untitled', count: total = 0 }">
        <h2>{{ title }}</h2>
        <p>{{ total }}</p>
      </template>
    </Card>
  </section>
</template>

<script>
const Card = {
  mount(target, props) {
    const article = document.createElement("article");
    const cleanup = props.children(article, {});
    target.appendChild(article);
    return {
      element: article,
      unmount() {
        cleanup?.();
        article.remove();
      }
    };
  }
};
</script>`);

    fixture.module.mount(fixture.root);

    expect(fixture.root.querySelector("h2")?.textContent).toBe("Untitled");
    expect(fixture.root.querySelector("p")?.textContent).toBe("0");
  });

  it("renders nested and rest slot scope destructuring", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Card>
      <template #default="{ item: { title, meta: { tone = 'quiet' } }, ...rest }">
        <h2>{{ title }}</h2>
        <p>{{ tone }}:{{ rest.extra }}</p>
      </template>
    </Card>
  </section>
</template>

<script>
const Card = {
  mount(target, props) {
    const article = document.createElement("article");
    const cleanup = props.children(article, {
      item: { title: "Nested", meta: {} },
      extra: "rested"
    });
    target.appendChild(article);
    return {
      element: article,
      unmount() {
        cleanup?.();
        article.remove();
      }
    };
  }
};
</script>`);

    fixture.module.mount(fixture.root);

    expect(fixture.root.querySelector("h2")?.textContent).toBe("Nested");
    expect(fixture.root.querySelector("p")?.textContent).toBe("quiet:rested");
  });

  it("renders parent dynamic slot names", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Card>
      <template v-slot:[activeSlot]="{ title }">
        <h2>{{ title }}</h2>
      </template>
    </Card>
  </section>
</template>

<script>
const activeSlot = "header";
const title = "Header title";

const Card = {
  mount(target, props) {
    const article = document.createElement("article");
    const slotTarget = document.createElement("header");
    const cleanup = props.slots.header(slotTarget, { title });
    article.appendChild(slotTarget);
    target.appendChild(article);
    return {
      element: article,
      unmount() {
        cleanup?.();
        article.remove();
      }
    };
  }
};
</script>`);

    fixture.module.mount(fixture.root);

    expect(fixture.root.querySelector("h2")?.textContent).toBe("Header title");
  });

  it("renders dynamic slot outlet names", () => {
    const fixture = compileForDom(`<template>
  <section>
    <slot :name="activeSlot" :title="title">
      <p>Fallback</p>
    </slot>
    <button @click="toggle">Toggle</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const activeSlot = ref("header");
const title = ref("Header title");

function toggle() {
  activeSlot.value = "footer";
  title.value = "Footer title";
}
</script>`);

    fixture.module.mount(fixture.root, {
      slots: {
        header(target: Element, props: { title: string }) {
          const heading = fixture.document.createElement("h2");
          heading.textContent = props.title;
          target.appendChild(heading);
          return () => heading.remove();
        },
        footer(target: Element, props: { title: string }) {
          const heading = fixture.document.createElement("h3");
          heading.textContent = props.title;
          target.appendChild(heading);
          return () => heading.remove();
        }
      }
    });

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("h2")).toBeNull();
    expect(fixture.root.querySelector("h3")?.textContent).toBe("Footer title");
  });

  it("renders slot fallback content when no slot is provided", () => {
    const fixture = compileForDom(`<template>
  <section>
    <slot>
      <p>{{ message }}</p>
      <button @click="rename">Rename fallback</button>
    </slot>
  </section>
</template>

<script>
import { ref } from "mikuru";

const message = ref("Fallback");

function rename() {
  message.value = "Updated fallback";
}
</script>`);

    fixture.module.mount(fixture.root);

    expect(fixture.root.querySelector("p")?.textContent).toBe("Fallback");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")?.textContent).toBe("Updated fallback");
  });

  it("uses provided default slot content instead of fallback content", () => {
    const fixture = compileForDom(`<template>
  <section>
    <slot>
      <p>Fallback</p>
    </slot>
  </section>
</template>`);

    fixture.module.mount(fixture.root, {
      children(target: DocumentFragment) {
        const provided = fixture.document.createElement("strong");
        provided.textContent = "Provided";
        target.appendChild(provided);
        return () => provided.remove();
      }
    });

    expect(fixture.root.querySelector("strong")?.textContent).toBe("Provided");
    expect(fixture.root.querySelector("p")).toBeNull();
  });

  it("injects component styles once per compiled component", () => {
    const fixture = compileForDom(`<template>
  <button>Styled</button>
</template>

<style>
button {
  color: red;
}
</style>`);

    fixture.module.mount(fixture.root);
    fixture.module.mount(fixture.root);

    const styles = fixture.document.querySelectorAll("style[data-mikuru-style]");

    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toContain("color: red");
  });

  it("removes the root element and stops updates on unmount", () => {
    const fixture = compileForDom(`<template>
  <button @click="increment">count: {{ count }}</button>
</template>

<script>
import { ref } from "mikuru";

const count = ref(0);

function increment() {
  count.value += 1;
}
</script>`);

    const instance = fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");

    expect(button?.textContent).toBe("count: 0");

    instance.unmount();
    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("button")).toBeNull();
    expect(button?.textContent).toBe("count: 0");
  });

  it("cleans v-if branch listeners before remounting a branch", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="toggle">Toggle</button>
    <button v-if="visible" @click="increment">count: {{ count }}</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const visible = ref(true);
const count = ref(0);

function toggle() {
  visible.value = !visible.value;
}

function increment() {
  count.value += 1;
}
</script>`);

    fixture.module.mount(fixture.root);
    const toggle = fixture.root.querySelector("button");
    const firstCounter = fixture.root.querySelectorAll("button")[1];

    firstCounter?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(firstCounter?.textContent).toBe("count: 1");

    toggle?.dispatchEvent(createEvent(fixture.window, "click"));
    firstCounter?.dispatchEvent(createEvent(fixture.window, "click"));

    toggle?.dispatchEvent(createEvent(fixture.window, "click"));
    const secondCounter = fixture.root.querySelectorAll("button")[1];

    expect(secondCounter?.textContent).toBe("count: 1");
  });

  it("mounts child components with props and cleans them up with the parent", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Child message="static" :count="count" />
    <button @click="increment">Increment</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const count = ref(1);

const Child = {
  mount(target, props) {
    const span = document.createElement("span");
    const stop = effect(() => {
      span.textContent = props.message + ":" + props.count;
    });
    target.appendChild(span);
    return {
      element: span,
      unmount() {
        stop();
        span.remove();
      }
    };
  }
};

function increment() {
  count.value += 1;
}
</script>`);

    const instance = fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");
    const span = fixture.root.querySelector("span");

    expect(span?.textContent).toBe("static:1");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(span?.textContent).toBe("static:2");

    instance.unmount();

    expect(fixture.root.querySelector("span")).toBeNull();
    expect(fixture.root.querySelector("section")).toBeNull();
  });

  it("falls component class and style through to the child root", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Child
      id="child-id"
      :title="title"
      role="status"
      aria-live="polite"
      :aria-label="label"
      class="parent"
      :class="{ active }"
      style="border-color: black"
      :style="{ backgroundColor: active ? 'yellow' : 'white' }"
      v-bind="attrs"
    />
    <button @click="toggle">Toggle</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const active = ref(false);
const label = ref("Inactive child");
const title = ref("Initial title");
const attrs = ref({
  class: "bound",
  style: { color: "red" },
  "data-state": "idle",
  "data-extra": "remove-me"
});

const Child = {
  mount(target) {
    const span = document.createElement("span");
    span.className = "child-root";
    span.setAttribute("style", "font-weight: bold");
    span.textContent = "child";
    target.appendChild(span);
    return {
      element: span,
      unmount() {
        span.remove();
      }
    };
  }
};

function toggle() {
  active.value = true;
  label.value = "Active child";
  title.value = "Updated title";
  attrs.value = {
    class: ["bound", "later"],
    style: { color: "blue", fontSize: "16px" },
    "data-state": "active"
  };
}
</script>`);

    fixture.module.mount(fixture.root);
    const span = fixture.root.querySelector("span");
    const button = fixture.root.querySelector("button");

    expect(span?.className).toBe("child-root parent bound");
    expect(span?.id).toBe("child-id");
    expect(span?.getAttribute("title")).toBe("Initial title");
    expect(span?.getAttribute("role")).toBe("status");
    expect(span?.getAttribute("aria-live")).toBe("polite");
    expect(span?.getAttribute("aria-label")).toBe("Inactive child");
    expect(span?.getAttribute("data-state")).toBe("idle");
    expect(span?.getAttribute("data-extra")).toBe("remove-me");
    expect(span?.getAttribute("style")).toContain("font-weight: bold");
    expect(span?.getAttribute("style")).toContain("border-color: black");
    expect(span?.getAttribute("style")).toContain("background-color: white");
    expect(span?.getAttribute("style")).toContain("color: red");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(span?.className).toBe("child-root parent active bound later");
    expect(span?.getAttribute("title")).toBe("Updated title");
    expect(span?.getAttribute("aria-label")).toBe("Active child");
    expect(span?.getAttribute("data-state")).toBe("active");
    expect(span?.hasAttribute("data-extra")).toBe(false);
    expect(span?.getAttribute("style")).toContain("background-color: yellow");
    expect(span?.getAttribute("style")).toContain("color: blue");
    expect(span?.getAttribute("style")).toContain("font-size: 16px");
  });

  it("assigns DOM template refs and clears them on unmount", () => {
    const fixture = compileForDom(`<template>
  <section>
    <input ref="inputEl" value="ready">
    <button @click="read">Read</button>
    <p>{{ label }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const inputEl = ref(null);
const label = ref("none");
globalThis.__mikuruDomRef = inputEl;

function read() {
  label.value = inputEl.value?.tagName ?? "none";
}
</script>`);

    const instance = fixture.module.mount(fixture.root);
    const input = fixture.root.querySelector("input");
    const button = fixture.root.querySelector("button");
    const storedRef = (globalThis as unknown as { __mikuruDomRef: { value: Element | null } }).__mikuruDomRef;

    expect(storedRef.value).toBe(input);

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")?.textContent).toBe("INPUT");

    instance.unmount();

    expect(storedRef.value).toBeNull();
  });

  it("assigns component template refs to child instances", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Child ref="childRef" />
    <button @click="read">Read</button>
    <p>{{ label }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const childRef = ref(null);
const label = ref("none");
globalThis.__mikuruChildRef = childRef;

const Child = {
  mount(target) {
    const span = document.createElement("span");
    span.textContent = "child";
    target.appendChild(span);
    return {
      element: span,
      focus() {
        label.value = "focused";
      },
      unmount() {
        span.remove();
      }
    };
  }
};

function read() {
  label.value = childRef.value?.element?.textContent ?? "none";
}
</script>`);

    const instance = fixture.module.mount(fixture.root);
    const storedRef = (globalThis as unknown as { __mikuruChildRef: { value: { element: Element } | null } }).__mikuruChildRef;

    expect(storedRef.value?.element).toBe(fixture.root.querySelector("span"));

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")?.textContent).toBe("child");

    instance.unmount();

    expect(storedRef.value).toBeNull();
  });

  it("collects template refs inside v-for and removes stale entries", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="remove">Remove</button>
    <ul>
      <li v-for="item in items" ref="itemEls">{{ item }}</li>
    </ul>
  </section>
</template>

<script>
import { ref } from "mikuru";

const items = ref(["one", "two", "three"]);
const itemEls = ref([]);
globalThis.__mikuruItemRefs = itemEls;

function remove() {
  items.value = ["one", "three"];
}
</script>`);

    fixture.module.mount(fixture.root);
    const storedRef = (globalThis as unknown as { __mikuruItemRefs: { value: Element[] } }).__mikuruItemRefs;

    expect(storedRef.value.map((item) => item.textContent)).toEqual(["one", "two", "three"]);

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(storedRef.value.map((item) => item.textContent)).toEqual(["one", "three"]);
  });

  it("supports dynamic template refs and callback refs", () => {
    const fixture = compileForDom(`<template>
  <section>
    <input :ref="currentRef" value="dynamic">
    <span :ref="capture">callback</span>
  </section>
</template>

<script>
import { ref } from "mikuru";

const currentRef = ref(null);
const dynamicEl = ref(null);
const callbackValues = ref([]);
currentRef.value = dynamicEl;
globalThis.__mikuruDynamicRef = dynamicEl;
globalThis.__mikuruCallbackValues = callbackValues;

function capture(value) {
  callbackValues.value = [...callbackValues.value, value?.tagName ?? null];
}
</script>`);

    const instance = fixture.module.mount(fixture.root);
    const dynamicRef = (globalThis as unknown as { __mikuruDynamicRef: { value: Element | null } }).__mikuruDynamicRef;
    const callbackValues = (globalThis as unknown as { __mikuruCallbackValues: { value: Array<string | null> } }).__mikuruCallbackValues;

    expect(dynamicRef.value).toBe(fixture.root.querySelector("input"));
    expect(callbackValues.value).toEqual(["SPAN"]);

    instance.unmount();

    expect(dynamicRef.value).toBeNull();
    expect(callbackValues.value).toEqual(["SPAN", null]);
  });

  it("toggles child component visibility with v-show", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Child v-show="visible" />
    <button @click="toggle">Toggle</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const visible = ref(true);

const Child = {
  mount(target) {
    const span = document.createElement("span");
    span.style.display = "inline-block";
    span.textContent = "child";
    target.appendChild(span);
    return {
      element: span,
      unmount() {
        span.remove();
      }
    };
  }
};

function toggle() {
  visible.value = !visible.value;
}
</script>`);

    fixture.module.mount(fixture.root);
    const span = fixture.root.querySelector("span");
    const button = fixture.root.querySelector("button");

    expect(span?.style.display).toBe("inline-block");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(span?.style.display).toBe("none");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(span?.style.display).toBe("inline-block");
  });

  it("passes component event handlers as onEvent props", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Child @select="select" />
    <p>{{ selected }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const selected = ref("none");

const Child = {
  mount(target, props) {
    const button = document.createElement("button");
    button.textContent = "Select";
    button.addEventListener("click", () => props.onSelect("child"));
    target.appendChild(button);
    return {
      element: button,
      unmount() {
        button.remove();
      }
    };
  }
};

function select(value) {
  selected.value = value;
}
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");
    const paragraph = fixture.root.querySelector("p");

    expect(paragraph?.textContent).toBe("none");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(paragraph?.textContent).toBe("child");
  });

  it("supports once modifiers on component events", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Child @select.once="select" />
    <p>{{ selected }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const selected = ref("none");

const Child = {
  mount(target, props) {
    const button = document.createElement("button");
    button.textContent = "Select";
    let count = 0;
    button.addEventListener("click", () => {
      count += 1;
      props.onSelect("child-" + count);
    });
    target.appendChild(button);
    return {
      element: button,
      unmount() {
        button.remove();
      }
    };
  }
};

function select(value) {
  selected.value = value;
}
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");
    const paragraph = fixture.root.querySelector("p");

    button?.dispatchEvent(createEvent(fixture.window, "click"));
    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(paragraph?.textContent).toBe("child-1");
  });

  it("passes object-form component props and event handlers", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Child v-bind="childProps" v-on="childListeners" title="Explicit" />
    <button @click="update">Update</button>
    <p>{{ selected }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const selected = ref("none");
const childProps = ref({
  title: "Object title",
  detail: "from object"
});
const childListeners = ref({
  select(value) {
    selected.value = value;
  }
});

function update() {
  childProps.value = {
    detail: "updated object"
  };
  childListeners.value = {
    select(value) {
      selected.value = value + "-updated";
    }
  };
}

const Child = {
  mount(target, props) {
    const button = document.createElement("button");
    const stop = effect(() => {
      button.textContent = props.title + ":" + props.detail;
    });
    button.addEventListener("click", () => props.onSelect("object"));
    target.appendChild(button);
    return {
      element: button,
      unmount() {
        stop();
        button.remove();
      }
    };
  }
};
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");

    expect(button?.textContent).toBe("Explicit:from object");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")?.textContent).toBe("object");

    fixture.root.querySelectorAll("button")[1]?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(button?.textContent).toBe("Explicit:updated object");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")?.textContent).toBe("object-updated");
  });

  it("switches dynamic components with props, events, attrs, slots, refs, and v-show", () => {
    const fixture = compileForDom(`<template>
  <section>
    <component
      :is="current"
      class="from-parent"
      :message="message"
      @select="select"
      ref="activeChild"
      v-show="visible"
    >
      <template #default="{ label }">
        <em>{{ label }} slot</em>
      </template>
    </component>
    <button @click="swap">Swap</button>
    <button @click="hide">Hide</button>
    <p>{{ selected }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const selected = ref("none");
const message = ref("Hello");
const activeChild = ref(null);
globalThis.__mikuruDynamicChildRef = activeChild;

function createChild(name) {
  return {
    mount(target, props) {
      const article = document.createElement("article");
      const button = document.createElement("button");
      const slotTarget = document.createElement("span");
      const cleanup = props.children?.(slotTarget, { label: name });
      const stop = effect(() => {
        button.textContent = name + ":" + props.message;
      });
      button.addEventListener("click", () => props.onSelect(name));
      article.appendChild(button);
      article.appendChild(slotTarget);
      target.appendChild(article);
      return {
        element: article,
        name,
        unmount() {
          stop();
          cleanup?.();
          article.remove();
        }
      };
    }
  };
}

const First = createChild("first");
const Second = createChild("second");
const current = ref(First);
const visible = ref(true);

function select(value) {
  selected.value = value;
}

function swap() {
  current.value = Second;
  message.value = "Updated";
}

function hide() {
  visible.value = false;
}
</script>`);

    fixture.module.mount(fixture.root);
    const childRef = (globalThis as unknown as { __mikuruDynamicChildRef: { value: { name: string } | null } }).__mikuruDynamicChildRef;
    let article = fixture.root.querySelector("article");

    expect(article?.className).toBe("from-parent");
    expect(article?.querySelector("button")?.textContent).toBe("first:Hello");
    expect(article?.querySelector("em")?.textContent).toBe("first slot");
    expect(childRef.value?.name).toBe("first");

    article?.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(fixture.root.querySelector("p")?.textContent).toBe("first");

    fixture.root.querySelectorAll("section > button")[0]?.dispatchEvent(createEvent(fixture.window, "click"));
    article = fixture.root.querySelector("article");

    expect(article?.className).toBe("from-parent");
    expect(article?.querySelector("button")?.textContent).toBe("second:Updated");
    expect(article?.querySelector("em")?.textContent).toBe("second slot");
    expect(childRef.value?.name).toBe("second");

    article?.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(fixture.root.querySelector("p")?.textContent).toBe("second");

    fixture.root.querySelectorAll("section > button")[1]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(article?.style.display).toBe("none");
  });

  it("keeps dynamic component instances alive across switches", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="showA">Show A</button>
    <button @click="showB">Show B</button>
    <KeepAlive>
      <component :is="current" />
    </KeepAlive>
  </section>
</template>

<script>
import { computed, ref } from "mikuru";

const currentName = ref("a");

function makePanel(name) {
  return {
    mount(target) {
      let count = 0;
      const button = document.createElement("button");
      const render = () => { button.textContent = name + ":" + count; };
      button.addEventListener("click", () => { count += 1; render(); });
      render();
      target.appendChild(button);
      return { element: button, unmount() { button.remove(); } };
    }
  };
}

const PanelA = makePanel("A");
const PanelB = makePanel("B");
PanelA.name = "PanelA";
PanelB.name = "PanelB";
const current = computed(() => currentName.value === "a" ? PanelA : PanelB);

function showA() {
  currentName.value = "a";
}

function showB() {
  currentName.value = "b";
}
</script>`);

    fixture.module.mount(fixture.root);
    const buttons = () => Array.from(fixture.root.querySelectorAll("button"));

    expect(buttons().map((button) => button.textContent)).toEqual(["Show A", "Show B", "A:0"]);
    buttons()[2]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(buttons().map((button) => button.textContent)).toEqual(["Show A", "Show B", "A:1"]);

    buttons()[1]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(buttons().map((button) => button.textContent)).toEqual(["Show A", "Show B", "B:0"]);
    buttons()[2]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(buttons().map((button) => button.textContent)).toEqual(["Show A", "Show B", "B:1"]);

    buttons()[0]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(buttons().map((button) => button.textContent)).toEqual(["Show A", "Show B", "A:1"]);
  });

  it("respects KeepAlive include and exclude filters", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="showA">Show A</button>
    <button @click="showB">Show B</button>
    <button @click="showC">Show C</button>
    <KeepAlive :include="['PanelA', /PanelB/]" exclude="PanelC">
      <component :is="current" />
    </KeepAlive>
  </section>
</template>

<script>
import { computed, ref } from "mikuru";

const currentName = ref("a");

function makePanel(name) {
  const component = {
    mount(target) {
      let count = 0;
      const button = document.createElement("button");
      const render = () => { button.textContent = name + ":" + count; };
      button.addEventListener("click", () => { count += 1; render(); });
      render();
      target.appendChild(button);
      return { element: button, unmount() { button.remove(); } };
    }
  };
  component.name = "Panel" + name;
  return component;
}

const PanelA = makePanel("A");
const PanelB = makePanel("B");
const PanelC = makePanel("C");
const current = computed(() => currentName.value === "a" ? PanelA : currentName.value === "b" ? PanelB : PanelC);

function showA() {
  currentName.value = "a";
}

function showB() {
  currentName.value = "b";
}

function showC() {
  currentName.value = "c";
}
</script>`);

    fixture.module.mount(fixture.root);
    const buttons = () => Array.from(fixture.root.querySelectorAll("button"));

    buttons()[3]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(buttons()[3]?.textContent).toBe("A:1");
    buttons()[1]?.dispatchEvent(createEvent(fixture.window, "click"));
    buttons()[3]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(buttons()[3]?.textContent).toBe("B:1");
    buttons()[0]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(buttons()[3]?.textContent).toBe("A:1");

    buttons()[2]?.dispatchEvent(createEvent(fixture.window, "click"));
    buttons()[3]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(buttons()[3]?.textContent).toBe("C:1");
    buttons()[0]?.dispatchEvent(createEvent(fixture.window, "click"));
    buttons()[2]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(buttons()[3]?.textContent).toBe("C:0");
  });

  it("prunes KeepAlive cache with max using least recently used order", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="showA">Show A</button>
    <button @click="showB">Show B</button>
    <button @click="showC">Show C</button>
    <KeepAlive :max="2">
      <component :is="current" />
    </KeepAlive>
  </section>
</template>

<script>
import { computed, ref } from "mikuru";

const currentName = ref("a");

function makePanel(name) {
  const component = {
    mount(target) {
      let count = 0;
      const button = document.createElement("button");
      const render = () => { button.textContent = name + ":" + count; };
      button.addEventListener("click", () => { count += 1; render(); });
      render();
      target.appendChild(button);
      return { element: button, unmount() { button.remove(); } };
    }
  };
  component.name = "Panel" + name;
  return component;
}

const PanelA = makePanel("A");
const PanelB = makePanel("B");
const PanelC = makePanel("C");
const current = computed(() => currentName.value === "a" ? PanelA : currentName.value === "b" ? PanelB : PanelC);

function showA() {
  currentName.value = "a";
}

function showB() {
  currentName.value = "b";
}

function showC() {
  currentName.value = "c";
}
</script>`);

    fixture.module.mount(fixture.root);
    const buttons = () => Array.from(fixture.root.querySelectorAll("button"));

    buttons()[3]?.dispatchEvent(createEvent(fixture.window, "click"));
    buttons()[1]?.dispatchEvent(createEvent(fixture.window, "click"));
    buttons()[3]?.dispatchEvent(createEvent(fixture.window, "click"));
    buttons()[0]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(buttons()[3]?.textContent).toBe("A:1");
    buttons()[2]?.dispatchEvent(createEvent(fixture.window, "click"));
    buttons()[3]?.dispatchEvent(createEvent(fixture.window, "click"));

    buttons()[0]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(buttons()[3]?.textContent).toBe("A:1");

    buttons()[1]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(buttons()[3]?.textContent).toBe("B:0");
  });

  it("runs activated and deactivated hooks for cached generated components", () => {
    const document = new Window().document as unknown as Document;
    const child = loadCompiledModule(compile(`<template>
  <button @click="inc">{{ label }}:{{ count }}</button>
</template>

<script>
import { onActivated, onDeactivated, ref } from "mikuru";

const count = ref(0);
const label = ref("idle");

onActivated(() => {
  globalThis.__keepAliveHookEvents.push("activated:" + count.value);
  label.value = "active";
});

onDeactivated(() => {
  globalThis.__keepAliveHookEvents.push("deactivated:" + count.value);
  label.value = "inactive";
});

function inc() {
  count.value += 1;
}
</script>`).code, document);

    const fixture = compileForDom(`<template>
  <section>
    <button @click="showA">Show A</button>
    <button @click="showB">Show B</button>
    <KeepAlive>
      <component :is="current" />
    </KeepAlive>
  </section>
</template>

<script>
import { computed, ref } from "mikuru";

const currentName = ref("a");
const ChildA = globalThis.__keepAliveHookChild;
ChildA.name = "ChildA";
const ChildB = {
  name: "ChildB",
  mount(target) {
    const p = document.createElement("p");
    p.textContent = "B";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};
const current = computed(() => currentName.value === "a" ? ChildA : ChildB);

function showA() {
  currentName.value = "a";
}

function showB() {
  currentName.value = "b";
}
</script>`);

    (globalThis as unknown as { __keepAliveHookChild?: CompiledModule; __keepAliveHookEvents?: string[] }).__keepAliveHookChild = child;
    (globalThis as unknown as { __keepAliveHookEvents?: string[] }).__keepAliveHookEvents = [];

    try {
      fixture.module.mount(fixture.root);
      const buttons = () => Array.from(fixture.root.querySelectorAll("button"));

      expect(buttons()[2]?.textContent).toBe("active:0");
      buttons()[2]?.dispatchEvent(createEvent(fixture.window, "click"));
      expect(buttons()[2]?.textContent).toBe("active:1");
      buttons()[1]?.dispatchEvent(createEvent(fixture.window, "click"));
      expect(fixture.root.textContent).toContain("B");
      buttons()[0]?.dispatchEvent(createEvent(fixture.window, "click"));
      expect(buttons()[2]?.textContent).toBe("active:1");
      expect((globalThis as unknown as { __keepAliveHookEvents: string[] }).__keepAliveHookEvents).toEqual([
        "activated:0",
        "deactivated:1",
        "activated:1"
      ]);
    } finally {
      delete (globalThis as unknown as { __keepAliveHookChild?: unknown }).__keepAliveHookChild;
      delete (globalThis as unknown as { __keepAliveHookEvents?: unknown }).__keepAliveHookEvents;
    }
  });

  it("keeps resolved async components alive and forwards activation hooks", async () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="showA">Show A</button>
    <button @click="showB">Show B</button>
    <KeepAlive>
      <component :is="current" />
    </KeepAlive>
  </section>
</template>

<script>
import { computed, defineAsyncComponent, ref } from "mikuru";

const events = globalThis.__keepAliveAsyncEvents;
const currentName = ref("a");

const Loaded = {
  name: "LoadedAsyncPanel",
  mount(target) {
    let count = 0;
    const button = document.createElement("button");
    const render = () => { button.textContent = "Loaded:" + count; };
    button.addEventListener("click", () => { count += 1; render(); });
    render();
    target.appendChild(button);
    return {
      element: button,
      activate() { events.push("loaded:activated:" + count); },
      deactivate() { events.push("loaded:deactivated:" + count); },
      unmount() { button.remove(); }
    };
  }
};

const AsyncPanel = defineAsyncComponent({
  loader: () => new Promise((resolve) => setTimeout(() => resolve(Loaded), 10))
});
AsyncPanel.name = "AsyncPanel";

const OtherPanel = {
  name: "OtherPanel",
  mount(target) {
    const p = document.createElement("p");
    p.textContent = "Other";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const current = computed(() => currentName.value === "a" ? AsyncPanel : OtherPanel);

function showA() {
  currentName.value = "a";
}

function showB() {
  currentName.value = "b";
}
</script>`);

    (globalThis as unknown as { __keepAliveAsyncEvents?: string[] }).__keepAliveAsyncEvents = [];

    try {
      fixture.module.mount(fixture.root);
      await new Promise((resolve) => setTimeout(resolve, 25));
      let buttons = () => Array.from(fixture.root.querySelectorAll("button"));

      expect(buttons()[2]?.textContent).toBe("Loaded:0");
      expect((globalThis as unknown as { __keepAliveAsyncEvents: string[] }).__keepAliveAsyncEvents).toEqual(["loaded:activated:0"]);

      buttons()[2]?.dispatchEvent(createEvent(fixture.window, "click"));
      expect(buttons()[2]?.textContent).toBe("Loaded:1");
      buttons()[1]?.dispatchEvent(createEvent(fixture.window, "click"));
      expect(fixture.root.textContent).toContain("Other");

      buttons = () => Array.from(fixture.root.querySelectorAll("button"));
      buttons()[0]?.dispatchEvent(createEvent(fixture.window, "click"));
      await Promise.resolve();

      expect(buttons()[2]?.textContent).toBe("Loaded:1");
      expect((globalThis as unknown as { __keepAliveAsyncEvents: string[] }).__keepAliveAsyncEvents).toEqual([
        "loaded:activated:0",
        "loaded:deactivated:1",
        "loaded:activated:1"
      ]);
    } finally {
      delete (globalThis as unknown as { __keepAliveAsyncEvents?: unknown }).__keepAliveAsyncEvents;
    }
  });

  it("applies Transition classes on mount and delayed unmount", async () => {
    const fixture = compileForDom(`<template>
  <Transition name="fade">
    <p>Hello</p>
  </Transition>
</template>`);

    const instance = fixture.module.mount(fixture.root);
    const paragraph = fixture.root.querySelector("p");

    expect(paragraph?.classList.contains("fade-enter-from")).toBe(true);
    expect(paragraph?.classList.contains("fade-enter-active")).toBe(true);

    instance.unmount();

    expect(fixture.root.querySelector("p")).toBe(paragraph);
    expect(paragraph?.classList.contains("fade-leave-active")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(fixture.root.querySelector("p")).toBeNull();
  });

  it("transitions v-if branches", async () => {
    const fixture = compileForDom(`<template>
  <section>
    <Transition name="fade">
      <p v-if="visible">Visible</p>
      <p v-else>Hidden</p>
    </Transition>
    <button @click="toggle">Toggle</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const visible = ref(true);

function toggle() {
  visible.value = !visible.value;
}
</script>`);

    fixture.module.mount(fixture.root);

    expect(fixture.root.querySelector("p")?.textContent).toBe("Visible");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    const paragraphs = [...fixture.root.querySelectorAll("p")];
    expect(paragraphs.map((paragraph) => paragraph.textContent)).toEqual(["Visible", "Hidden"]);
    expect(paragraphs[0]?.classList.contains("fade-leave-active")).toBe(true);
    expect(paragraphs[1]?.classList.contains("fade-enter-active")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect([...fixture.root.querySelectorAll("p")].map((paragraph) => paragraph.textContent)).toEqual(["Hidden"]);
  });

  it("transitions dynamic component switches and custom classes", async () => {
    const fixture = compileForDom(`<template>
  <section>
    <Transition
      name="fade"
      enter-active-class="is-entering"
      leave-active-class="is-leaving"
    >
      <component :is="current" />
    </Transition>
    <button @click="swap">Swap</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

function createChild(name) {
  return {
    mount(target) {
      const article = document.createElement("article");
      article.textContent = name;
      target.appendChild(article);
      return {
        element: article,
        unmount() {}
      };
    }
  };
}

const First = createChild("first");
const Second = createChild("second");
const current = ref(First);

function swap() {
  current.value = Second;
}
</script>`);

    fixture.module.mount(fixture.root);
    let articles = [...fixture.root.querySelectorAll("article")];

    expect(articles.map((article) => article.textContent)).toEqual(["first"]);
    expect(articles[0]?.classList.contains("is-entering")).toBe(true);

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));
    articles = [...fixture.root.querySelectorAll("article")];

    expect(articles.map((article) => article.textContent)).toEqual(["first", "second"]);
    expect(articles[0]?.classList.contains("is-leaving")).toBe(true);
    expect(articles[1]?.classList.contains("is-entering")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect([...fixture.root.querySelectorAll("article")].map((article) => article.textContent)).toEqual(["second"]);
  });

  it("supports Transition appear opt-out and out-in mode", async () => {
    const fixture = compileForDom(`<template>
  <section>
    <Transition name="fade" mode="out-in" :appear="false">
      <p v-if="visible">Visible</p>
      <p v-else>Hidden</p>
    </Transition>
    <button @click="toggle">Toggle</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const visible = ref(true);

function toggle() {
  visible.value = !visible.value;
}
</script>`);

    fixture.module.mount(fixture.root);
    const visible = fixture.root.querySelector("p");

    expect(visible?.textContent).toBe("Visible");
    expect(visible?.classList.contains("fade-enter-active")).toBe(false);

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect([...fixture.root.querySelectorAll("p")].map((paragraph) => paragraph.textContent)).toEqual(["Visible"]);

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect([...fixture.root.querySelectorAll("p")].map((paragraph) => paragraph.textContent)).toEqual(["Hidden"]);
  });

  it("applies TransitionGroup classes to keyed list enter, leave, and move", async () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="add">Add</button>
    <button @click="removeFirst">Remove first</button>
    <button @click="reverse">Reverse</button>
    <TransitionGroup name="list" tag="ul" move-class="is-moving">
      <li v-for="item in items" :key="item.id">{{ item.label }}</li>
    </TransitionGroup>
  </section>
</template>

<script>
import { ref } from "mikuru";

const items = ref([
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" }
]);

function add() {
  items.value = [...items.value, { id: "c", label: "Gamma" }];
}

function removeFirst() {
  items.value = items.value.slice(1);
}

function reverse() {
  items.value = [...items.value].reverse();
}
</script>`);

    fixture.module.mount(fixture.root);
    const buttons = () => Array.from(fixture.root.querySelectorAll("button"));
    const items = () => Array.from(fixture.root.querySelectorAll("li"));
    const list = fixture.root.querySelector("ul");

    expect(list).not.toBeNull();
    expect(items().map((item) => item.textContent)).toEqual(["Alpha", "Beta"]);
    expect(items()[0]?.classList.contains("list-enter-active")).toBe(true);

    buttons()[0]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(items().map((item) => item.textContent)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(items()[2]?.classList.contains("list-enter-active")).toBe(true);

    buttons()[1]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(items().map((item) => item.textContent)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(items()[0]?.classList.contains("list-leave-active")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(items().map((item) => item.textContent)).toEqual(["Beta", "Gamma"]);

    buttons()[2]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(items().map((item) => item.textContent)).toEqual(["Gamma", "Beta"]);
    expect(items().some((item) => item.classList.contains("is-moving"))).toBe(true);
  });

  it("renders ErrorBoundary fallback and supports retry", () => {
    const fixture = compileForDom(`<template>
  <ErrorBoundary :fallback="ErrorView">
    <BrokenPanel />
  </ErrorBoundary>
</template>

<script>
import { ref } from "mikuru";

const shouldFail = ref(true);

const BrokenPanel = {
  mount(target) {
    if (shouldFail.value) {
      throw new Error("panel exploded");
    }

    const p = document.createElement("p");
    p.textContent = "Panel recovered";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const ErrorView = {
  mount(target, props) {
    const button = document.createElement("button");
    button.textContent = props.error.message;
    button.addEventListener("click", () => {
      shouldFail.value = false;
      props.retry();
    });
    target.appendChild(button);
    return { element: button, unmount() { button.remove(); } };
  }
};
</script>`);

    fixture.module.mount(fixture.root);

    expect(fixture.root.querySelector("button")?.textContent).toBe("panel exploded");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")?.textContent).toBe("Panel recovered");
    expect(fixture.root.querySelector("button")).toBeNull();
  });

  it("passes reset to ErrorBoundary fallback components", () => {
    const fixture = compileForDom(`<template>
  <ErrorBoundary :fallback="ErrorView">
    <BrokenPanel />
  </ErrorBoundary>
</template>

<script>
import { ref } from "mikuru";

const shouldFail = ref(true);

const BrokenPanel = {
  mount(target) {
    if (shouldFail.value) {
      throw new Error("reset me");
    }

    const p = document.createElement("p");
    p.textContent = "Reset recovered";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const ErrorView = {
  mount(target, props) {
    const button = document.createElement("button");
    button.textContent = props.error.message;
    button.addEventListener("click", () => {
      shouldFail.value = false;
      props.reset();
    });
    target.appendChild(button);
    return { element: button, unmount() { button.remove(); } };
  }
};
</script>`);

    fixture.module.mount(fixture.root);

    expect(fixture.root.querySelector("button")?.textContent).toBe("reset me");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")?.textContent).toBe("Reset recovered");
    expect(fixture.root.querySelector("button")).toBeNull();
  });

  it("resets ErrorBoundary when reset-key changes", async () => {
    const fixture = compileForDom(`<template>
  <section>
    <ErrorBoundary :fallback="ErrorView" :reset-key="version">
      <button class="explode" @click="explode">Explode</button>
    </ErrorBoundary>
    <button class="reset" @click="resetBoundary">Reset boundary</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const version = ref(0);

function explode() {
  throw new Error("needs reset key");
}

function resetBoundary() {
  version.value += 1;
}

const ErrorView = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.error.message;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};
</script>`);

    fixture.module.mount(fixture.root);

    fixture.root.querySelector(".explode")?.dispatchEvent(createEvent(fixture.window, "click"));
    await Promise.resolve();

    expect(fixture.root.querySelector("p")?.textContent).toBe("needs reset key");
    expect(fixture.root.querySelector(".explode")).toBeNull();

    fixture.root.querySelector(".reset")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")).toBeNull();
    expect(fixture.root.querySelector(".explode")?.textContent).toBe("Explode");
  });

  it("renders ErrorBoundary fallback for descendant event handler errors", async () => {
    const previousChild = (globalThis as unknown as { __mikuruBoundaryEventChild?: CompiledModule }).__mikuruBoundaryEventChild;
    const child = loadCompiledModule(
      compile(`<template>
  <button @click="explode">Explode</button>
</template>

<script>
function explode() {
  throw new Error("child clicked");
}
</script>`).code,
      new Window().document as unknown as Document
    );
    (globalThis as unknown as { __mikuruBoundaryEventChild?: CompiledModule }).__mikuruBoundaryEventChild = child;

    try {
      const fixture = compileForDom(`<template>
  <ErrorBoundary :fallback="ErrorView">
    <Child />
  </ErrorBoundary>
</template>

<script>
const Child = globalThis.__mikuruBoundaryEventChild;

const ErrorView = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.error.message;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};
</script>`);

      fixture.module.mount(fixture.root);
      fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));
      await Promise.resolve();

      expect(fixture.root.querySelector("p")?.textContent).toBe("child clicked");
      expect(fixture.root.querySelector("button")).toBeNull();
    } finally {
      (globalThis as unknown as { __mikuruBoundaryEventChild?: CompiledModule }).__mikuruBoundaryEventChild = previousChild;
    }
  });

  it("renders ErrorBoundary fallback for generated DOM event handler errors", async () => {
    const fixture = compileForDom(`<template>
  <ErrorBoundary :fallback="ErrorView">
    <button @click="explode">Explode</button>
  </ErrorBoundary>
</template>

<script>
function explode() {
  throw new Error("button exploded");
}

const ErrorView = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.error.message;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};
</script>`);

    fixture.module.mount(fixture.root);
    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));
    await Promise.resolve();

    expect(fixture.root.querySelector("p")?.textContent).toBe("button exploded");
    expect(fixture.root.querySelector("button")).toBeNull();
  });

  it("passes diagnostic info to ErrorBoundary fallback components", async () => {
    const fixture = compileForDom(`<template>
  <ErrorBoundary :fallback="ErrorView">
    <button @click="explode">Explode</button>
  </ErrorBoundary>
</template>

<script>
function explode() {
  throw new Error("diagnostic event");
}

const ErrorView = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = [props.error.message, props.errorInfo.phase, props.errorInfo.filename, props.errorInfo.boundary.filename].join("|");
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};
</script>`);

    fixture.module.mount(fixture.root);
    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));
    await Promise.resolve();

    expect(fixture.root.querySelector("p")?.textContent).toBe("diagnostic event|event|GeneratedDom.mikuru|GeneratedDom.mikuru");
  });

  it("renders ErrorBoundary fallback for descendant mounted callback errors", async () => {
    const previousChild = (globalThis as unknown as { __mikuruBoundaryMountedChild?: CompiledModule }).__mikuruBoundaryMountedChild;
    const child = loadCompiledModule(
      compile(`<template>
  <p>Mounted child</p>
</template>

<script>
import { onMounted } from "mikuru";

onMounted(() => {
  throw new Error("mounted exploded");
});
</script>`).code,
      new Window().document as unknown as Document
    );
    (globalThis as unknown as { __mikuruBoundaryMountedChild?: CompiledModule }).__mikuruBoundaryMountedChild = child;

    try {
      const fixture = compileForDom(`<template>
  <ErrorBoundary :fallback="ErrorView">
    <Child />
  </ErrorBoundary>
</template>

<script>
const Child = globalThis.__mikuruBoundaryMountedChild;

const ErrorView = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.error.message;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};
</script>`);

      fixture.module.mount(fixture.root);
      await Promise.resolve();

      expect(fixture.root.querySelector("p")?.textContent).toBe("mounted exploded");
    } finally {
      (globalThis as unknown as { __mikuruBoundaryMountedChild?: CompiledModule }).__mikuruBoundaryMountedChild = previousChild;
    }
  });

  it("teleports children to a target and can disable teleporting", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Teleport to="#modal-root" :disabled="inline">
      <p>Modal content</p>
    </Teleport>
    <button @click="toggle">Toggle inline</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const inline = ref(false);

function toggle() {
  inline.value = !inline.value;
}
</script>`);
    const modalRoot = fixture.document.createElement("div");
    modalRoot.id = "modal-root";
    fixture.document.body.appendChild(modalRoot);

    const instance = fixture.module.mount(fixture.root);

    expect(modalRoot.querySelector("p")?.textContent).toBe("Modal content");
    expect(fixture.root.querySelector("section > p")).toBeNull();

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("section > p")?.textContent).toBe("Modal content");
    expect(modalRoot.querySelector("p")).toBeNull();

    instance.unmount();

    expect(fixture.root.querySelector("p")).toBeNull();
    expect(modalRoot.querySelector("p")).toBeNull();
  });

  it("renders async component loading and resolved states", async () => {
    const fixture = compileForDom(`<template>
  <AsyncMessage message="Hello" />
</template>

<script>
import { defineAsyncComponent } from "mikuru";

const Loading = {
  mount(target) {
    const p = document.createElement("p");
    p.textContent = "Loading...";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const Loaded = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.message + " async";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const AsyncMessage = defineAsyncComponent({
  loader: () => new Promise((resolve) => setTimeout(() => resolve(Loaded), 20)),
  loadingComponent: Loading
});
</script>`);

    fixture.module.mount(fixture.root);

    expect(fixture.root.textContent).toContain("Loading...");

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(fixture.root.textContent).toContain("Hello async");
    expect(fixture.root.textContent).not.toContain("Loading...");
  });

  it("renders AsyncBoundary loading until child async components resolve", async () => {
    const fixture = compileForDom(`<template>
  <AsyncBoundary :loading="Loading" :fallback="ErrorView">
    <AsyncMessage message="Hello" />
  </AsyncBoundary>
</template>

<script>
import { defineAsyncComponent } from "mikuru";

const Loading = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = "Boundary loading " + props.pending;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const ErrorView = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.error.message;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const Loaded = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.message + " boundary";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const AsyncMessage = defineAsyncComponent({
  loader: () => new Promise((resolve) => setTimeout(() => resolve(Loaded), 20))
});
</script>`);

    fixture.module.mount(fixture.root);

    expect(fixture.root.textContent).toContain("Boundary loading 1");

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(fixture.root.textContent).toContain("Hello boundary");
    expect(fixture.root.textContent).not.toContain("Boundary loading");
  });

  it("tracks multiple async children in the same AsyncBoundary", async () => {
    const fixture = compileForDom(`<template>
  <AsyncBoundary :loading="Loading" :fallback="ErrorView">
    <FirstAsync />
    <SecondAsync />
  </AsyncBoundary>
</template>

<script>
import { defineAsyncComponent } from "mikuru";

const Loading = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = "Boundary loading " + props.pending;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const ErrorView = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.error.message;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const FirstLoaded = {
  mount(target) {
    const p = document.createElement("p");
    p.textContent = "First loaded";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const SecondLoaded = {
  mount(target) {
    const p = document.createElement("p");
    p.textContent = "Second loaded";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const FirstAsync = defineAsyncComponent({
  loader: () => new Promise((resolve) => setTimeout(() => resolve(FirstLoaded), 10))
});

const SecondAsync = defineAsyncComponent({
  loader: () => new Promise((resolve) => setTimeout(() => resolve(SecondLoaded), 30))
});
</script>`);

    fixture.module.mount(fixture.root);

    expect(fixture.root.textContent).toContain("Boundary loading 2");

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(fixture.root.textContent).toContain("First loaded");
    expect(fixture.root.textContent).toContain("Boundary loading 1");
    expect(fixture.root.textContent).not.toContain("Second loaded");

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(fixture.root.textContent).toContain("First loaded");
    expect(fixture.root.textContent).toContain("Second loaded");
    expect(fixture.root.textContent).not.toContain("Boundary loading");
  });

  it("delays AsyncBoundary loading for fast async children", async () => {
    const fixture = compileForDom(`<template>
  <AsyncBoundary :loading="Loading" :fallback="ErrorView" :delay="30">
    <FastAsync />
  </AsyncBoundary>
</template>

<script>
import { defineAsyncComponent } from "mikuru";

const Loading = {
  mount(target) {
    const p = document.createElement("p");
    p.textContent = "delayed loading";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const ErrorView = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.error.message;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const Loaded = {
  mount(target) {
    const p = document.createElement("p");
    p.textContent = "fast loaded";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const FastAsync = defineAsyncComponent({
  loader: () => new Promise((resolve) => setTimeout(() => resolve(Loaded), 5))
});
</script>`);

    fixture.module.mount(fixture.root);

    expect(fixture.root.textContent).not.toContain("delayed loading");

    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(fixture.root.textContent).toContain("fast loaded");
    expect(fixture.root.textContent).not.toContain("delayed loading");

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(fixture.root.textContent).toContain("fast loaded");
    expect(fixture.root.textContent).not.toContain("delayed loading");
  });

  it("times out pending AsyncBoundary children into fallback", async () => {
    const fixture = compileForDom(`<template>
  <AsyncBoundary :loading="Loading" :fallback="ErrorView" :timeout="10">
    <NeverAsync />
  </AsyncBoundary>
</template>

<script>
import { defineAsyncComponent } from "mikuru";

const Loading = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = "Boundary loading " + props.pending;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const ErrorView = {
  mount(target, props) {
    const button = document.createElement("button");
    button.textContent = props.errorInfo.phase + "|" + props.pending + "|" + props.errors.length + "|" + props.error.message;
    target.appendChild(button);
    return { element: button, unmount() { button.remove(); } };
  }
};

const NeverAsync = defineAsyncComponent({
  loader: () => new Promise(() => {})
});
</script>`);

    fixture.module.mount(fixture.root);

    expect(fixture.root.textContent).toContain("Boundary loading 1");

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(fixture.root.querySelector("button")?.textContent).toBe("async-timeout|1|1|Async boundary timed out");
    expect(fixture.root.textContent).not.toContain("Boundary loading");
  });

  it("renders async component error fallback", async () => {
    const fixture = compileForDom(`<template>
  <AsyncBroken />
</template>

<script>
import { defineAsyncComponent } from "mikuru";

const ErrorView = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.error.message;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const AsyncBroken = defineAsyncComponent({
  loader: () => Promise.reject(new Error("broken async")),
  errorComponent: ErrorView
});
</script>`);

    fixture.module.mount(fixture.root);

    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.root.textContent).toContain("broken async");
  });

  it("supports async component retry after loader errors", async () => {
    const fixture = compileForDom(`<template>
  <RetryAsync />
</template>

<script>
import { defineAsyncComponent } from "mikuru";

let attempts = 0;

const Loaded = {
  mount(target) {
    const p = document.createElement("p");
    p.textContent = "retry loaded";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const ErrorView = {
  mount(target, props) {
    const button = document.createElement("button");
    button.textContent = props.error.message;
    button.addEventListener("click", () => props.retry());
    target.appendChild(button);
    return { element: button, unmount() { button.remove(); } };
  }
};

const RetryAsync = defineAsyncComponent({
  loader: () => {
    attempts += 1;
    return attempts === 1 ? Promise.reject(new Error("first failed")) : Promise.resolve(Loaded);
  },
  errorComponent: ErrorView
});
</script>`);

    fixture.module.mount(fixture.root);
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.root.querySelector("button")?.textContent).toBe("first failed");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.root.querySelector("p")?.textContent).toBe("retry loaded");
  });

  it("renders async component timeout fallback", async () => {
    const fixture = compileForDom(`<template>
  <SlowAsync />
</template>

<script>
import { defineAsyncComponent } from "mikuru";

const ErrorView = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.error.message;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const SlowAsync = defineAsyncComponent({
  loader: () => new Promise(() => {}),
  timeout: 10,
  errorComponent: ErrorView
});
</script>`);

    fixture.module.mount(fixture.root);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(fixture.root.querySelector("p")?.textContent).toBe("Async component timed out");
  });

  it("routes async component loader errors to ErrorBoundary when no error component is provided", async () => {
    const fixture = compileForDom(`<template>
  <ErrorBoundary :fallback="ErrorView">
    <AsyncBroken />
  </ErrorBoundary>
</template>

<script>
import { defineAsyncComponent } from "mikuru";

const AsyncBroken = defineAsyncComponent({
  loader: () => Promise.reject(new Error("boundary async failed"))
});

const ErrorView = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.error.message;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};
</script>`);

    fixture.module.mount(fixture.root);
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.root.querySelector("p")?.textContent).toBe("boundary async failed");
  });

  it("passes async diagnostics to ErrorBoundary fallback components", async () => {
    const fixture = compileForDom(`<template>
  <ErrorBoundary :fallback="ErrorView">
    <AsyncBroken />
  </ErrorBoundary>
</template>

<script>
import { defineAsyncComponent } from "mikuru";

const AsyncBroken = defineAsyncComponent({
  loader: () => Promise.reject(new Error("async diagnostic"))
});

const ErrorView = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = [props.error.message, props.errorInfo.phase, props.errorInfo.filename, props.errorInfo.boundary.filename].join("|");
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};
</script>`);

    fixture.module.mount(fixture.root);
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.root.querySelector("p")?.textContent).toBe("async diagnostic|async-loader|GeneratedDom.mikuru|GeneratedDom.mikuru");
  });

  it("renders AsyncBoundary fallback and retries failed async children", async () => {
    const fixture = compileForDom(`<template>
  <AsyncBoundary :loading="Loading" :fallback="ErrorView">
    <RetryAsync />
  </AsyncBoundary>
</template>

<script>
import { defineAsyncComponent } from "mikuru";

let attempts = 0;

const Loading = {
  mount(target) {
    const p = document.createElement("p");
    p.textContent = "Boundary loading";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const Loaded = {
  mount(target) {
    const p = document.createElement("p");
    p.textContent = "boundary retry loaded";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const ErrorView = {
  mount(target, props) {
    const button = document.createElement("button");
    button.textContent = props.errorInfo.phase + ":" + props.error.message;
    button.addEventListener("click", () => props.retry());
    target.appendChild(button);
    return { element: button, unmount() { button.remove(); } };
  }
};

const RetryAsync = defineAsyncComponent({
  loader: () => {
    attempts += 1;
    return attempts === 1 ? Promise.reject(new Error("boundary failed")) : Promise.resolve(Loaded);
  }
});
</script>`);

    fixture.module.mount(fixture.root);
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.root.querySelector("button")?.textContent).toBe("async-loader:boundary failed");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.root.querySelector("p")?.textContent).toBe("boundary retry loaded");
    expect(fixture.root.querySelector("button")).toBeNull();
  });

  it("passes aggregated AsyncBoundary errors and pending count to fallback", async () => {
    const fixture = compileForDom(`<template>
  <AsyncBoundary :loading="Loading" :fallback="ErrorView">
    <SlowAsync />
    <FlakyAsync />
  </AsyncBoundary>
</template>

<script>
import { defineAsyncComponent } from "mikuru";

let attempts = 0;

const Loading = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = "Boundary loading " + props.pending;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const SlowLoaded = {
  mount(target) {
    const p = document.createElement("p");
    p.textContent = "slow loaded";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const FlakyLoaded = {
  mount(target) {
    const p = document.createElement("p");
    p.textContent = "flaky recovered";
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};

const ErrorView = {
  mount(target, props) {
    const button = document.createElement("button");
    button.textContent = "pending:" + props.pending + "|errors:" + props.errors.length + "|" + props.error.message;
    button.addEventListener("click", () => props.retry());
    target.appendChild(button);
    return { element: button, unmount() { button.remove(); } };
  }
};

const SlowAsync = defineAsyncComponent({
  loader: () => new Promise((resolve) => setTimeout(() => resolve(SlowLoaded), 30))
});

const FlakyAsync = defineAsyncComponent({
  loader: () => new Promise((resolve, reject) => {
    attempts += 1;
    setTimeout(() => {
      if (attempts === 1) {
        reject(new Error("partial failed"));
        return;
      }
      resolve(FlakyLoaded);
    }, 10);
  })
});
</script>`);

    fixture.module.mount(fixture.root);

    expect(fixture.root.textContent).toContain("Boundary loading 2");

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(fixture.root.querySelector("button")?.textContent).toBe("pending:1|errors:1|partial failed");
    expect(fixture.root.textContent).not.toContain("slow loaded");

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(fixture.root.textContent).toContain("slow loaded");
    expect(fixture.root.textContent).toContain("flaky recovered");
    expect(fixture.root.querySelector("button")).toBeNull();
  });

  it("routes async component timeouts to ErrorBoundary when no error component is provided", async () => {
    const fixture = compileForDom(`<template>
  <ErrorBoundary :fallback="ErrorView">
    <SlowAsync />
  </ErrorBoundary>
</template>

<script>
import { defineAsyncComponent } from "mikuru";

const SlowAsync = defineAsyncComponent({
  loader: () => new Promise(() => {}),
  timeout: 10
});

const ErrorView = {
  mount(target, props) {
    const p = document.createElement("p");
    p.textContent = props.error.message;
    target.appendChild(p);
    return { element: p, unmount() { p.remove(); } };
  }
};
</script>`);

    fixture.module.mount(fixture.root);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(fixture.root.querySelector("p")?.textContent).toBe("Async component timed out");
  });

  it("passes component v-model as modelValue and update handler props", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Child v-model="name" />
    <p>{{ name }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const name = ref("Mikuru");

const Child = {
  mount(target, props) {
    const button = document.createElement("button");
    const stop = effect(() => {
      button.textContent = props.modelValue;
    });
    button.addEventListener("click", () => props.onUpdateModelValue("Updated"));
    target.appendChild(button);
    return {
      element: button,
      unmount() {
        stop();
        button.remove();
      }
    };
  }
};
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");

    expect(button?.textContent).toBe("Mikuru");
    expect(fixture.root.querySelector("p")?.textContent).toBe("Mikuru");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(button?.textContent).toBe("Updated");
    expect(fixture.root.querySelector("p")?.textContent).toBe("Updated");
  });

  it("passes multiple component v-model props and modifiers", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Child v-model:title.trim="title" v-model:checked="checked" />
    <p>{{ title }}:{{ checked }}</p>
  </section>
</template>

<script>
import { ref } from "mikuru";

const title = ref("Mikuru");
const checked = ref(false);

const Child = {
  mount(target, props) {
    const button = document.createElement("button");
    const stop = effect(() => {
      button.textContent = props.title + ":" + props.checked + ":" + Boolean(props.titleModifiers?.trim);
    });
    button.addEventListener("click", () => {
      props.onUpdateTitle("Updated");
      props.onUpdateChecked(true);
    });
    target.appendChild(button);
    return {
      element: button,
      unmount() {
        stop();
        button.remove();
      }
    };
  }
};
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");

    expect(button?.textContent).toBe("Mikuru:false:true");
    expect(fixture.root.querySelector("p")?.textContent).toBe("Mikuru:false");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(button?.textContent).toBe("Updated:true:true");
    expect(fixture.root.querySelector("p")?.textContent).toBe("Updated:true");
  });

  it("uses writable computed refs with v-model and once watchers", () => {
    const fixture = compileForDom(`<template>
  <section>
    <input v-model="fullName" />
    <p>{{ rawName }}:{{ watchLog }}:{{ effectLog }}</p>
  </section>
</template>

<script>
import { computed, ref, watch, watchEffect } from "mikuru";

const rawName = ref("Mikuru Runtime");
const watchLog = ref("waiting");
const effectLog = ref("effect:Mikuru Runtime");
const fullName = computed({
  get: () => rawName.value,
  set: (nextValue) => {
    rawName.value = nextValue.trim();
  }
});

watch(fullName, (next, previous) => {
  watchLog.value = previous + " -> " + next;
}, { once: true });

watchEffect(() => {
  effectLog.value = "effect:" + fullName.value;
});
</script>`);

    fixture.module.mount(fixture.root);
    const input = fixture.root.querySelector("input");
    const paragraph = fixture.root.querySelector("p");

    expect(input?.value).toBe("Mikuru Runtime");
    expect(paragraph?.textContent).toBe("Mikuru Runtime:waiting:effect:Mikuru Runtime");

    if (input) {
      input.value = "Writable Computed";
      input.dispatchEvent(createEvent(fixture.window, "input"));
    }

    expect(input?.value).toBe("Writable Computed");
    expect(paragraph?.textContent).toBe("Writable Computed:Mikuru Runtime -> Writable Computed:effect:Writable Computed");

    if (input) {
      input.value = "Ignored Update";
      input.dispatchEvent(createEvent(fixture.window, "input"));
    }

    expect(paragraph?.textContent).toBe("Ignored Update:Mikuru Runtime -> Writable Computed:effect:Ignored Update");
  });

  it("renders default slot content in child components", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Card title="Greeting">
      <p>Hello {{ name }}</p>
    </Card>
    <button @click="rename">Rename</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const name = ref("Mikuru");

const Card = {
  mount(target, props) {
    const article = document.createElement("article");
    const heading = document.createElement("h2");
    const body = document.createElement("div");
    heading.textContent = props.title;
    article.appendChild(heading);
    article.appendChild(body);
    const cleanup = props.children?.(body);
    target.appendChild(article);
    return {
      element: article,
      unmount() {
        cleanup?.();
        article.remove();
      }
    };
  }
};

function rename() {
  name.value = "Slot";
}
</script>`);

    fixture.module.mount(fixture.root);
    const button = fixture.root.querySelector("button");

    expect(fixture.root.querySelector("h2")?.textContent).toBe("Greeting");
    expect(fixture.root.querySelector("p")?.textContent).toBe("Hello Mikuru");

    button?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(fixture.root.querySelector("p")?.textContent).toBe("Hello Slot");
  });

  it("reads component props through defineProps", () => {
    const fixture = compileForDom(`<template>
  <section>
    <span>{{ message }}:{{ count }}</span>
    <em>{{ localProps.label }}</em>
  </section>
</template>

<script>
const { message, count } = defineProps();
const localProps = defineProps();
</script>`);

    fixture.module.mount(fixture.root, { message: "Hello", count: 3, label: "Alias" });

    expect(fixture.root.querySelector("span")?.textContent).toBe("Hello:3");
    expect(fixture.root.querySelector("em")?.textContent).toBe("Alias");
  });

  it("reads and manually forwards fallthrough attrs with useAttrs", () => {
    const previousChild = (globalThis as unknown as { __mikuruAttrsChild?: CompiledModule }).__mikuruAttrsChild;
    const child = loadCompiledModule(
      compile(`<template>
  <button class="local" v-bind="attrs">{{ attrs.id }}:{{ attrs["data-state"] }}</button>
</template>

<script>
const attrs = useAttrs();
defineOptions({ inheritAttrs: false });
</script>`).code,
      new Window().document as unknown as Document
    );
    child.inheritAttrs = false;
    (globalThis as unknown as { __mikuruAttrsChild?: CompiledModule }).__mikuruAttrsChild = child;

    try {
      const fixture = compileForDom(`<template>
  <section>
    <Child id="child-id" class="parent" :data-state="state" title="Forwarded" />
    <button @click="activate">Activate</button>
  </section>
</template>

<script>
import { ref } from "mikuru";

const Child = globalThis.__mikuruAttrsChild;
const state = ref("idle");

function activate() {
  state.value = "active";
}
</script>`);

      fixture.module.mount(fixture.root);
      const childButton = fixture.root.querySelector("section > button");
      const toggle = fixture.root.querySelectorAll("button")[1];

      expect(childButton?.id).toBe("child-id");
      expect(childButton?.className).toBe("local parent");
      expect(childButton?.getAttribute("title")).toBe("Forwarded");
      expect(childButton?.getAttribute("data-state")).toBe("idle");
      expect(childButton?.textContent).toBe("child-id:idle");

      toggle?.dispatchEvent(createEvent(fixture.window, "click"));

      expect(childButton?.getAttribute("data-state")).toBe("active");
      expect(childButton?.textContent).toBe("child-id:active");
    } finally {
      (globalThis as unknown as { __mikuruAttrsChild?: CompiledModule }).__mikuruAttrsChild = previousChild;
    }
  });

  it("keeps destructured defineProps values reactive", () => {
    const fixture = compileForDom(`<template>
  <p>{{ count }}</p>
</template>

<script>
const { count } = defineProps();
</script>`);
    const count = ref(1);

    fixture.module.mount(fixture.root, {
      get count() {
        return count.value;
      }
    });

    expect(fixture.root.querySelector("p")?.textContent).toBe("1");

    count.value = 2;

    expect(fixture.root.querySelector("p")?.textContent).toBe("2");
  });

  it("supports aliases and defaults in defineProps destructuring", () => {
    const fixture = compileForDom(`<template>
  <p>{{ heading }}:{{ active }}:{{ total }}</p>
</template>

<script>
const { title: heading, active = false, count: total = 0 } = defineProps();
</script>`);
    const title = ref("First");

    fixture.module.mount(fixture.root, {
      get title() {
        return title.value;
      }
    });

    expect(fixture.root.querySelector("p")?.textContent).toBe("First:false:0");

    title.value = "Second";

    expect(fixture.root.querySelector("p")?.textContent).toBe("Second:false:0");
  });

  it("emits component events with defineEmits", () => {
    const fixture = compileForDom(`<template>
  <section>
    <button @click="select">Select</button>
    <button @click="selectItem">Select item</button>
  </section>
</template>

<script>
const emit = defineEmits();

function select() {
  emit("select", "plain");
}

function selectItem() {
  emit("item-select", "kebab");
}
</script>`);

    const selected = ref("none");
    fixture.module.mount(fixture.root, {
      onSelect(value: string) {
        selected.value = value;
      },
      onItemSelect(value: string) {
        selected.value = value;
      }
    });
    const buttons = fixture.root.querySelectorAll("button");

    buttons[0]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(selected.value).toBe("plain");

    buttons[1]?.dispatchEvent(createEvent(fixture.window, "click"));
    expect(selected.value).toBe("kebab");
  });

  it("maps colon emit names to camel case handler props", () => {
    const fixture = compileForDom(`<template>
  <button @click="update">Update</button>
</template>

<script>
const emit = defineEmits(["update:modelValue"]);

function update() {
  emit("update:modelValue", "next");
}
</script>`);

    const value = ref("initial");
    fixture.module.mount(fixture.root, {
      onUpdateModelValue(next: string) {
        value.value = next;
      }
    });

    fixture.root.querySelector("button")?.dispatchEvent(createEvent(fixture.window, "click"));

    expect(value.value).toBe("next");
  });

  it("passes scoped provide context to child components without leaking between mounts", () => {
    const fixture = compileForDom(`<template>
  <section>
    <Child />
  </section>
</template>

<script>
import { provide } from "mikuru";

const key = "theme";
const { theme } = defineProps();

provide(key, theme);

const Child = {
  mount(target, props) {
    const paragraph = document.createElement("p");
    let context = props.__mikuru_context;
    let value = "missing";

    while (context) {
      if (context.provides.has(key)) {
        value = context.provides.get(key);
        break;
      }

      context = context.parent;
    }

    paragraph.textContent = value?.value ?? value;
    target.appendChild(paragraph);

    return {
      element: paragraph,
      unmount() {
        paragraph.remove();
      }
    };
  }
};
</script>`);
    const secondRoot = fixture.document.createElement("div");

    fixture.document.body.appendChild(secondRoot);
    fixture.module.mount(fixture.root, { theme: "first-theme" });
    fixture.module.mount(secondRoot, { theme: "second-theme" });

    expect(fixture.root.querySelector("p")?.textContent).toBe("first-theme");
    expect(secondRoot.querySelector("p")?.textContent).toBe("second-theme");
  });

  it("renders router components from generated DOM code", async () => {
    const fixture = compileForDom(`<template>
  <section>
    <RouterLink :to="aboutRoute">
      <strong>About</strong>
    </RouterLink>
    <p>Current: {{ route.path }}</p>
    <RouterView />
  </section>
</template>

<script>
import { createMemoryHistory, createRouter, provideRouter, RouterLink, RouterView, useRoute, useRouter } from "mikuru/router";

const HomePage = {
  mount(target) {
    const element = document.createElement("p");
    element.textContent = "Home";
    target.appendChild(element);
    return {
      element,
      unmount() {
        element.remove();
      }
    };
  }
};

const AboutPage = {
  mount(target) {
    const element = document.createElement("p");
    element.textContent = "About page";
    target.appendChild(element);
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
    { path: "/", name: "home", component: HomePage },
    { path: "/about", name: "about", component: AboutPage }
  ]
});

provideRouter(router);
const injectedRouter = useRouter();
const route = useRoute();
const aboutRoute = { name: "about" };
</script>`);

    const previousDocument = globalThis.document;

    try {
      Object.defineProperty(globalThis, "document", { configurable: true, value: fixture.document });
      fixture.module.mount(fixture.root);
      await Promise.resolve();

      expect(fixture.root.querySelector("p")?.textContent).toBe("Current: /");
      expect(fixture.root.textContent).toContain("Current: /");
      expect(fixture.root.textContent).toContain("Home");
      expect(fixture.root.querySelector("strong")?.textContent).toBe("About");
      fixture.root.querySelector("a")?.dispatchEvent(createEvent(fixture.window, "click", { bubbles: true, cancelable: true }));
      await Promise.resolve();

      expect(fixture.root.textContent).toContain("About page");
      expect(fixture.root.textContent).toContain("Current: /about");
      expect(fixture.root.querySelector("a")?.getAttribute("aria-current")).toBe("page");
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
    }
  });
});

function compileForDom(source: string, options: { batchedUpdates?: boolean; debug?: boolean; filename?: string } = {}): CompiledFixture {
  const window = new Window();
  const document = window.document;
  const root = document.createElement("div");
  const { code } = compile(source, {
    filename: options.filename ?? "GeneratedDom.mikuru",
    batchedUpdates: options.batchedUpdates,
    debug: options.debug
  });
  const domDocument = document as unknown as Document;
  const module = loadCompiledModule(code, domDocument);

  document.body.appendChild(root);

  return { document: domDocument, module, root: root as unknown as HTMLDivElement, window };
}

function createEvent(window: Window, type: string, options?: EventInit): Event {
  return new window.Event(type, options) as unknown as Event;
}

function loadCompiledModule(code: string, document: Document): CompiledModule {
  const executableCode = code
    .replace(/import\s+\{[^}]+\}\s+from\s+["'][^"']*(?:mikuru|mikuru)[^"']*["'];?\n+/g, "")
    .replace("export function mount", "function mount")
    .replace(/\nexport default __mikuru_component;\n?$/, "\n");
  const factory = new Function(
    "computed",
    "createMemoryHistory",
    "createRouter",
    "defineAsyncComponent",
    "emitDebugEvent",
    "effect",
    "inject",
    "nextTick",
    "onActivated",
    "onBeforeUnmount",
    "onDeactivated",
    "onMounted",
    "onUnmounted",
    "provide",
    "provideRouter",
    "queueJob",
    "reactive",
    "ref",
    "registerDebugComponent",
    "setAttribute",
    "toRef",
    "toRefs",
    "unref",
    "unwrap",
    "RouterLink",
    "RouterView",
    "useRoute",
    "useRouter",
    "watch",
    "watchEffect",
    "document",
    `${executableCode}\nreturn { mount };`
  ) as (
    computedArg: typeof computed,
    createMemoryHistoryArg: typeof createMemoryHistory,
    createRouterArg: typeof createRouter,
    defineAsyncComponentArg: typeof defineAsyncComponent,
    emitDebugEventArg: typeof emitDebugEvent,
    effectArg: typeof effect,
    injectArg: typeof inject,
    nextTickArg: typeof nextTick,
    onActivatedArg: typeof onActivated,
    onBeforeUnmountArg: typeof onBeforeUnmount,
    onDeactivatedArg: typeof onDeactivated,
    onMountedArg: typeof onMounted,
    onUnmountedArg: typeof onUnmounted,
    provideArg: typeof provide,
    provideRouterArg: typeof provideRouter,
    queueJobArg: typeof queueJob,
    reactiveArg: typeof reactive,
    refArg: typeof ref,
    registerDebugComponentArg: typeof registerDebugComponent,
    setAttributeArg: typeof setAttribute,
    toRefArg: typeof toRef,
    toRefsArg: typeof toRefs,
    unrefArg: typeof unref,
    unwrapArg: typeof unwrap,
    RouterLinkArg: typeof RouterLink,
    RouterViewArg: typeof RouterView,
    useRouteArg: typeof useRoute,
    useRouterArg: typeof useRouter,
    watchArg: typeof watch,
    watchEffectArg: typeof watchEffect,
    documentArg: Document
  ) => CompiledModule;

  return factory(
    computed,
    createMemoryHistory,
    createRouter,
    defineAsyncComponent,
    emitDebugEvent,
    effect,
    inject,
    nextTick,
    onActivated,
    onBeforeUnmount,
    onDeactivated,
    onMounted,
    onUnmounted,
    provide,
    provideRouter,
    queueJob,
    reactive,
    ref,
    registerDebugComponent,
    setAttribute,
    toRef,
    toRefs,
    unref,
    unwrap,
    RouterLink,
    RouterView,
    useRoute,
    useRouter,
    watch,
    watchEffect,
    document
  );
}
