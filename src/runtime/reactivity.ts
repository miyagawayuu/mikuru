export type EffectFn = () => void;
export type EffectRunner = () => void;
export type EffectScheduler = (runner: EffectRunner) => void;
export type EffectOptions = {
  scheduler?: EffectScheduler;
};
export type WatchEffectCleanup = () => void;
export type WatchEffectCleanupRegistrar = (cleanup: WatchEffectCleanup) => void;
export type WatchEffectFn = (onCleanup: WatchEffectCleanupRegistrar) => void;

export type Ref<T> = {
  value: T;
};

export type Reactive<T extends object> = T;
export type ReadonlyReactive<T extends object> = Readonly<T>;
export type ToRefs<T extends object> = {
  [K in keyof T]: Ref<T[K]>;
};

export type ComputedRef<T> = {
  readonly value: T;
};

export type WritableComputedOptions<T> = {
  get: () => T;
  set: (value: T) => void;
};

export type WritableComputedRef<T> = {
  value: T;
};

type Dep = Set<ReactiveEffect>;

type ReactiveEffect = {
  fn: EffectFn;
  runner: EffectRunner;
  deps: Set<Dep>;
  active: boolean;
  scheduler?: EffectScheduler;
};

const effectStack: ReactiveEffect[] = [];
let activeEffect: ReactiveEffect | undefined;
const targetDeps = new WeakMap<object, Map<PropertyKey, Dep>>();
const reactiveCache = new WeakMap<object, object>();
const readonlyCache = new WeakMap<object, object>();
const rawTargets = new WeakMap<object, object>();
const reactiveTargets = new WeakSet<object>();
const readonlyTargets = new WeakSet<object>();
const ITERATE_KEY = Symbol("mikuru.iterate");

export function ref<T>(initialValue: T): Ref<T> {
  let currentValue = initialValue;
  const dep: Dep = new Set();

  return {
    get value() {
      track(dep);
      return currentValue;
    },
    set value(nextValue) {
      if (Object.is(currentValue, nextValue)) {
        return;
      }

      currentValue = nextValue;
      trigger(dep);
    }
  };
}

export function reactive<T extends object>(target: T): Reactive<T> {
  return createReactiveProxy(target, false) as Reactive<T>;
}

export function readonly<T extends object>(target: T): ReadonlyReactive<T> {
  return createReactiveProxy(target, true) as ReadonlyReactive<T>;
}

export function isReactive(value: unknown): boolean {
  return typeof value === "object" && value !== null && reactiveTargets.has(value);
}

export function isReadonly(value: unknown): boolean {
  return typeof value === "object" && value !== null && readonlyTargets.has(value);
}

export function isProxy(value: unknown): boolean {
  return isReactive(value) || isReadonly(value);
}

export function toRaw<T>(value: T): T {
  return ((typeof value === "object" && value !== null ? rawTargets.get(value) : undefined) as T | undefined) ?? value;
}

export function computed<T>(getter: () => T): ComputedRef<T>;
export function computed<T>(options: WritableComputedOptions<T>): WritableComputedRef<T>;
export function computed<T>(source: (() => T) | WritableComputedOptions<T>): ComputedRef<T> | WritableComputedRef<T> {
  const getter = typeof source === "function" ? source : source.get;
  const dep: Dep = new Set();
  let value: T;
  let dirty = true;

  const computedEffect = createReactiveEffect(() => {
    value = getter();
    dirty = false;
  }, {
    scheduler: () => {
      if (dirty) {
        return;
      }

      dirty = true;
      trigger(dep);
    }
  });

  if (typeof source === "function") {
    return {
      get value() {
        track(dep);
        if (dirty) {
          runEffect(computedEffect);
        }
        return value!;
      }
    };
  }

  return {
    get value() {
      track(dep);
      if (dirty) {
        runEffect(computedEffect);
      }
      return value!;
    },
    set value(nextValue) {
      source.set(nextValue);
    }
  };
}

export function effect(fn: EffectFn, options: EffectOptions = {}): () => void {
  const reactiveEffect = createReactiveEffect(fn, options);

  runEffect(reactiveEffect);

  return () => {
    reactiveEffect.active = false;
    cleanupEffect(reactiveEffect);
  };
}

function createReactiveEffect(fn: EffectFn, options: EffectOptions = {}): ReactiveEffect {
  const reactiveEffect: ReactiveEffect = {
    fn,
    runner: () => runEffect(reactiveEffect),
    deps: new Set(),
    active: true,
    scheduler: options.scheduler
  };

  return reactiveEffect;
}

