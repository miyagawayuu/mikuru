import { effect } from "./reactivity.js";

export type WatchSource<T = unknown> = (() => T) | { value: T } | T;
export type WatchOptions = {
  immediate?: boolean;
  once?: boolean;
};
export type WatchCleanup = () => void;
export type WatchCleanupRegistrar = (cleanup: WatchCleanup) => void;
export type WatchCallback<T = unknown> = (
  newV: T | unknown,
  oldV: T | unknown,
  onCleanup: WatchCleanupRegistrar
) => void;
type InjectionLookup =
  | { found: true; value: unknown }
  | { found: false };

type MikuruRuntimeRegistrar = {
  registerMounted?: (fn: () => void) => void;
  registerActivated?: (fn: () => void) => void;
  registerDeactivated?: (fn: () => void) => void;
  registerBeforeUnmount?: (fn: () => void) => void;
  registerUnmounted?: (fn: () => void) => void;
  provide?: (key: any, value: unknown) => void;
  inject?: (key: any) => InjectionLookup;
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
  cb: WatchCallback<T>,
  options: WatchOptions = {}
): () => void {
  const sources = Array.isArray(source) ? source : [source as WatchSource<T>];

  let oldVals: unknown[] = sources.map((s) => (isRefLike(s) ? (s as any).value : typeof s === "function" ? (s as any)() : s));
  let stopped = false;
  let cleanup: WatchCleanup | undefined;

  const onCleanup: WatchCleanupRegistrar = (fn) => {
    cleanup = fn;
  };

  const runCleanup = () => {
    if (!cleanup) return;
    const fn = cleanup;
    cleanup = undefined;
    try {
      fn();
    } catch (e) {
      setTimeout(() => { throw e; });
    }
  };

  const runCallback = (next: unknown, previous: unknown) => {
    runCleanup();
    try {
      cb(next as any, previous as any, onCleanup);
    } catch (e) {
      setTimeout(() => { throw e; });
    }
  };

  let stopEffect: (() => void) | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    runCleanup();
    stopEffect?.();
  };

  if (options.immediate) {
    const curr = oldVals.length === 1 ? oldVals[0] : oldVals.slice();
    runCallback(curr, undefined);
    if (options.once) {
      stop();
      return stop;
    }
  }

  stopEffect = effect(() => {
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
      runCallback(curr, prev);
      if (options.once) {
        stop();
      }
    }
  });

  return stop;
}

export function onMounted(fn: () => void): void {
  const reg = (globalThis as { __mikuru_currentRegistrar?: MikuruRuntimeRegistrar }).__mikuru_currentRegistrar;
  if (reg && typeof reg.registerMounted === "function") {
    reg.registerMounted(fn);
  } else {
    // best-effort: call on nextTick if not in a mount context
    nextTick(fn);
  }
}

export function onActivated(fn: () => void): void {
  const reg = (globalThis as { __mikuru_currentRegistrar?: MikuruRuntimeRegistrar }).__mikuru_currentRegistrar;
  if (reg && typeof reg.registerActivated === "function") {
    reg.registerActivated(fn);
  }
}

export function onDeactivated(fn: () => void): void {
  const reg = (globalThis as { __mikuru_currentRegistrar?: MikuruRuntimeRegistrar }).__mikuru_currentRegistrar;
  if (reg && typeof reg.registerDeactivated === "function") {
    reg.registerDeactivated(fn);
  }
}

export function onBeforeUnmount(fn: () => void): void {
  const reg = (globalThis as { __mikuru_currentRegistrar?: MikuruRuntimeRegistrar }).__mikuru_currentRegistrar;
  if (reg && typeof reg.registerBeforeUnmount === "function") {
    reg.registerBeforeUnmount(fn);
  }
}

export function onUnmounted(fn: () => void): void {
  const reg = (globalThis as { __mikuru_currentRegistrar?: MikuruRuntimeRegistrar }).__mikuru_currentRegistrar;
  if (reg && typeof reg.registerUnmounted === "function") {
    reg.registerUnmounted(fn);
  }
}

const __mikuru_fallback_provide_map = new Map<any, any>();
export function provide<T = unknown>(key: any, value: T): void {
  const reg = (globalThis as { __mikuru_currentRegistrar?: MikuruRuntimeRegistrar }).__mikuru_currentRegistrar;
  if (reg && typeof reg.provide === "function") {
    reg.provide(key, value);
    return;
  }

  __mikuru_fallback_provide_map.set(key, value);
}

export function inject<T = unknown>(key: any, fallback?: T): T | undefined {
  const reg = (globalThis as { __mikuru_currentRegistrar?: MikuruRuntimeRegistrar }).__mikuru_currentRegistrar;
  if (reg && typeof reg.inject === "function") {
    const result = reg.inject(key);
    if (result.found) return result.value as T;
  }

  if (__mikuru_fallback_provide_map.has(key)) return __mikuru_fallback_provide_map.get(key);
  return fallback;
}
