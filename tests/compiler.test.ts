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
    const ast = parseTemplate(`<form @submit.prevent="save"><button v-on:click.stop.self.once.capture.passive="select">Select</button></form>`);

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
      modifiers: ["stop", "self", "once", "capture", "passive"]
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

  it("can generate batched DOM update effects", () => {
    const result = compile(counterSource, { filename: "Counter.mikuru", batchedUpdates: true });

    expect(result.code).toContain("queueJob");
    expect(result.code).toContain("const __mikuru_effect = (fn) => effect(fn, { scheduler: queueJob });");
    expect(result.code).toMatch(/const stop\d+ = __mikuru_effect\(\(\) =>/);
    expect(result.code).not.toMatch(/const stop\d+ = effect\(\(\) =>/);
  });

  it("keeps runtime helper imports available inside normalized scripts", () => {
    const result = compile(`<template><p>{{ status }}</p></template>
<script>
import { computed, flushJobs, inject, isProxy, isReactive, isReadonly, isRef, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, onUnmounted, provide, queueJob, reactive, readonly, ref, toRaw, toRef, toRefs, unref, watch, watchEffect } from "mikuru";
import { nextTick as tick } from "mikuru/runtime";

const status = ref("idle");
const state = reactive({ status });
const statusRef = toRef(state, "status");
const stateRefs = toRefs(state);
const locked = readonly(state);
const ready = computed(() => status.value);
const stop = watch(status, () => {});
const stopEffect = watchEffect(() => {});
queueJob(() => {});
flushJobs();
isReactive(state);
isReadonly(locked);
isProxy(locked);
isRef(statusRef);
toRaw(state);
unref(statusRef);
unref(stateRefs.status);
provide("status", ready.value);
inject("status");
nextTick(() => {});
tick(() => {});
onMounted(() => {});
onActivated(() => {});
onDeactivated(() => {});
onBeforeUnmount(stop);
onUnmounted(stopEffect);
</script>`);

    expect(result.code).toContain("computed");
    expect(result.code).toContain("flushJobs");
    expect(result.code).toContain("inject");
    expect(result.code).toContain("isProxy");
    expect(result.code).toContain("isReactive");
    expect(result.code).toContain("isReadonly");
    expect(result.code).toContain("isRef");
    expect(result.code).toContain("nextTick");
    expect(result.code).toContain("nextTick as tick");
    expect(result.code).toContain("onMounted");
    expect(result.code).toContain("onActivated");
    expect(result.code).toContain("onDeactivated");
    expect(result.code).toContain("onBeforeUnmount");
    expect(result.code).toContain("onUnmounted");
    expect(result.code).toContain("provide");
    expect(result.code).toContain("queueJob");
    expect(result.code).toContain("reactive");
    expect(result.code).toContain("readonly");
    expect(result.code).toContain("toRaw");
    expect(result.code).toContain("toRef");
    expect(result.code).toContain("toRefs");
    expect(result.code).toContain("unref");
    expect(result.code).toContain("const stop = watch(status");
    expect(result.code).toContain("const stopEffect = watchEffect");
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

  it("maps generated template and script lines back to their original source lines", () => {
    const result = compile(
      `<template>
  <section>
    <p :class="stateClass" @click="save">{{ message }}</p>
  </section>
</template>

<script>
const message = "mapped";
const stateClass = "ready";
function save() {}
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

    const decoded = decodeSourceMapMappings(result.map.mappings);
    const codeLines = result.code.split("\n");
    const generatedLine = (pattern: string) => {
      const index = codeLines.findIndex((line) => line.includes(pattern));
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };

    expect(decoded[generatedLine('document.createElement("p")')]?.originalLine).toBe(3);
    expect(decoded[generatedLine("unwrap(stateClass)")]?.originalLine).toBe(3);
    expect(decoded[generatedLine("__mikuru_guardEventHandler(save)")]?.originalLine).toBe(3);
    expect(decoded[generatedLine("unwrap(message)")]?.originalLine).toBe(3);
    expect(decoded[generatedLine('const message = "mapped";')]?.originalLine).toBe(8);
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
    expect(result.code).toContain("onUpdateModelValue: __mikuru_guardEventHandler(($value) => { name.value = $value; })");
  });

  it("generates multiple component v-model props and modifier props", () => {
    const result = compile(`<template><Child v-model:title.trim="title" v-model:checked="checked" /></template><script>import Child from "./Child.mikuru"; const title = ref("Mikuru"); const checked = ref(false);</script>`);

    expect(result.code).toContain("get title() { return unwrap(unwrap(title)); }");
    expect(result.code).toContain("onUpdateTitle: __mikuru_guardEventHandler(($value) => { title.value = $value; })");
    expect(result.code).toContain("titleModifiers: { trim: true }");
    expect(result.code).toContain("get checked() { return unwrap(unwrap(checked)); }");
    expect(result.code).toContain("onUpdateChecked: __mikuru_guardEventHandler(($value) => { checked.value = $value; })");
  });

  it("generates v-model modifiers and component v-show", () => {
    const input = compile(`<template><input v-model.trim.number.lazy="age" /></template><script>const age = ref(1);</script>`);
    const component = compile(`<template><Child v-show="visible" v-model.trim="name" /></template><script>import Child from "./Child.mikuru"; const visible = ref(true); const name = ref("Mikuru");</script>`);

    expect(input.code).toContain("addEventListener(\"change\"");
    expect(input.code).toContain(".trim()");
    expect(input.code).toContain("Number(");
    expect(component.code).toContain(".style.display = unwrap(unwrap(visible))");
    expect(component.code).toContain("modelModifiers: { trim: true }");
  });

  it("generates dynamic component mounts", () => {
    const result = compile(`<template>
  <component :is="current" :message="message" @select="select" ref="activeChild">
    <template #default="{ label }">{{ label }}</template>
  </component>
</template>
<script>
const current = First;
const message = "Hello";
const activeChild = ref(null);
function select() {}
</script>`);

    expect(result.code).toContain("document.createComment(\"component\")");
    expect(result.code).toContain("currentComponent");
    expect(result.code).toContain(".mount(");
    expect(result.code).toContain("Dynamic component :is must resolve");
    expect(result.code).toContain("__mikuru_setRef(activeChild");
  });

  it("generates built-in Transition enter and leave hooks", () => {
    const result = compile(`<template>
  <Transition name="fade">
    <p>Hello</p>
  </Transition>
</template>`);

    expect(result.code).toContain("__mikuru_applyTransitionEnter");
    expect(result.code).toContain("__mikuru_removeNode");
    expect(result.code).toContain("__mikuru_transition = transition");
    expect(result.code).toContain("\"fade\"");
  });

  it("generates built-in TransitionGroup keyed list hooks", () => {
    const result = compile(`<template>
  <TransitionGroup name="list" tag="ul" move-class="moving">
    <li v-for="item in items" :key="item.id">{{ item.label }}</li>
  </TransitionGroup>
</template>
<script>
const items = ref([{ id: "a", label: "Alpha" }]);
</script>`);

    expect(result.code).toContain("__mikuru_applyTransitionEnter");
    expect(result.code).toContain("__mikuru_applyTransitionMove");
    expect(result.code).toContain("document.createElement(String(unwrap(\"ul\")");
    expect(result.code).toContain("moveClass: String(unwrap(\"moving\")");
  });


  it("generates object-form v-bind and v-on for elements and components", () => {
    const element = compile(`<template><button v-bind="attrs" v-on="listeners">Save</button></template>
<script>
const attrs = { title: "Save" };
const listeners = { click() {} };
</script>`);
    const component = compile(`<template><Child v-bind="childProps" v-on="childListeners" title="Explicit" /></template>
<script>
import Child from "./Child.mikuru";
const childProps = { title: "Object title" };
const childListeners = { select() {} };
</script>`);

    expect(element.code).toContain("Object.entries");
    expect(element.code).toContain("removeEventListener");
    expect(component.code).toContain("new Proxy");
    expect(component.code).toContain("childProps");
    expect(component.code).toContain("childListeners");
  });

  it("generates v-bind modifiers for element and component bindings", () => {
    const element = compile(`<template>
  <input :indeterminate.prop="mixed" :data-user-id.camel="userId" :aria-hidden.attr="hidden" :[name].camel="value" />
</template>
<script>
const mixed = true;
const userId = "42";
const hidden = false;
const name = "data-current-id";
const value = "active";
</script>`);
    const component = compile(`<template><Child :user-name.camel="name" /></template>
<script>
import Child from "./Child.mikuru";
const name = "Mikuru";
</script>`);

    expect(element.code).toContain('setAttribute(el0, "indeterminate"');
    expect(element.code).toContain("{ property: true }");
    expect(element.code).toContain('setAttribute(el0, "dataUserId"');
    expect(element.code).toContain('setAttribute(el0, "aria-hidden"');
    expect(element.code).toContain("{ attribute: true }");
    expect(element.code).toContain(".replace(/-([a-z])/g");
    expect(component.code).toContain("get userName()");
    expect(() => compile(`<template><Child :value.prop="value" /></template><script>const value = 1;</script>`)).toThrow(
      /v-bind \.prop and \.attr modifiers are only supported on native elements/
    );
  });

  it("generates object-form v-bind modifiers for native elements", () => {
    const element = compile(`<template>
  <input v-bind.prop="propertyAttrs" v-bind.attr="attributeAttrs" v-bind.camel="camelAttrs" />
</template>
<script>
const propertyAttrs = { indeterminate: true };
const attributeAttrs = { "aria-hidden": false };
const camelAttrs = { "data-user-id": "42" };
</script>`);

    expect(element.code).toContain("{ property: true }");
    expect(element.code).toContain("{ attribute: true }");
    expect(element.code).toContain(".replace(/-([a-z])/g");
    expect(() => compile(`<template><Child v-bind.prop="attrs" /></template><script>const attrs = {};</script>`)).toThrow(
      /Object v-bind modifiers are only supported on native elements/
    );
  });

  it("generates component attribute fallthrough", () => {
    const result = compile(`<template>
  <Child id="panel" title="Panel" :aria-label="label" class="parent" :class="{ active }" style="color: red" :style="{ fontSize: size }" v-bind="attrs" />
</template>
<script>
import Child from "./Child.mikuru";
const active = true;
const label = "Panel";
const size = "12px";
const attrs = { class: "bound", style: { color: "blue" } };
</script>`);

    expect(result.code).toContain(".element;");
    expect(result.code).toContain("getAttribute(\"class\")");
    expect(result.code).toContain("setAttribute(");
    expect(result.code).toContain("\"class\"");
    expect(result.code).toContain("\"style\"");
    expect(result.code).toContain("source[\"class\"]");
    expect(result.code).toContain("source[\"style\"]");
    expect(result.code).toContain("\"id\"");
    expect(result.code).toContain("\"title\"");
    expect(result.code).toContain("\"aria-label\"");
  });

  it("generates useAttrs and inheritAttrs options", () => {
    const result = compile(`<template><button v-bind="attrs">Forward</button></template>
<script>
const attrs = useAttrs();
defineOptions({ inheritAttrs: false });
</script>`);

    expect(result.code).toContain("const __mikuru_attrs = props.__mikuru_attrs ?? {};");
    expect(result.code).toContain("const attrs = __mikuru_attrs;");
    expect(result.code).toContain("inheritAttrs: false");
  });

  it("generates template ref assignments and cleanup", () => {
    const result = compile(`<template><input ref="inputEl" /></template><script>const inputEl = ref(null);</script>`);
    const component = compile(`<template><Child ref="childRef" /></template><script>import Child from "./Child.mikuru"; const childRef = ref(null);</script>`);
    const dynamic = compile(`<template><input :ref="currentRef" /></template><script>const currentRef = ref(null);</script>`);
    const repeated = compile(`<template><ul><li v-for="item in items" ref="itemEls">{{ item }}</li></ul></template><script>const items = ref(["a"]); const itemEls = ref([]);</script>`);

    expect(result.code).toContain("__mikuru_setRef(inputEl, el");
    expect(component.code).toContain("__mikuru_setRef(childRef, component");
    expect(dynamic.code).toContain("__mikuru_setRef(unwrap(currentRef), el");
    expect(repeated.code).toContain("__mikuru_setRef(itemEls, el");
    expect(repeated.code).toContain("true");
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

  it("generates long-form slot templates and slot fallback branches", () => {
    const parent = compile(`<template>
  <Panel>
    <template v-slot:header="slotProps">
      <h2>{{ slotProps.title }}</h2>
    </template>
  </Panel>
</template>
<script>import Panel from "./Panel.mikuru";</script>`);
    const child = compile(`<template>
  <section>
    <slot name="header">Fallback header</slot>
  </section>
</template>`);

    expect(parent.code).toContain("header(slotTarget");
    expect(parent.code).toContain("const slotProps = slotProps");
    expect(child.code).toContain("} else {");
    expect(child.code).toContain("Fallback header");
  });

  it("generates dynamic slot names for outlets and templates", () => {
    const parent = compile(`<template>
  <Panel>
    <template v-slot:[activeSlot]="{ title }">
      <h2>{{ title }}</h2>
    </template>
  </Panel>
</template>
<script>
import Panel from "./Panel.mikuru";
const activeSlot = "header";
</script>`);
    const child = compile(`<template><slot :name="activeSlot" :title="title" /></template><script>const activeSlot = "header"; const title = "Title";</script>`);

    expect(parent.code).toContain("slots: {");
    expect(parent.code).toContain("[unwrap(activeSlot)](slotTarget");
    expect(child.code).toContain("const slotName");
    expect(child.code).toContain("props.slots?.[slotName");
  });

  it("generates slot scope destructuring defaults", () => {
    const result = compile(`<template>
  <Panel>
    <template #default="{ title = 'Untitled', count: total = 0, item: { label, meta: { tone = 'calm' } }, ...rest }">
      <h2>{{ title }}</h2>
      <p>{{ total }}</p>
      <strong>{{ label }}:{{ tone }}:{{ rest.extra }}</strong>
    </template>
  </Panel>
</template>
<script>import Panel from "./Panel.mikuru";</script>`);

    expect(result.code).toContain("const value = slotProps");
    expect(result.code).toContain("return value === undefined ? ('Untitled') : value");
    expect(result.code).toContain("return value === undefined ? (0) : value");
    expect(result.code).toContain(".item?.label");
    expect(result.code).toContain(".item?.meta?.tone");
    expect(result.code).toContain("delete rest[\"title\"]");
  });

  it("rejects DOM-only event modifiers on component events", () => {
    expect(() =>
      compile(`<template><Child @select.stop="select" /></template><script>import Child from "./Child.mikuru"; function select() {}</script>`, {
        filename: "ComponentEventModifier.mikuru"
      })
    ).toThrow(/Event modifier \.stop is only supported on DOM events/);
    expect(() =>
      compile(`<template><Child @select.enter="select" /></template><script>import Child from "./Child.mikuru"; function select() {}</script>`, {
        filename: "ComponentKeyModifier.mikuru"
      })
    ).toThrow(/Event modifier \.enter is only supported on DOM events/);
  });

  it("emits once wrappers for component events", () => {
    const result = compile(`<template><Child @select.once="select" /></template><script>import Child from "./Child.mikuru"; function select() {}</script>`);

    expect(result.code).toContain("onSelect: __mikuru_guardEventHandler((() =>");
    expect(result.code).toContain("return (...$args) =>");
    expect(result.code).toContain("return handler");
  });

  it("rejects conflicting passive and prevent DOM event modifiers", () => {
    expect(() =>
      compile(`<template><form @submit.passive.prevent="save"></form></template><script>function save() {}</script>`, {
        filename: "PassivePrevent.mikuru"
      })
    ).toThrow(/\.passive and \.prevent cannot be combined/);
  });

  it("emits DOM event listener options for option modifiers", () => {
    const result = compile(`<template><button @click.capture.once.passive="select">Select</button></template><script>function select() {}</script>`);

    expect(result.code).toContain(`addEventListener("click", handler`);
    expect(result.code).toContain(`{ capture: true, once: true, passive: true }`);
    expect(result.code).toContain(`removeEventListener("click", handler`);
  });

  it("emits guards for DOM key and system event modifiers", () => {
    const result = compile(`<template><input @keydown.ctrl.enter="save" /></template><script>function save() {}</script>`);

    expect(result.code).toContain('!$event.ctrlKey || !["Enter"].includes($event.key)');
    expect(result.code).toContain('addEventListener("keydown"');
  });

  it("emits guards for DOM mouse button and exact modifiers", () => {
    const mouse = compile(`<template><button @click.right="open">Open</button></template><script>function open() {}</script>`);
    const exact = compile(`<template><button @click.ctrl.exact="open">Open</button></template><script>function open() {}</script>`);

    expect(mouse.code).toContain("$event.button !== 2");
    expect(exact.code).toContain("!$event.ctrlKey || $event.shiftKey || $event.altKey || $event.metaKey");
  });

  it("emits inline event handler assignments", () => {
    const result = compile(`<template><button @click="count += 1">{{ count }}</button></template><script>const count = ref(0);</script>`);

    expect(result.bindings).toContainEqual({ type: "event", event: "click", handler: "count += 1" });
    expect(result.code).toContain("count.value += 1");
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
    expect(() => compile(`<template><button @click="eval('bad')">Set</button></template>`)).toThrow(/Unsupported event handler/);
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
    expect(() => compile(`<template><input ref="input.el" /></template><script>const input = ref(null);</script>`)).toThrow(
      /Template ref must be a simple identifier/
    );
    expect(() =>
      compile(`<template><Panel><template #default="{ items: [first] }">{{ first }}</template></Panel></template><script>import Panel from "./Panel.mikuru";</script>`)
    ).toThrow(/nested object patterns only/);
    expect(() =>
      compile(`<template><Panel><template #default="{ ...rest: alias }">{{ alias }}</template></Panel></template><script>import Panel from "./Panel.mikuru";</script>`)
    ).toThrow(/rest destructuring must use a simple identifier/);
  });

  it("reports filename, line, column, and frame for conflicting content directives", () => {
    const error = captureCompileError(
      `<template>
  <section>
    <article v-html="html" v-text="text"></article>
  </section>
</template>`,
      "ContentDirectiveError.mikuru"
    );

    expect(error).toMatchObject({
      name: "MikuruCompileError",
      filename: "ContentDirectiveError.mikuru",
      line: 3,
      column: 28
    });
    expect(error.message).toMatch(/v-html and v-text cannot be used on the same element/);
    expect(error.message).toMatch(/ContentDirectiveError\.mikuru:3:28/);
    expect(error.frame).toContain('<article v-html="html" v-text="text"></article>');
    expect(error.frame).toContain("^");
  });

  it("treats v-pre content as literal template text", () => {
    const result = compile(`<template><section v-pre>{{ invalid + }}<span v-if="false">{{ raw }}</span></section></template>`);

    expect(result.bindings).toEqual([]);
    expect(result.code).toContain('document.createTextNode("{{ invalid + }}")');
    expect(result.code).toMatch(/setAttribute\(el\d+, "v-if", "false"\)/);
  });

  it("analyzes dynamic argument expressions", () => {
    const result = compile(`<template><button :[attrName]="value" @[eventName]="handle">Go</button></template><script>const attrName = "data-mode"; const value = "ready"; const eventName = "click"; function handle() {}</script>`);

    expect(result.bindings).toEqual(expect.arrayContaining([
      { type: "attribute", name: "name", expression: "attrName" },
      { type: "attribute", name: "value", expression: "value" },
      { type: "attribute", name: "event", expression: "eventName" },
      { type: "event", event: "dynamic", handler: "handle" }
    ]));
  });

  it("reports values on valueless directives", () => {
    expect(() => compile(`<template><section v-pre="raw">Text</section></template>`)).toThrow(/v-pre does not accept a value/);
    expect(() => compile(`<template><section v-cloak="ready">Text</section></template>`)).toThrow(/v-cloak does not accept a value/);
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
    expect(() => compile(`<template><component /></template>`)).toThrow(/Dynamic component requires :is/);
    expect(() => compile(`<template><Panel v-slot:header>Header</Panel></template>`)).toThrow(
      /Wrap slot content in <template #name>/
    );
    expect(() =>
      compile(`<template><Panel><template #header>One</template><template v-slot:header>Two</template></Panel></template>`)
    ).toThrow(/Duplicate slot template: header/);
    expect(() =>
      compile(`<template><Panel><template #default="{ title: heading: bad }">Bad</template></Panel></template>`)
    ).toThrow(/Unsupported slot scope binding/);
  });

  it("suggests supported attributes for built-in component typos", () => {
    expect(() =>
      compile(`<template><AsyncBoundary :loading="Loading" :fallbak="ErrorView"><Panel /></AsyncBoundary></template>`)
    ).toThrow(/Unsupported attribute ":fallbak" on <AsyncBoundary>\. Did you mean :fallback\?/);

    expect(() =>
      compile(`<template><ErrorBoundary :fallbak="ErrorView"><Panel /></ErrorBoundary></template>`)
    ).toThrow(/Unsupported attribute ":fallbak" on <ErrorBoundary>\. Did you mean :fallback\?/);

    expect(() => compile(`<template><Teleport to="#modal" disabeld><p>Modal</p></Teleport></template>`)).toThrow(
      /Unsupported attribute "disabeld" on <Teleport>\. Did you mean disabled\?/
    );

    expect(() => compile(`<template><Transition mod="out-in"><p>Hi</p></Transition></template>`)).toThrow(
      /Unsupported attribute "mod" on <Transition>\. Did you mean mode\?/
    );

    expect(() =>
      compile(`<template><TransitionGroup mode="out-in"><p v-for="item in items" :key="item.id">{{ item.id }}</p></TransitionGroup></template>`)
    ).toThrow(/Unsupported attribute "mode" on <TransitionGroup>/);

    expect(() =>
      compile(`<template><TransitionGroup><p v-for="item in items">{{ item.id }}</p></TransitionGroup></template>`)
    ).toThrow(/<TransitionGroup> requires a single keyed v-for child in v1/);

    expect(() => compile(`<template><KeepAlive keep="Panel"><component :is="Panel" /></KeepAlive></template>`)).toThrow(
      /Unsupported attribute "keep" on <KeepAlive>/
    );
  });

  it("suggests supported directives and modifiers for template typos", () => {
    expect(() => compile(`<template><p v-iff="ok">Hi</p></template>`)).toThrow(
      /Unsupported directive "v-iff"\. Did you mean v-if\?/
    );

    expect(() => compile(`<template><p v-els>Fallback</p></template>`)).toThrow(
      /Unsupported directive "v-els"\. Did you mean v-else\?/
    );

    expect(() => compile(`<template><p v-onc>Once</p></template>`)).toThrow(
      /Unsupported directive "v-onc"\. Did you mean v-once\?/
    );

    expect(() => compile(`<template><p v-once="value">Once</p></template>`)).toThrow(
      /v-once does not accept a value/
    );

    expect(() => compile(`<template><input v-modle="name" /></template>`)).toThrow(
      /Unsupported directive "v-modle"\. Did you mean v-model\?/
    );

    expect(() => compile(`<template><p v-mem="[value]">Hi</p></template>`)).toThrow(
      /Unsupported directive "v-mem"\. Did you mean v-memo\?/
    );

    expect(() => compile(`<template><p v-memo="value">Hi</p></template>`)).toThrow(
      /v-memo requires an array expression/
    );

    expect(() => compile(`<template><p v-bindd:title="title">Hi</p></template>`)).toThrow(
      /Unsupported directive "v-bindd:title"\. Did you mean v-bind:title\?/
    );

    expect(() => compile(`<template><button @click.prevet="save">Save</button></template>`)).toThrow(
      /Unsupported event modifier \.prevet\. Did you mean \.prevent\?/
    );

    expect(() => compile(`<template><input v-model.trm="name" /></template>`)).toThrow(
      /Unsupported v-model modifier \.trm\. Did you mean \.trim\?/
    );

    expect(() => compile(`<template><input v-model:title="name" /></template>`)).toThrow(
      /v-model arguments are only supported on components in v1/
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
    expect(result.code).toContain("registerDebugComponent");
  });

  it("passes batched update options through the Vite plugin", async () => {
    const plugin = mikuru({ batchedUpdates: true });
    const transform = plugin.transform as unknown as Function;
    const result = await transform.call(
      {
        error(error: string | Error) {
          throw error instanceof Error ? error : new Error(error);
        }
      },
      `<template><p>{{ message }}</p></template><script>const message = ref("batched");</script>`,
      "Batched.mikuru"
    );

    expect(result.code).toContain("queueJob");
    expect(result.code).toContain("__mikuru_effect");
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

  it("forwards non-Mikuru transform errors through Vite with a fallback location and frame", () => {
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
            throw new Error("vite forwarded fallback");
          }
        },
        `<template>
  <p :class>Missing binding value</p>
</template>`,
        "src/FallbackForwarding.mikuru"
      )
    ).toThrow(/vite forwarded fallback/);

    expect(forwarded).toMatchObject({
      id: "src/FallbackForwarding.mikuru",
      loc: { line: 1, column: 1 }
    });
    expect(forwarded?.message).toMatch(/Directive :class requires a value/);
    expect(forwarded?.frame).toContain("<template>");
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

function decodeSourceMapMappings(mappings: string): Array<{ originalLine: number; originalColumn: number } | undefined> {
  const lines = mappings.split(";");
  let sourceLine = 0;
  let sourceColumn = 0;

  return lines.map((line) => {
    if (!line) {
      return undefined;
    }

    const segment = decodeVlqSegment(line.split(",")[0] ?? "");

    if (segment.length < 4) {
      return undefined;
    }

    sourceLine += segment[2] ?? 0;
    sourceColumn += segment[3] ?? 0;

    return {
      originalLine: sourceLine + 1,
      originalColumn: sourceColumn + 1
    };
  });
}

function decodeVlqSegment(segment: string): number[] {
  const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const values: number[] = [];
  let value = 0;
  let shift = 0;

  for (const char of segment) {
    let digit = base64Chars.indexOf(char);
    const continuation = Boolean(digit & 32);
    digit &= 31;
    value += digit << shift;

    if (continuation) {
      shift += 5;
      continue;
    }

    const negative = Boolean(value & 1);
    values.push(negative ? -(value >> 1) : value >> 1);
    value = 0;
    shift = 0;
  }

  return values;
}
