export type MikuruDebugEvent = {
  type: string;
  timestamp: number;
  payload?: Record<string, unknown>;
};

export type MikuruDebugDiagnosticLevel = "info" | "warning" | "error";

export type MikuruDebugDiagnosticSource = "compiler" | "runtime" | "router" | "ssr" | "hydration" | string;

export type MikuruDebugDiagnostic = {
  source: MikuruDebugDiagnosticSource;
  level: MikuruDebugDiagnosticLevel;
  message: string;
  phase?: string;
  filename?: string;
  component?: unknown;
  error?: unknown;
  errorName?: string;
  errorMessage?: string;
  [key: string]: unknown;
};

export type MikuruDebugListener = (event: MikuruDebugEvent) => void;

export type MikuruDebugComponentMetadata = {
  id: number;
  name?: string;
  filename?: string;
  root?: Element | Comment;
  parentId?: number;
  props?: Record<string, unknown>;
  propKeys?: string[];
  attrs?: Record<string, unknown>;
  attrKeys?: string[];
  children?: Set<number>;
  mountedAt: number;
  unmountedAt?: number;
};

export type MikuruDebugComponentRegistration = {
  id: number;
  metadata: MikuruDebugComponentMetadata;
  update(metadata: Partial<MikuruDebugComponentMetadata>): void;
  unregister(): void;
};

export type MikuruDevtoolsHook = {
  components?: Map<number, MikuruDebugComponentMetadata>;
  events?: MikuruDebugEvent[];
  listeners?: Set<MikuruDebugListener>;
  nextId?: number;
  registerComponent?(metadata: MikuruDebugComponentMetadata): void | (() => void);
  emit?(event: MikuruDebugEvent): void;
};

export type MikuruDebugInspector = {
  hook: MikuruDevtoolsHook;
  getComponents(): MikuruDebugComponentMetadata[];
  getEvents(): MikuruDebugEvent[];
  clearEvents(): void;
  subscribe(listener: MikuruDebugListener): () => void;
};

declare global {
  var __MIKURU_DEVTOOLS__: MikuruDevtoolsHook | undefined;
}

export function registerDebugComponent(
  metadata: Omit<MikuruDebugComponentMetadata, "id" | "mountedAt" | "children"> & {
    id?: number;
    mountedAt?: number;
    children?: Set<number>;
  }
): MikuruDebugComponentRegistration {
  const hook = getOrCreateDevtoolsHook();
  const id = metadata.id ?? hook.nextId ?? 1;
  hook.nextId = Math.max(hook.nextId ?? 1, id + 1);

  const fullMetadata: MikuruDebugComponentMetadata = {
    ...metadata,
    id,
    mountedAt: metadata.mountedAt ?? Date.now(),
    children: metadata.children ?? new Set()
  };
  hook.components ??= new Map();
  hook.components.set(id, fullMetadata);

  const parent = fullMetadata.parentId === undefined ? undefined : hook.components.get(fullMetadata.parentId);
  parent?.children?.add(id);

  const customUnregister =
    typeof hook.registerComponent === "function" ? hook.registerComponent(fullMetadata) : undefined;
  dispatchDebugEvent(hook, {
    type: "component:register",
    timestamp: Date.now(),
    payload: { componentId: id, component: fullMetadata }
  });

  return {
    id,
    metadata: fullMetadata,
    update(nextMetadata) {
      Object.assign(fullMetadata, nextMetadata);
      dispatchDebugEvent(hook, {
        type: "component:update",
        timestamp: Date.now(),
        payload: { componentId: id, component: fullMetadata, updates: nextMetadata }
      });
    },
    unregister() {
      fullMetadata.unmountedAt = Date.now();
      parent?.children?.delete(id);
      dispatchDebugEvent(hook, {
        type: "component:unregister",
        timestamp: Date.now(),
        payload: { componentId: id, component: fullMetadata }
      });
      if (typeof customUnregister === "function") {
        customUnregister();
      }
      hook.components?.delete(id);
    }
  };
}

export function emitDebugEvent(type: string, payload?: Record<string, unknown>): void {
  const hook = readDevtoolsHook();
  if (!hook) {
    return;
  }

  const event: MikuruDebugEvent = {
    type,
    timestamp: Date.now(),
    payload
  };

  dispatchDebugEvent(hook, event);
}

export function createDebugDiagnostic(
  source: MikuruDebugDiagnosticSource,
  level: MikuruDebugDiagnosticLevel,
  message: string,
  details: Omit<MikuruDebugDiagnostic, "source" | "level" | "message"> = {}
): MikuruDebugDiagnostic {
  const diagnostic: MikuruDebugDiagnostic = {
    ...details,
    source,
    level,
    message
  };

  if (details.error instanceof Error) {
    diagnostic.errorName = details.error.name;
    diagnostic.errorMessage = details.error.message;
  } else if (details.error !== undefined) {
    diagnostic.errorMessage = String(details.error);
  }

  return diagnostic;
}

export function emitDebugDiagnostic(
  source: MikuruDebugDiagnosticSource,
  level: MikuruDebugDiagnosticLevel,
  message: string,
  details: Omit<MikuruDebugDiagnostic, "source" | "level" | "message"> = {}
): MikuruDebugDiagnostic {
  const diagnostic = createDebugDiagnostic(source, level, message, details);
  emitDebugEvent(`${source}:${level}`, { diagnostic });
  return diagnostic;
}

export function createDebugInspector(hook = getOrCreateDevtoolsHook()): MikuruDebugInspector {
  ensureDevtoolsStorage(hook);

  return {
    hook,
    getComponents() {
      return Array.from(hook.components?.values() ?? []);
    },
    getEvents() {
      return [...(hook.events ?? [])];
    },
    clearEvents() {
      if (hook.events) {
        hook.events.length = 0;
      }
    },
    subscribe(listener) {
      hook.listeners ??= new Set();
      hook.listeners.add(listener);
      return () => hook.listeners?.delete(listener);
    }
  };
}

function getOrCreateDevtoolsHook(): MikuruDevtoolsHook {
  const root = globalThis as typeof globalThis & { __MIKURU_DEVTOOLS__?: MikuruDevtoolsHook };
  root.__MIKURU_DEVTOOLS__ ??= { components: new Map(), events: [], nextId: 1 };
  ensureDevtoolsStorage(root.__MIKURU_DEVTOOLS__);
  return root.__MIKURU_DEVTOOLS__;
}

function readDevtoolsHook(): MikuruDevtoolsHook | undefined {
  return (globalThis as typeof globalThis & { __MIKURU_DEVTOOLS__?: MikuruDevtoolsHook }).__MIKURU_DEVTOOLS__;
}

function ensureDevtoolsStorage(hook: MikuruDevtoolsHook): void {
  hook.components ??= new Map();
  hook.events ??= [];
  hook.listeners ??= new Set();
  hook.nextId ??= 1;
}

function dispatchDebugEvent(hook: MikuruDevtoolsHook, event: MikuruDebugEvent): void {
  hook.events ??= [];
  hook.events.push(event);

  if (typeof hook.emit === "function") {
    hook.emit(event);
  }

  for (const listener of hook.listeners ?? []) {
    try {
      listener(event);
    } catch (error) {
      setTimeout(() => {
        throw error;
      });
    }
  }
}
