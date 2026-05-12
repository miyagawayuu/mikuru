export type MikuruDebugEvent = {
  type: string;
  timestamp: number;
  payload?: Record<string, unknown>;
};

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
  nextId?: number;
  registerComponent?(metadata: MikuruDebugComponentMetadata): void | (() => void);
  emit?(event: MikuruDebugEvent): void;
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

  return {
    id,
    metadata: fullMetadata,
    update(nextMetadata) {
      Object.assign(fullMetadata, nextMetadata);
    },
    unregister() {
      fullMetadata.unmountedAt = Date.now();
      parent?.children?.delete(id);
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

  if (typeof hook.emit === "function") {
    hook.emit(event);
    return;
  }

  hook.events ??= [];
  hook.events.push(event);
}

function getOrCreateDevtoolsHook(): MikuruDevtoolsHook {
  const root = globalThis as typeof globalThis & { __MIKURU_DEVTOOLS__?: MikuruDevtoolsHook };
  root.__MIKURU_DEVTOOLS__ ??= { components: new Map(), events: [], nextId: 1 };
  root.__MIKURU_DEVTOOLS__.components ??= new Map();
  root.__MIKURU_DEVTOOLS__.events ??= [];
  root.__MIKURU_DEVTOOLS__.nextId ??= 1;
  return root.__MIKURU_DEVTOOLS__;
}

function readDevtoolsHook(): MikuruDevtoolsHook | undefined {
  return (globalThis as typeof globalThis & { __MIKURU_DEVTOOLS__?: MikuruDevtoolsHook }).__MIKURU_DEVTOOLS__;
}
