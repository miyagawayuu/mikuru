import { describe, expect, it } from "vitest";

import { compileSsr } from "../src/compiler/index.js";
import { createMemoryHistory, createRouter } from "../src/router/index.js";
import { escapeHtml, renderAttr, renderAttrs, renderComponentToString, renderRouteToString, renderToString } from "../src/server.js";
import { inject, provide, unwrap } from "../src/runtime/index.js";

describe("server rendering", () => {
  it("escapes text and attributes", () => {
    expect(escapeHtml(`<span title="x">Mikuru & SSR</span>`)).toBe("&lt;span title=&quot;x&quot;&gt;Mikuru &amp; SSR&lt;/span&gt;");
    expect(renderAttr("disabled", true)).toBe(" disabled");
    expect(renderAttr("title", `"quoted" & <tag>`)).toBe(" title=\"&quot;quoted&quot; &amp; &lt;tag&gt;\"");
    expect(renderAttr("class", ["base", { active: true, hidden: false }])).toBe(" class=\"base active\"");
    expect(renderAttr("style", ["color: red", { fontSize: "12px", display: null }])).toBe(" style=\"color: red; font-size: 12px\"");
    expect(renderAttr("bad name", "skip")).toBe("");
    expect(renderAttr("disabled", false)).toBe("");
    expect(renderAttr("data-enabled", false)).toBe(" data-enabled=\"false\"");
    expect(renderAttr("data-enabled", true)).toBe(" data-enabled=\"true\"");
    expect(renderAttrs({ id: "app", hidden: false, "data-count": 2 })).toBe(" id=\"app\" data-count=\"2\"");
  });

  it("renders components through the server entry", async () => {
    expect(renderToString({ renderToString: () => "<p>ok</p>" })).toBe("<p>ok</p>");
    await expect(renderToString(async () => "<p>async</p>")).resolves.toBe("<p>async</p>");
    await expect(renderComponentToString({ renderToString: (props) => `<p>${props?.message}</p>` }, { message: "component" })).resolves.toBe("<p>component</p>");
  });

  it("compiles static SSR output with expressions, attrs, branches, and loops", async () => {
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

    await expect(render()).resolves.toBe("<section class=\"card\" data-count=\"2\"><h1>SSR &lt;phase&gt;</h1><p>Ready &amp; &lt;script&gt;</p><ul><li data-index=\"0\">one</li><li data-index=\"1\">two &amp; more</li></ul></section>");
  });

  it("normalizes SSR class and style bindings with static values", async () => {
    const result = compileSsr(`<template>
  <section>
    <p class="card" :class="{ active }">classed</p>
    <div style="border-color: black" :style="{ color, fontSize: size }">styled</div>
    <aside class="panel" style="margin-top: 4px" v-bind="attrs">bound</aside>
  </section>
</template>
<script>
const active = true;
const color = "red";
const size = "12px";
const attrs = {
  class: ["bound", { open: true }],
  style: { backgroundColor: "yellow" },
  "data-mode": "ready"
};
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe('<section><p class="card active">classed</p><div style="border-color: black; color: red; font-size: 12px">styled</div><aside class="panel bound open" style="margin-top: 4px; background-color: yellow" data-mode="ready">bound</aside></section>');
  });

  it("renders serializable v-bind modifiers for SSR", async () => {
    const result = compileSsr(`<template>
  <section>
    <input type="checkbox" :indeterminate.prop="mixed" />
    <p :data-user-id.camel="userId" :aria-hidden.attr="hidden">profile</p>
  </section>
</template>
<script>
const mixed = true;
const userId = "42";
const hidden = false;
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe('<section><input type="checkbox"><p dataUserId="42" aria-hidden="false">profile</p></section>');
  });

  it("renders serializable object-form v-bind modifiers for SSR", async () => {
    const result = compileSsr(`<template>
  <section>
    <input type="checkbox" v-bind.prop="propertyAttrs" />
    <p v-bind.attr="attributeAttrs" v-bind.camel="camelAttrs">profile</p>
  </section>
</template>
<script>
const propertyAttrs = { indeterminate: true };
const attributeAttrs = { "aria-hidden": false };
const camelAttrs = { "data-user-id": "42" };
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe('<section><input type="checkbox"><p aria-hidden="false" dataUserId="42">profile</p></section>');
  });

  it("renders v-html as raw HTML and v-text as escaped text", async () => {
    const result = compileSsr(`<template>
  <section>
    <article v-html="html"><p>fallback</p></article>
    <p v-text="message">fallback</p>
  </section>
</template>
<script>
const html = "<strong>raw</strong>";
const message = "<safe>";
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe("<section><article><strong>raw</strong></article><p>&lt;safe&gt;</p></section>");
  });

  it("renders v-pre literally and keeps v-cloak for hydration", async () => {
    const result = compileSsr(`<template>
  <section>
    <article v-pre :id="rawId" @click="ignored">{{ message }}<span v-if="false">Raw</span></article>
    <p v-cloak>{{ message }}</p>
  </section>
</template>
<script>
const message = "Hello";
const rawId = "raw";
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe('<section><article :id="rawId" @click="ignored">{{ message }}<span v-if="false">Raw</span></article><p v-cloak="">Hello</p></section>');
  });

  it("renders dynamic attribute arguments", async () => {
    const result = compileSsr(`<template>
  <section :[name]="value">Dynamic</section>
</template>
<script>
const name = "data-mode";
const value = "ready";
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe('<section data-mode="ready">Dynamic</section>');
  });

  it("renders boolean attributes and false non-boolean attributes", async () => {
    const result = compileSsr(`<template>
  <section>
    <button :disabled="disabled">Action</button>
    <p :data-enabled="enabled">Flag</p>
  </section>
</template>
<script>
const disabled = false;
const enabled = false;
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe('<section><button>Action</button><p data-enabled="false">Flag</p></section>');
  });

  it("keeps SSR compile output importable from the public compiler entry", () => {
    const result = compileSsr(`<template><main id="app">{{ message }}</main></template><script>const message = "hello";</script>`);

    expect(result.code).toContain("import { escapeHtml as __mikuru_escape");
    expect(result.code).toContain("export async function renderToString");
    expect(result.bindings).toContainEqual({ type: "text", expression: "message" });
  });

  it("renders child components with props and default slots", async () => {
    const result = compileSsr(`<template>
  <section>
    <Child title="Card" :count="count" v-bind="{ role: 'note' }">
      <strong>{{ label }}</strong>
    </Child>
  </section>
</template>
<script>
const count = 2;
const label = "projected";
const Child = {
  async renderToString(props) {
    return '<article data-title="' + props.title + '" data-count="' + props.count + '" data-role="' + props.role + '">' + await props.children() + '</article>';
  }
};
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe("<section><article data-title=\"Card\" data-count=\"2\" data-role=\"note\"><strong>projected</strong></article></section>");
  });

  it("renders dynamic components with props and slots", async () => {
    const result = compileSsr(`<template>
  <section>
    <component :is="current" :message="message" v-bind="{ role: 'note' }">
      <strong>{{ label }}</strong>
    </component>
    <component :is="empty" />
  </section>
</template>
<script>
const message = "dynamic";
const label = "slot";
const empty = null;
const Child = {
  async renderToString(props) {
    return '<article data-message="' + props.message + '" data-role="' + props.role + '">' + await props.children() + '</article>';
  }
};
const current = Child;
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe('<section><article data-message="dynamic" data-role="note"><strong>slot</strong></article></section>');
  });

  it("requires dynamic SSR components to expose renderToString", async () => {
    const result = compileSsr(`<template><component :is="current" /></template><script>const current = { mount() {} };</script>`);
    const render = loadSsrRender(result.code);

    await expect(render()).rejects.toThrow(/Dynamic component :is must resolve to a component object with renderToString\(\)/);
    expect(() => compileSsr(`<template><component /></template>`)).toThrow(/Dynamic component requires :is/);
  });

  it("renders KeepAlive dynamic component children during SSR", async () => {
    const result = compileSsr(`<template>
  <section>
    <KeepAlive include="Panel" :max="2">
      <component :is="current" :message="message">
        <em>{{ label }}</em>
      </component>
    </KeepAlive>
  </section>
</template>
<script>
const message = "cached";
const label = "projected";
const Panel = {
  async renderToString(props) {
    return '<article data-message="' + props.message + '">' + await props.children() + '</article>';
  }
};
const current = Panel;
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe('<section><article data-message="cached"><em>projected</em></article></section>');
    expect(() => compileSsr(`<template><KeepAlive keep="Panel"><component :is="Panel" /></KeepAlive></template>`)).toThrow(/Unsupported attribute "keep" on <KeepAlive>/);
  });

  it("renders AsyncBoundary children during SSR", async () => {
    const result = compileSsr(`<template>
  <section>
    <AsyncBoundary :loading="Loading" :fallback="ErrorView" :delay="10" :timeout="1000">
      <Child message="ready" />
      <p>{{ label }}</p>
    </AsyncBoundary>
    <footer>after</footer>
  </section>
</template>
<script>
const label = "inside";
const Loading = { renderToString() { return "<span>loading</span>"; } };
const ErrorView = { renderToString() { return "<span>error</span>"; } };
const Child = {
  renderToString(props) {
    return '<article>' + props.message + '</article>';
  }
};
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe("<section><article>ready</article><p>inside</p><footer>after</footer></section>");
    expect(() => compileSsr(`<template><AsyncBoundary :loadng="Loading"><p>bad</p></AsyncBoundary></template>`)).toThrow(/Unsupported attribute ":loadng" on <AsyncBoundary>/);
    expect(() => compileSsr(`<template><AsyncBoundary>   </AsyncBoundary></template>`)).toThrow(/<AsyncBoundary> requires at least one child/);
  });

  it("renders ErrorBoundary children during SSR", async () => {
    const result = compileSsr(`<template>
  <section>
    <ErrorBoundary :fallback="ErrorView" :reset-key="version">
      <Child message="ok" />
    </ErrorBoundary>
    <footer>after</footer>
  </section>
</template>
<script>
const version = 1;
const ErrorView = { renderToString() { return "<span>error</span>"; } };
const Child = {
  renderToString(props) {
    return '<article>' + props.message + '</article>';
  }
};
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe("<section><article>ok</article><footer>after</footer></section>");
    expect(() => compileSsr(`<template><ErrorBoundary :fallbak="ErrorView"><p>bad</p></ErrorBoundary></template>`)).toThrow(/Unsupported attribute ":fallbak" on <ErrorBoundary>/);
    expect(() => compileSsr(`<template><ErrorBoundary><p>bad</p></ErrorBoundary></template>`)).toThrow(/<ErrorBoundary> requires :fallback/);
  });

  it("renders Transition children and branches during SSR", async () => {
    const result = compileSsr(`<template>
  <section>
    <Transition name="fade" appear>
      <Child message="ready" />
    </Transition>
    <Transition>
      <p v-if="ready">Ready</p>
      <span v-else>Waiting</span>
    </Transition>
    <footer>after</footer>
  </section>
</template>
<script>
const ready = false;
const Child = {
  renderToString(props) {
    return '<article>' + props.message + '</article>';
  }
};
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe("<section><article>ready</article><span>Waiting</span><footer>after</footer></section>");
    expect(() => compileSsr(`<template><Transition :nam="name"><p>bad</p></Transition></template>`)).toThrow(/Unsupported attribute ":nam" on <Transition>/);
    expect(() => compileSsr(`<template><Transition>text</Transition></template>`)).toThrow(/<Transition> requires exactly one element\/component child or one v-if chain/);
  });

  it("renders TransitionGroup keyed lists during SSR", async () => {
    const result = compileSsr(`<template>
  <section>
    <TransitionGroup tag="ul" name="rows" move-class="move">
      <li v-for="item in items" :key="item.id">{{ item.label }}</li>
    </TransitionGroup>
    <TransitionGroup :tag="groupTag">
      <span v-for="item in items" :key="item.id">{{ item.id }}</span>
    </TransitionGroup>
    <footer>after</footer>
  </section>
</template>
<script>
const groupTag = "div";
const items = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" }
];
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe("<section><ul><li>Alpha</li><li>Beta</li></ul><div><span>a</span><span>b</span></div><footer>after</footer></section>");
    expect(() => compileSsr(`<template><TransitionGroup unknown="x"><p v-for="item in items" :key="item.id">{{ item }}</p></TransitionGroup></template>`)).toThrow(/Unsupported attribute "unknown" on <TransitionGroup>/);
    expect(() => compileSsr(`<template><TransitionGroup><p v-for="item in items">{{ item }}</p></TransitionGroup></template>`)).toThrow(/<TransitionGroup> requires a single keyed v-for child in v1/);
  });

  it("passes SSR component context to children and runtime inject", async () => {
    const result = compileSsr(`<template>
  <section>
    <Child>
      <span>{{ inject(key) }}</span>
    </Child>
  </section>
</template>
<script>
import { inject, provide } from "mikuru";
const key = Symbol.for("mikuru.ssr.theme");
provide(key, "dark");
const Child = {
  async renderToString(props) {
    let value = "missing";
    for (let context = props.__mikuru_context; context; context = context.parent) {
      if (context.provides?.has(key)) {
        value = context.provides.get(key);
        break;
      }
    }
    return '<article data-theme="' + value + '">' + await props.children() + '</article>';
  }
};
</script>`, { filename: "SsrProvide.mikuru" });
    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe('<section><article data-theme="dark"><span>dark</span></article></section>');
  });

  it("renders default slot content and fallback children", async () => {
    const result = compileSsr(`<template>
  <article><slot>Fallback {{ label }}</slot></article>
</template>
<script>
const label = "slot";
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe("<article>Fallback slot</article>");
    await expect(render({ children: () => "<strong>provided</strong>" })).resolves.toBe("<article><strong>provided</strong></article>");
  });

  it("renders async child components with named and scoped slots", async () => {
    const result = compileSsr(`<template>
  <AsyncCard>
    <template #header>
      <h2>{{ title }}</h2>
    </template>
    <template #default="{ item }">
      <p>{{ item.label }}</p>
    </template>
    <template v-slot:footer>
      <small>done</small>
    </template>
  </AsyncCard>
</template>
<script>
const title = "Named";
const AsyncCard = {
  async renderToString(props) {
    return '<article>' + await props.slots.header() + await props.slots.default({ item: { label: "scoped" } }) + await props.slots.footer() + '</article>';
  }
};
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render()).resolves.toBe("<article><h2>Named</h2><p>scoped</p><small>done</small></article>");
  });

  it("passes slot props from child slot outlets", async () => {
    const result = compileSsr(`<template>
  <article><slot name="item" :item="item">Fallback</slot></article>
</template>
<script>
const item = { label: "child" };
</script>`);

    const render = loadSsrRender(result.code);

    await expect(render({
      slots: {
        item: async ({ item }: { item: { label: string } }) => '<strong>' + item.label + '</strong>'
      }
    })).resolves.toBe("<article><strong>child</strong></article>");
  });

  it("collects Teleport SSR content by target selector", async () => {
    const result = compileSsr(`<template>
  <section>
    <h1>{{ title }}</h1>
    <Teleport to="#modal-root">
      <p>{{ message }}</p>
    </Teleport>
    <footer>done</footer>
  </section>
</template>
<script>
const title = "Shell";
const message = "Modal <safe>";
</script>`);
    const render = loadSsrRender(result.code);
    const teleports: Record<string, string> = {};

    await expect(render({ __mikuru_teleports: teleports })).resolves.toBe("<section><h1>Shell</h1><!--teleport:t0--><!--/teleport:t0--><footer>done</footer></section>");
    expect(teleports["#modal-root"]).toBe("<!--teleport content:t0--><p>Modal &lt;safe&gt;</p><!--/teleport content:t0-->");
  });

  it("renders disabled Teleport SSR content inline", async () => {
    const result = compileSsr(`<template>
  <section>
    <Teleport to="#modal-root" disabled>
      <p>{{ message }}</p>
    </Teleport>
    <footer>done</footer>
  </section>
</template>
<script>
const message = "Inline";
</script>`);
    const render = loadSsrRender(result.code);
    const teleports: Record<string, string> = {};

    await expect(render({ __mikuru_teleports: teleports })).resolves.toBe("<section><!--teleport:t0--><p>Inline</p><!--/teleport:t0--><footer>done</footer></section>");
    expect(teleports).toEqual({});
  });

  it("renders router matches with redirects, lazy components, props, and nested default slots", async () => {
    const Shell = {
      async renderToString(props: Record<string, any>) {
        return `<main data-route="${props.route.path}"><h1>Shell</h1>${await props.children()}</main>`;
      }
    };
    const UserPage = {
      renderToString(props: Record<string, any>) {
        return `<p data-id="${props.id}" data-tab="${props.tab}">User ${props.route.params.id}</p>`;
      }
    };
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [
        {
          path: "/",
          component: Shell as any,
          children: [
            { path: "", redirect: "/users/7?tab=info" },
            {
              path: "users/:id",
              component: async () => ({ default: UserPage as any }),
              props: (route) => ({ id: route.params.id, tab: route.query.tab })
            }
          ]
        }
      ]
    });

    const result = await renderRouteToString(router, "/");

    expect(result.route.fullPath).toBe("/users/7?tab=info");
    expect(result.html).toBe('<main data-route="/users/7"><h1>Shell</h1><p data-id="7" data-tab="info">User 7</p></main>');
  });

  it("passes router SSR context through route slots", async () => {
    const Shell = {
      async renderToString(props: Record<string, any>) {
        return `<main>${await props.children({ __mikuru_context: props.__mikuru_context })}</main>`;
      }
    };
    const UserPage = {
      renderToString(props: Record<string, any>) {
        const router = props.__mikuru_context?.provides?.get(Symbol.for("mikuru.router"));
        return `<p data-current="${router?.currentRoute.value.fullPath}">${props.route.params.id}</p>`;
      }
    };
    const router = createRouter({
      history: createMemoryHistory("/users/8"),
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
        }
      ]
    });

    const result = await renderRouteToString(router);

    expect(result.html).toBe('<main><p data-current="/users/8">8</p></main>');
  });

  it("keeps sibling v-for temporary variables unique", async () => {
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

    await expect(render()).resolves.toBe("<section><p>a</p><span>b</span></section>");
  });
});

function loadSsrRender(code: string): (props?: Record<string, unknown>) => Promise<string> {
  const executable = code
    .replace(/import\s+\{([^}]+)\}\s+from\s+["']mikuru["'];?\n+/g, "const { $1 } = helpers;\n")
    .replace("import { escapeHtml as __mikuru_escape, renderAttr as __mikuru_renderAttr, renderAttrs as __mikuru_renderAttrs, renderComponentToString as __mikuru_renderComponent } from \"mikuru/server\";", "const __mikuru_escape = helpers.escapeHtml; const __mikuru_renderAttr = helpers.renderAttr; const __mikuru_renderAttrs = helpers.renderAttrs; const __mikuru_renderComponent = helpers.renderComponentToString;")
    .replace("import { unwrap as __mikuru_unwrap } from \"mikuru/runtime\";", "const __mikuru_unwrap = helpers.unwrap;")
    .replace("export async function renderToString", "async function renderToString");
  const factory = new Function("helpers", `${executable}\nreturn renderToString;`) as (helpers: {
    escapeHtml: typeof escapeHtml;
    renderAttr: typeof renderAttr;
    renderAttrs: typeof renderAttrs;
    renderComponentToString: typeof renderComponentToString;
    inject: typeof inject;
    provide: typeof provide;
    unwrap: typeof unwrap;
  }) => (props?: Record<string, unknown>) => Promise<string>;
  return factory({ escapeHtml, renderAttr, renderAttrs, renderComponentToString, inject, provide, unwrap });
}