export function watchEffect(fn: WatchEffectFn): () => void {
  let cleanup: WatchEffectCleanup | undefined;

  const onCleanup: WatchEffectCleanupRegistrar = (nextCleanup) => {
    cleanup = nextCleanup;
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

  const stopEffect = effect(() => {
    runCleanup();
    fn(onCleanup);
  });

  return () => {
    runCleanup();
    stopEffect();
  };
}

export function unwrap<T>(value: T | Ref<T> | ComputedRef<T>): T {
  if (isRefLike(value)) {
    return value.value;
  }

  return value;
}

export function unref<T>(value: T | Ref<T> | ComputedRef<T>): T {
  return unwrap(value);
}

export function isRef(value: unknown): value is Ref<unknown> | ComputedRef<unknown> {
  return isRefLike(value);
}

export function toRef<T extends object, K extends keyof T>(object: T, key: K): Ref<T[K]> {
  return {
    get value() {
      return object[key];
    },
    set value(nextValue) {
      object[key] = nextValue;
    }
  };
}

export function toRefs<T extends object>(object: T): ToRefs<T> {
  const refs = {} as ToRefs<T>;
  for (const key of Reflect.ownKeys(object) as Array<keyof T>) {
    if (Object.prototype.propertyIsEnumerable.call(object, key)) {
      refs[key] = toRef(object, key);
    }
  }
  return refs;
}

function track(dep: Dep): void {
  if (!activeEffect || !activeEffect.active) {
    return;
  }

  dep.add(activeEffect);
  activeEffect.deps.add(dep);
}

function trackTarget(target: object, key: PropertyKey): void {
  if (!activeEffect || !activeEffect.active) {
    return;
  }

  let deps = targetDeps.get(target);
  if (!deps) {
    deps = new Map();
    targetDeps.set(target, deps);
  }

  let dep = deps.get(key);
  if (!dep) {
    dep = new Set();
    deps.set(key, dep);
  }

  track(dep);
}

function trigger(dep: Dep): void {
  for (const reactiveEffect of [...dep]) {
    if (reactiveEffect.active) {
      if (reactiveEffect.scheduler) {
        reactiveEffect.scheduler(reactiveEffect.runner);
      } else {
        runEffect(reactiveEffect);
      }
    }
  }
}

function triggerTargetKeys(target: object, keys: PropertyKey[]): void {
  const deps = targetDeps.get(target);
  if (!deps) {
    return;
  }

  const effects = new Set<ReactiveEffect>();
  for (const key of keys) {
    for (const reactiveEffect of deps.get(key) ?? []) {
      effects.add(reactiveEffect);
    }
  }

  for (const reactiveEffect of effects) {
    if (reactiveEffect.active) {
      if (reactiveEffect.scheduler) {
        reactiveEffect.scheduler(reactiveEffect.runner);
      } else {
        runEffect(reactiveEffect);
      }
    }
  }
}

function runEffect(reactiveEffect: ReactiveEffect): void {
  if (!reactiveEffect.active) {
    return;
  }

  cleanupEffect(reactiveEffect);
  effectStack.push(reactiveEffect);
  activeEffect = reactiveEffect;

  try {
    reactiveEffect.fn();
  } finally {
    effectStack.pop();
    activeEffect = effectStack.at(-1);
  }
}

function cleanupEffect(reactiveEffect: ReactiveEffect): void {
  for (const dep of reactiveEffect.deps) {
    dep.delete(reactiveEffect);
  }

  reactiveEffect.deps.clear();
}

function isRefLike<T>(value: T | Ref<T> | ComputedRef<T>): value is Ref<T> | ComputedRef<T> {
  return typeof value === "object" && value !== null && "value" in value;
}

function createReactiveProxy<T extends object>(target: T, readonlyMode: boolean): T {
  if ((readonlyMode && isReadonly(target)) || (!readonlyMode && isReactive(target))) {
    return target;
  }

  const rawTarget = toRaw(target);
  const cache = readonlyMode ? readonlyCache : reactiveCache;
  const cached = cache.get(rawTarget);
  if (cached) {
    return cached as T;
  }

  const proxy = new Proxy(rawTarget, {
    get(nextTarget, key, receiver) {
      if (key === "__mikuru_raw") {
        return nextTarget;
      }

      trackTarget(nextTarget, key);
      const value = Reflect.get(nextTarget, key, receiver);
      if (typeof value === "object" && value !== null) {
        return readonlyMode ? readonly(value) : reactive(value);
      }
      return value;
    },
    set(nextTarget, key, value, receiver) {
      if (readonlyMode) {
        return true;
      }

      const oldValue = Reflect.get(nextTarget, key, receiver);
      const hadKey = Object.prototype.hasOwnProperty.call(nextTarget, key);
      const result = Reflect.set(nextTarget, key, value, receiver);

      if (!result || Object.is(oldValue, value)) {
        return result;
      }

      const keys: PropertyKey[] = [key];
      if (!hadKey) {
        keys.push(ITERATE_KEY);
        if (Array.isArray(nextTarget) && isArrayIndex(key)) {
          keys.push("length");
        }
      }
      triggerTargetKeys(nextTarget, keys);
      return result;
    },
    deleteProperty(nextTarget, key) {
      if (readonlyMode) {
        return true;
      }

      const hadKey = Object.prototype.hasOwnProperty.call(nextTarget, key);
      const result = Reflect.deleteProperty(nextTarget, key);
      if (result && hadKey) {
        const keys: PropertyKey[] = [key, ITERATE_KEY];
        if (Array.isArray(nextTarget) && isArrayIndex(key)) {
          keys.push("length");
        }
        triggerTargetKeys(nextTarget, keys);
      }
      return result;
    },
    ownKeys(nextTarget) {
      trackTarget(nextTarget, Array.isArray(nextTarget) ? "length" : ITERATE_KEY);
      return Reflect.ownKeys(nextTarget);
    },
    has(nextTarget, key) {
      trackTarget(nextTarget, key);
      return Reflect.has(nextTarget, key);
    }
  });

  cache.set(rawTarget, proxy);
  rawTargets.set(proxy, rawTarget);
  if (readonlyMode) {
    readonlyTargets.add(proxy);
  } else {
    reactiveTargets.add(proxy);
  }

  return proxy as T;
}

function isArrayIndex(key: PropertyKey): boolean {
  if (typeof key === "symbol") {
    return false;
  }
  const value = typeof key === "number" ? key : Number(key);
  return Number.isInteger(value) && value >= 0;
}
