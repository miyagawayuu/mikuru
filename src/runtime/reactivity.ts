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
  deps: Set<Dep>;
  active: boolean;
  scheduler?: EffectScheduler;
};

const effectStack: ReactiveEffect[] = [];
let activeEffect: ReactiveEffect | undefined;

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

export function computed<T>(getter: () => T): ComputedRef<T>;
export function computed<T>(options: WritableComputedOptions<T>): WritableComputedRef<T>;
export function computed<T>(source: (() => T) | WritableComputedOptions<T>): ComputedRef<T> | WritableComputedRef<T> {
  const getter = typeof source === "function" ? source : source.get;
  const result = ref<T>(getter());

  effect(() => {
    result.value = getter();
  });

  if (typeof source === "function") {
    return {
      get value() {
        return result.value;
      }
    };
  }

  return {
    get value() {
      return result.value;
    },
    set value(nextValue) {
      source.set(nextValue);
    }
  };
}

export function effect(fn: EffectFn, options: EffectOptions = {}): () => void {
  const reactiveEffect: ReactiveEffect = {
    fn,
    deps: new Set(),
    active: true,
    scheduler: options.scheduler
  };

  runEffect(reactiveEffect);

  return () => {
    reactiveEffect.active = false;
    cleanupEffect(reactiveEffect);
  };
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

function track(dep: Dep): void {
  if (!activeEffect || !activeEffect.active) {
    return;
  }

  dep.add(activeEffect);
  activeEffect.deps.add(dep);
}

function trigger(dep: Dep): void {
  for (const reactiveEffect of [...dep]) {
    if (reactiveEffect.active) {
      if (reactiveEffect.scheduler) {
        reactiveEffect.scheduler(() => runEffect(reactiveEffect));
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
