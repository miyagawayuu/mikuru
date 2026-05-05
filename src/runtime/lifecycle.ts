import { effect } from "./reactivity.js";

export type WatchSource<T = unknown> = (() => T) | { value: T } | T;
export type WatchOptions = {
  immediate?: boolean;
};

export function nextTick(fn?: () => void): Promise<void> {
  const p = Promise.resolve().then(() => {
    try {
      fn?.();
    } catch (e) {
      setTimeout(() => { throw e; });
    }
  });
  return p;
}

function isRefLike(value: unknown): value is { value: unknown } {
  return typeof value === "object" && value !== null && "value" in value;
}

export function watch<T = unknown>(
  source: WatchSource<T> | WatchSource<T>[],
  cb: (newV: T | unknown, oldV: T | unknown) => void,
  options: WatchOptions = {}
): () => void {
  const sources = Array.isArray(source) ? source : [source as WatchSource<T>];

  let oldVals: unknown[] = sources.map((s) => (isRefLike(s) ? (s as any).value : typeof s === "function" ? (s as any)() : s));
  let stopped = false;

  if (options.immediate) {
    const curr = oldVals.length === 1 ? oldVals[0] : oldVals.slice();
    try {
      cb(curr as any, undefined);
    } catch (e) {
      setTimeout(() => { throw e; });
    }
  }

  const stopEffect = effect(() => {
    if (stopped) return;
    const nextVals = sources.map((s) => (isRefLike(s) ? (s as any).value : typeof s === "function" ? (s as any)() : s));
    let changed = false;
    for (let i = 0; i < nextVals.length; i++) {
      if (!Object.is(nextVals[i], oldVals[i])) {
        changed = true;
        break;
      }
    }
    if (changed) {
      const prev = oldVals.length === 1 ? oldVals[0] : oldVals.slice();
      const curr = nextVals.length === 1 ? nextVals[0] : nextVals.slice();
      oldVals = nextVals;
      try {
        cb(curr as any, prev as any);
      } catch (e) {
        setTimeout(() => { throw e; });
      }
    }
  });

  return () => {
    stopped = true;
    stopEffect();
  };
}

export function onMounted(fn: () => void): void {
  const reg = (globalThis as any).__mikuru_currentRegistrar;
  if (reg && typeof reg.registerMounted === "function") {
    reg.registerMounted(fn);
  } else {
    // best-effort: call on nextTick if not in a mount context
    nextTick(fn);
  }
}

export function onBeforeUnmount(fn: () => void): void {
  const reg = (globalThis as any).__mikuru_currentRegistrar;
  if (reg && typeof reg.registerBeforeUnmount === "function") {
    reg.registerBeforeUnmount(fn);
  }
}

export function onUnmounted(fn: () => void): void {
  const reg = (globalThis as any).__mikuru_currentRegistrar;
  if (reg && typeof reg.registerUnmounted === "function") {
    reg.registerUnmounted(fn);
  }
}

const __mikuru_provide_map = new Map<any, any>();
export function provide<T = unknown>(key: any, value: T): void {
  __mikuru_provide_map.set(key, value);
}

export function inject<T = unknown>(key: any, fallback?: T): T | undefined {
  if (__mikuru_provide_map.has(key)) return __mikuru_provide_map.get(key);
  return fallback;
}
