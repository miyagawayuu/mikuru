import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";

import {
  computed,
  effect,
  inject,
  nextTick,
  normalizeClass,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  provide,
  ref,
  setAttribute,
  unwrap,
  watch
} from "../src/runtime/index.js";

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

  it("unwraps ref-like values", () => {
    expect(unwrap(ref("mikuru"))).toBe("mikuru");
    expect(unwrap("plain")).toBe("plain");
  });

  it("normalizes class values", () => {
    expect(normalizeClass(["base", { active: true, hidden: false }, ["nested"]])).toBe("base active nested");
    expect(normalizeClass({ active: ref(false), ready: ref(true) })).toBe("ready");
  });

  it("sets and removes DOM attributes consistently", () => {
    const element = new Window().document.createElement("button") as unknown as Element;

    setAttribute(element, "disabled", true);
    expect(element.getAttribute("disabled")).toBe("");

    setAttribute(element, "disabled", false);
    expect(element.hasAttribute("disabled")).toBe(false);
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

  it("registers lifecycle callbacks with the current mount registrar", () => {
    const mounted: Array<() => void> = [];
    const beforeUnmount: Array<() => void> = [];
    const unmounted: Array<() => void> = [];
    const previousRegistrar = (globalThis as { __mikuru_currentRegistrar?: unknown }).__mikuru_currentRegistrar;

    try {
      (globalThis as { __mikuru_currentRegistrar?: unknown }).__mikuru_currentRegistrar = {
        registerMounted(fn: () => void) {
          mounted.push(fn);
        },
        registerBeforeUnmount(fn: () => void) {
          beforeUnmount.push(fn);
        },
        registerUnmounted(fn: () => void) {
          unmounted.push(fn);
        }
      };

      onMounted(() => undefined);
      onBeforeUnmount(() => undefined);
      onUnmounted(() => undefined);

      expect(mounted).toHaveLength(1);
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
});
