export { normalizeClass, normalizeStyle, setAttribute } from "./dom.js";
export type { ClassValue, StyleValue } from "./dom.js";
export { defineAsyncComponent } from "./asyncComponent.js";
export type {
  AsyncComponentLoader,
  AsyncComponentOptions,
  MikuruAsyncBoundaryFallbackProps,
  MikuruComponent,
  MikuruComponentInstance,
  MikuruErrorBoundaryFallbackProps,
  MikuruErrorInfo,
  MikuruErrorPhase
} from "./asyncComponent.js";
export { computed, effect, ref, unwrap } from "./reactivity.js";
export type { ComputedRef, EffectFn, Ref } from "./reactivity.js";
export { nextTick, watch, onMounted, onBeforeUnmount, onUnmounted, provide, inject } from "./lifecycle.js";
export type { WatchCallback, WatchCleanup, WatchCleanupRegistrar, WatchOptions, WatchSource } from "./lifecycle.js";
