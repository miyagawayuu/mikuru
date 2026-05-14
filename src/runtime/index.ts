export { normalizeClass, normalizeStyle, setAttribute } from "./dom.js";
export type { ClassValue, StyleValue } from "./dom.js";
export { createDebugDiagnostic, createDebugInspector, createDevtoolsInspector, emitDebugDiagnostic, emitDebugEvent, registerDebugComponent } from "./devtools.js";
export type {
  MikuruDebugDiagnostic,
  MikuruDebugDiagnosticLevel,
  MikuruDebugDiagnosticSource,
  MikuruDebugComponentMetadata,
  MikuruDebugEvent,
  MikuruDebugInspector,
  MikuruDebugListener,
  MikuruDevtoolsEvent,
  MikuruDevtoolsHook,
  MikuruDevtoolsInspector,
  MikuruDevtoolsListener,
  MikuruDevtoolsSnapshot
} from "./devtools.js";
export { defineAsyncComponent } from "./asyncComponent.js";
export type {
  AsyncComponentLoader,
  AsyncComponentOptions,
  MikuruAsyncComponent,
  MikuruAsyncBoundaryFallbackProps,
  MikuruComponent,
  MikuruComponentInstance,
  MikuruErrorBoundaryFallbackProps,
  MikuruErrorInfo,
  MikuruErrorPhase
} from "./asyncComponent.js";
export { computed, effect, isProxy, isReactive, isReadonly, isRef, reactive, readonly, ref, toRaw, toRef, toRefs, unref, unwrap, watchEffect } from "./reactivity.js";
export type {
  ComputedRef,
  EffectFn,
  EffectOptions,
  EffectRunner,
  EffectScheduler,
  Reactive,
  ReadonlyReactive,
  Ref,
  ToRefs,
  WatchEffectCleanup,
  WatchEffectCleanupRegistrar,
  WatchEffectFn,
  WritableComputedOptions,
  WritableComputedRef
} from "./reactivity.js";
export {
  flushJobs,
  inject,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  onUnmounted,
  provide,
  queueJob,
  watch
} from "./lifecycle.js";
export type { SchedulerJob, WatchCallback, WatchCleanup, WatchCleanupRegistrar, WatchOptions, WatchSource } from "./lifecycle.js";
