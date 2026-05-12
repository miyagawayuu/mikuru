import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";

import {
  computed,
  createDebugInspector,
  effect,
  emitDebugEvent,
  flushJobs,
  inject,
  isProxy,
  isReactive,
  isReadonly,
  isRef,
  nextTick,
  normalizeClass,
  normalizeStyle,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  onUnmounted,
  provide,
  queueJob,
  reactive,
  readonly,
  ref,
  registerDebugComponent,
  setAttribute,
  toRaw,
  toRef,
  toRefs,
  unref,
  unwrap,
  watch,
  watchEffect
} from "../src/runtime/index.js";

describe("runtime debug inspector", () => {
  it("reads, clears, and subscribes to debug events", () => {
    const previousHook = (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__;
    delete (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__;

    try {
      const inspector = createDebugInspector();
      const received: string[] = [];
      const unsubscribe = inspector.subscribe((event) => received.push(event.type));

      emitDebugEvent("test:event", { ok: true });

      expect(inspector.getEvents()).toHaveLength(1);
      expect(inspector.getEvents()[0]).toMatchObject({ type: "test:event", payload: { ok: true } });
      expect(received).toEqual(["test:event"]);

      inspector.clearEvents();
      expect(inspector.getEvents()).toEqual([]);

      unsubscribe();
      emitDebugEvent("test:after-unsubscribe");
      expect(received).toEqual(["test:event"]);
    } finally {
      if (previousHook === undefined) {
        delete (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__;
      } else {
        (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__ = previousHook;
      }
    }
  });

  it("emits component register, update, and unregister events", () => {
    const previousHook = (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__;
    delete (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__;

    try {
      const inspector = createDebugInspector();
      const seen: string[] = [];
      inspector.subscribe((event) => seen.push(event.type));
      const registration = registerDebugComponent({ name: "DebugPanel", props: { label: "Hello" } });

      registration.update({ root: new Window().document.createElement("section") as unknown as Element });
      registration.unregister();

      expect(inspector.getComponents()).toEqual([]);
      expect(inspector.getEvents().map((event) => event.type)).toEqual([
        "component:register",
        "component:update",
        "component:unregister"
      ]);
      expect(seen).toEqual(["component:register", "component:update", "component:unregister"]);
    } finally {
      if (previousHook === undefined) {
        delete (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__;
      } else {
        (globalThis as { __MIKURU_DEVTOOLS__?: unknown }).__MIKURU_DEVTOOLS__ = previousHook;
      }
    }
  });
});

describe("runtime reactivity", () => {
  it("reruns effects when a ref changes", () => {
    const count = ref(0);
    let observed = 0;

    effect(() => {
      observed = count.value;
    });

    count.value = 2;

    expect(observed).toBe(2);
  });

  it("derives computed values", () => {
    const count = ref(2);
    const doubled = computed(() => count.value * 2);

    count.value = 4;

    expect(doubled.value).toBe(8);
  });

  it("evaluates computed values lazily and caches them until dependencies change", () => {
    const count = ref(1);
    let getterCalls = 0;
    const doubled = computed(() => {
      getterCalls += 1;
      return count.value * 2;
    });

    expect(getterCalls).toBe(0);
    expect(doubled.value).toBe(2);
    expect(doubled.value).toBe(2);
    expect(getterCalls).toBe(1);

    count.value = 2;
    expect(getterCalls).toBe(1);
    expect(doubled.value).toBe(4);
    expect(getterCalls).toBe(2);
  });

  it("notifies effects that depend on computed values", () => {
    const count = ref(1);
    const doubled = computed(() => count.value * 2);
    const observed: number[] = [];

    const stop = effect(() => {
      observed.push(doubled.value);
    });

    count.value = 2;
    stop();
    count.value = 3;

    expect(observed).toEqual([2, 4]);
  });

  it("supports writable computed refs", () => {
    const first = ref("Mikuru");
    const last = ref("Runtime");
    const fullName = computed({
      get: () => `${first.value} ${last.value}`,
      set: (nextValue: string) => {
        const [nextFirst = "", nextLast = ""] = nextValue.split(" ");
        first.value = nextFirst;
        last.value = nextLast;
      }
    });

    expect(fullName.value).toBe("Mikuru Runtime");

    fullName.value = "Writable Computed";

    expect(first.value).toBe("Writable");
    expect(last.value).toBe("Computed");
    expect(fullName.value).toBe("Writable Computed");
  });

  it("watches computed values through their cached ref-like value", () => {
    const count = ref(1);
    const doubled = computed(() => count.value * 2);
    const calls: Array<{ next: unknown; previous: unknown }> = [];

    const stop = watch(doubled, (next, previous) => {
      calls.push({ next, previous });
    });

    count.value = 2;
    stop();
    count.value = 3;

    expect(calls).toEqual([{ next: 4, previous: 2 }]);
  });

  it("tracks reactive object property writes and deletes", () => {
    const state = reactive<{ count: number; label?: string }>({ count: 0, label: "idle" });
    const observed: string[] = [];

    const stop = effect(() => {
      observed.push(`${state.count}:${"label" in state}:${state.label ?? "missing"}`);
    });

    state.count = 1;
    delete state.label;
    stop();
    state.count = 2;

    expect(observed).toEqual(["0:true:idle", "1:true:idle", "1:false:missing"]);
    expect(isReactive(state)).toBe(true);
    expect(isReadonly(state)).toBe(false);
    expect(isProxy(state)).toBe(true);
    expect(toRaw(state)).toEqual({ count: 2 });
  });

  it("tracks reactive iteration and array length", () => {
    const state = reactive<{ items: string[]; extra?: string }>({ items: ["a"] });
    const keys: string[] = [];
    const lengths: number[] = [];

    const stopKeys = effect(() => {
      keys.push(Object.keys(state).join(","));
    });
    const stopLength = effect(() => {
      lengths.push(state.items.length);
    });

    state.extra = "ready";
    state.items.push("b");
    delete state.extra;
    stopKeys();
    stopLength();

    expect(keys).toEqual(["items", "items,extra", "items"]);
    expect(lengths).toEqual([1, 2]);
  });

  it("keeps readonly objects stable and blocks mutation", () => {
    const source = { count: 0 };
    const state = readonly(source);
    const observed: number[] = [];

    const stop = effect(() => {
      observed.push(state.count);
    });

    (state as { count: number }).count = 1;
    delete (state as { count?: number }).count;
    stop();

    expect(source).toEqual({ count: 0 });
    expect(observed).toEqual([0]);
    expect(isReactive(state)).toBe(false);
    expect(isReadonly(state)).toBe(true);
    expect(isProxy(state)).toBe(true);
    expect(toRaw(state)).toBe(source);
  });

  it("stops effects and skips unchanged ref writes", () => {
    const count = ref(0);
    let runs = 0;
    const stop = effect(() => {
      runs += 1;
      count.value;
    });

    count.value = 0;
    expect(runs).toBe(1);

    count.value = 1;
    expect(runs).toBe(2);

    stop();
    count.value = 2;
    expect(runs).toBe(2);
  });

  it("schedules effects when a scheduler is provided", () => {
    const count = ref(0);
    const queue: Array<() => void> = [];
    let observed = 0;

    const stop = effect(() => {
      observed = count.value;
    }, {
      scheduler: (runner) => {
        queue.push(runner);
      }
    });

    expect(observed).toBe(0);

    count.value = 1;
    expect(observed).toBe(0);
    expect(queue).toHaveLength(1);

    queue.shift()?.();
    expect(observed).toBe(1);

    stop();
    count.value = 2;
    expect(queue).toHaveLength(0);
    expect(observed).toBe(1);
  });

  it("dedupes queued jobs and flushes them before nextTick callbacks", async () => {
    const calls: string[] = [];
    const job = () => calls.push("job");

    queueJob(job);
    queueJob(job);
    const tick = nextTick(() => calls.push("tick"));
    calls.push("sync");

    expect(calls).toEqual(["sync"]);

    await tick;

    expect(calls).toEqual(["sync", "job", "tick"]);
  });

  it("flushes queued jobs synchronously and drains nested jobs", () => {
    const calls: string[] = [];
    const nested = () => calls.push("nested");

    queueJob(() => {
      calls.push("job");
      queueJob(nested);
    });

    flushJobs();

    expect(calls).toEqual(["job", "nested"]);
  });

  it("uses queueJob as an effect scheduler", async () => {
    const count = ref(0);
    let observed = 0;

    const stop = effect(() => {
      observed = count.value;
    }, {
      scheduler: queueJob
    });

    count.value = 1;
    count.value = 2;
    expect(observed).toBe(0);

    await nextTick();

    expect(observed).toBe(2);

    stop();
  });

  it("runs watchEffect with cleanup until stopped", () => {
    const count = ref(0);
    const calls: string[] = [];
    const stop = watchEffect((onCleanup) => {
      calls.push(`effect:${count.value}`);
      onCleanup(() => {
        calls.push(`cleanup:${count.value}`);
      });
    });

    count.value = 1;
    count.value = 2;
    stop();
    count.value = 3;

    expect(calls).toEqual([
      "effect:0",
      "cleanup:1",
      "effect:1",
      "cleanup:2",
      "effect:2",
      "cleanup:2"
    ]);
  });

  it("unwraps ref-like values", () => {
    expect(unwrap(ref("mikuru"))).toBe("mikuru");
    expect(unwrap("plain")).toBe("plain");
  });

  it("checks and unwraps refs with public helpers", () => {
    const count = ref(1);
    const doubled = computed(() => count.value * 2);

    expect(isRef(count)).toBe(true);
    expect(isRef(doubled)).toBe(true);
    expect(isRef({ value: "plain" })).toBe(true);
    expect(isRef(reactive({ value: 1 }))).toBe(true);
    expect(isRef("plain")).toBe(false);
    expect(unref(count)).toBe(1);
    expect(unref(doubled)).toBe(2);
    expect(unref("plain")).toBe("plain");
  });

  it("creates property refs that stay linked to reactive state", () => {
    const state = reactive({ count: 1, label: "idle" });
    const count = toRef(state, "count");
    const observed: number[] = [];

    const stop = effect(() => {
      observed.push(count.value);
    });

    state.count = 2;
    count.value = 3;
    stop();
    state.count = 4;

    expect(state.count).toBe(4);
    expect(count.value).toBe(4);
    expect(observed).toEqual([1, 2, 3]);
  });

  it("maps enumerable object properties to linked refs", () => {
    const symbolKey = Symbol("status");
    const state = reactive({ count: 1, label: "idle", [symbolKey]: "cold" });
    const refs = toRefs(state);

    refs.count.value = 2;
    state.label = "ready";
    refs[symbolKey].value = "warm";

    expect(state.count).toBe(2);
    expect(refs.label.value).toBe("ready");
    expect(state[symbolKey]).toBe("warm");
    expect(unref(refs.count)).toBe(2);
  });

  it("normalizes class values", () => {
    expect(normalizeClass(["base", { active: true, hidden: false }, ["nested"]])).toBe("base active nested");
    expect(normalizeClass({ active: ref(false), ready: ref(true) })).toBe("ready");
  });

  it("normalizes style values", () => {
    expect(normalizeStyle([{ color: "red", fontSize: "12px" }, "display: block"])).toBe("color: red; font-size: 12px; display: block");
    expect(normalizeStyle({ color: ref("blue"), marginTop: null, "--tone": "warm" })).toBe("color: blue; --tone: warm");
  });

  it("sets and removes DOM attributes consistently", () => {
    const element = new Window().document.createElement("button") as unknown as Element;

    setAttribute(element, "disabled", true);
    expect(element.getAttribute("disabled")).toBe("");

    setAttribute(element, "disabled", false);
    expect(element.hasAttribute("disabled")).toBe(false);

    setAttribute(element, "style", { backgroundColor: "red" });
    expect(element.getAttribute("style")).toBe("background-color: red");

    setAttribute(element, "style", null);
    expect(element.hasAttribute("style")).toBe(false);
  });

  it("can force DOM property or attribute bindings", () => {
    const window = new Window();
    const checkbox = window.document.createElement("input");
    checkbox.type = "checkbox";

    setAttribute(checkbox as unknown as Element, "indeterminate", true, { property: true });
    expect(checkbox.indeterminate).toBe(true);
    expect(checkbox.hasAttribute("indeterminate")).toBe(false);

    setAttribute(checkbox as unknown as Element, "indeterminate", true, { attribute: true });
    expect(checkbox.indeterminate).toBe(true);
    expect(checkbox.getAttribute("indeterminate")).toBe("true");

    setAttribute(checkbox as unknown as Element, "indeterminate", null, { property: true });
    expect(checkbox.indeterminate).toBe(false);
    expect(checkbox.hasAttribute("indeterminate")).toBe(false);
  });

  it("runs nextTick callbacks in a microtask", async () => {
    const calls: string[] = [];
    const tick = nextTick(() => calls.push("tick"));

    calls.push("sync");
    await tick;

    expect(calls).toEqual(["sync", "tick"]);
  });

  it("watches refs, getter sources, and source arrays until stopped", () => {
    const count = ref(0);
    const label = ref("idle");
    const calls: Array<{ next: unknown; previous: unknown }> = [];
    const stop = watch<unknown>([count, () => label.value], (next, previous) => {
      calls.push({ next, previous });
    });

    count.value = 1;
    label.value = "active";
    stop();
    count.value = 2;

    expect(calls).toEqual([
      { next: [1, "idle"], previous: [0, "idle"] },
      { next: [1, "active"], previous: [1, "idle"] }
    ]);
  });

  it("supports immediate watch callbacks", () => {
    const count = ref(2);
    const calls: Array<{ next: unknown; previous: unknown }> = [];
    const stop = watch(count, (next, previous) => {
      calls.push({ next, previous });
    }, { immediate: true });

    count.value = 3;
    stop();
    count.value = 4;

    expect(calls).toEqual([
      { next: 2, previous: undefined },
      { next: 3, previous: 2 }
    ]);
  });

  it("supports once watch callbacks", () => {
    const count = ref(0);
    const calls: Array<{ next: unknown; previous: unknown }> = [];
    const stop = watch(count, (next, previous) => {
      calls.push({ next, previous });
    }, { once: true });

    count.value = 1;
    count.value = 2;
    stop();
    count.value = 3;

    expect(calls).toEqual([{ next: 1, previous: 0 }]);
  });

  it("supports immediate once watch callbacks", () => {
    const count = ref(2);
    const calls: Array<{ next: unknown; previous: unknown }> = [];
    const stop = watch(count, (next, previous) => {
      calls.push({ next, previous });
    }, { immediate: true, once: true });

    count.value = 3;
    stop();

    expect(calls).toEqual([{ next: 2, previous: undefined }]);
  });

  it("runs watch cleanup before the next callback and when stopped", () => {
    const count = ref(0);
    const calls: string[] = [];
    const stop = watch(count, (next, previous, onCleanup) => {
      calls.push(`callback:${String(previous)}->${String(next)}`);
      onCleanup(() => {
        calls.push(`cleanup:${String(next)}`);
      });
    }, { immediate: true });

    count.value = 1;
    count.value = 2;
    stop();
    count.value = 3;

    expect(calls).toEqual([
      "callback:undefined->0",
      "cleanup:0",
      "callback:0->1",
      "cleanup:1",
      "callback:1->2",
      "cleanup:2"
    ]);
  });

  it("registers lifecycle callbacks with the current mount registrar", () => {
    const mounted: Array<() => void> = [];
    const activated: Array<() => void> = [];
    const deactivated: Array<() => void> = [];
    const beforeUnmount: Array<() => void> = [];
    const unmounted: Array<() => void> = [];
    const previousRegistrar = (globalThis as { __mikuru_currentRegistrar?: unknown }).__mikuru_currentRegistrar;

    try {
      (globalThis as { __mikuru_currentRegistrar?: unknown }).__mikuru_currentRegistrar = {
        registerMounted(fn: () => void) {
          mounted.push(fn);
        },
        registerActivated(fn: () => void) {
          activated.push(fn);
        },
        registerDeactivated(fn: () => void) {
          deactivated.push(fn);
        },
        registerBeforeUnmount(fn: () => void) {
          beforeUnmount.push(fn);
        },
        registerUnmounted(fn: () => void) {
          unmounted.push(fn);
        }
      };

      onMounted(() => undefined);
      onActivated(() => undefined);
      onDeactivated(() => undefined);
      onBeforeUnmount(() => undefined);
      onUnmounted(() => undefined);

      expect(mounted).toHaveLength(1);
      expect(activated).toHaveLength(1);
      expect(deactivated).toHaveLength(1);
      expect(beforeUnmount).toHaveLength(1);
      expect(unmounted).toHaveLength(1);
    } finally {
      (globalThis as { __mikuru_currentRegistrar?: unknown }).__mikuru_currentRegistrar = previousRegistrar;
    }
  });

  it("provides and injects runtime values with fallbacks", () => {
    const key = Symbol("key");

    expect(inject(key, "fallback")).toBe("fallback");

    provide(key, "provided");

    expect(inject(key, "fallback")).toBe("provided");
  });

  it("uses the current component registrar for scoped provide and inject", () => {
    const key = Symbol("key");
    const parentProvides = new Map<unknown, unknown>([[key, "parent"]]);
    const childProvides = new Map<unknown, unknown>();
    const previousRegistrar = (globalThis as { __mikuru_currentRegistrar?: unknown }).__mikuru_currentRegistrar;

    try {
      (globalThis as { __mikuru_currentRegistrar?: unknown }).__mikuru_currentRegistrar = {
        provide(nextKey: unknown, value: unknown) {
          childProvides.set(nextKey, value);
        },
        inject(nextKey: unknown) {
          if (childProvides.has(nextKey)) {
            return { found: true, value: childProvides.get(nextKey) };
          }

          if (parentProvides.has(nextKey)) {
            return { found: true, value: parentProvides.get(nextKey) };
          }

          return { found: false };
        }
      };

      expect(inject(key, "fallback")).toBe("parent");
      provide(key, "child");
      expect(inject(key, "fallback")).toBe("child");
      expect(inject(Symbol("missing"), "fallback")).toBe("fallback");
    } finally {
      (globalThis as { __mikuru_currentRegistrar?: unknown }).__mikuru_currentRegistrar = previousRegistrar;
    }
  });
});
