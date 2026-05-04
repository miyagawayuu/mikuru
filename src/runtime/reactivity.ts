export type EffectFn = () => void;

export type Ref<T> = {
  value: T;
};

export type ComputedRef<T> = {
  readonly value: T;
};

type Dep = Set<ReactiveEffect>;

type ReactiveEffect = {
  run: EffectFn;
  deps: Set<Dep>;
  active: boolean;
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

export function computed<T>(getter: () => T): ComputedRef<T> {
  const result = ref<T>(getter());

  effect(() => {
    result.value = getter();
  });

  return {
    get value() {
      return result.value;
    }
  };
}

export function effect(fn: EffectFn): () => void {
  const reactiveEffect: ReactiveEffect = {
    run: fn,
    deps: new Set(),
    active: true
  };

  runEffect(reactiveEffect);

  return () => {
    reactiveEffect.active = false;
    cleanupEffect(reactiveEffect);
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
      runEffect(reactiveEffect);
    }
  }
}

function runEffect(reactiveEffect: ReactiveEffect): void {
  cleanupEffect(reactiveEffect);
  effectStack.push(reactiveEffect);
  activeEffect = reactiveEffect;

  try {
    reactiveEffect.run();
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
