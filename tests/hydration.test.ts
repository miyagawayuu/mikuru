import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { compileHydration, compileSsr } from "../src/compiler/index.js";
import { createMemoryHistory, createRouter } from "../src/router/index.js";
import { effect, ref, setAttribute, unwrap } from "../src/runtime/index.js";
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
        hydrated.push("shell");
        await props.children(target.querySelector("#child") as unknown as Element);
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
});

function loadSsrRender(code: string): (props?: Record<string, unknown>) => Promise<string> {
  const executable = code
    .replace(/import\s+\{([^}]+)\}\s+from\s+["']mikuru["'];?\n+/g, "")
    .replace("import { escapeHtml as __mikuru_escape, renderAttr as __mikuru_renderAttr, renderAttrs as __mikuru_renderAttrs, renderComponentToString as __mikuru_renderComponent } from \"mikuru/server\";", "const __mikuru_escape = helpers.escapeHtml; const __mikuru_renderAttr = helpers.renderAttr; const __mikuru_renderAttrs = helpers.renderAttrs; const __mikuru_renderComponent = helpers.renderComponentToString;")
    .replace("import { unwrap as __mikuru_unwrap } from \"mikuru/runtime\";", "const __mikuru_unwrap = helpers.unwrap;")
    .replace("export async function renderToString", "async function renderToString");
  const factory = new Function("helpers", `const { ref } = helpers;\n${executable}\nreturn renderToString;`) as (helpers: Record<string, unknown>) => (props?: Record<string, unknown>) => Promise<string>;
  return factory({ escapeHtml, renderAttr, renderAttrs, renderComponentToString, ref, unwrap });
}

function loadHydrationModule(code: string, documentOverride?: Document): { mount: (target: Element, props?: Record<string, unknown>) => any; hydrate: (target: Element, props?: Record<string, unknown>) => any } {
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
  const window = documentOverride ? undefined : new Window();
  return factory(effect, ref, setAttribute, unwrap, documentOverride ?? window!.document as unknown as Document);
}
