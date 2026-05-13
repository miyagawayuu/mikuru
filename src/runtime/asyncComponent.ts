import { emitDebugEvent } from "./devtools.js";

export type MikuruComponentInstance = {
  element: Element | Comment;
  activate?: () => void;
  deactivate?: () => void;
  unmount(): void;
};

export type MikuruComponent = {
  mount(target: Element | DocumentFragment, props?: Record<string, unknown>): MikuruComponentInstance;
  hydrate?: (target: Element, props?: Record<string, unknown>) => MikuruComponentInstance | Promise<MikuruComponentInstance>;
  renderToString?: (props?: Record<string, unknown>) => string | Promise<string>;
  inheritAttrs?: boolean;
};

export type MikuruAsyncComponent = MikuruComponent & {
  renderToString: (props?: Record<string, unknown>) => string | Promise<string>;
};

export type AsyncComponentLoader = () => Promise<MikuruComponent | { default: MikuruComponent }>;

export type AsyncComponentOptions = {
  loader: AsyncComponentLoader;
  loadingComponent?: MikuruComponent;
  errorComponent?: MikuruComponent;
  delay?: number;
  timeout?: number;
};

export type MikuruErrorPhase =
  | "runtime"
  | "mount"
  | "event"
  | "emit"
  | "mounted"
  | "activated"
  | "deactivated"
  | "cleanup"
  | "unmounted"
  | "async-loader"
  | "async-timeout";

export type MikuruErrorInfo = {
  component?: string;
  filename?: string;
  phase?: MikuruErrorPhase;
  boundary?: {
    component?: string;
    filename?: string;
  };
};

export type MikuruErrorBoundaryFallbackProps = {
  error: unknown;
  errorInfo?: MikuruErrorInfo;
  retry: () => void;
  reset: () => void;
};

export type MikuruAsyncBoundaryFallbackProps = {
  error?: unknown;
  errors?: unknown[];
  errorInfo?: MikuruErrorInfo;
  pending: number;
  retry: () => void;
  reset: () => void;
};

type MikuruAsyncBoundaryEntry = {
  resolve(): void;
  reject(error: unknown, errorInfo?: MikuruErrorInfo): void;
};

type MikuruAsyncBoundary = {
  start(options: { retry: () => void }): MikuruAsyncBoundaryEntry;
};

type MikuruComponentContext = {
  component?: string;
  filename?: string;
  debugId?: number;
  errorHandler?: (error: unknown, errorInfo?: MikuruErrorInfo) => void;
  asyncBoundary?: MikuruAsyncBoundary;
};

export function defineAsyncComponent(loaderOrOptions: AsyncComponentLoader | AsyncComponentOptions): MikuruAsyncComponent {
  const options = typeof loaderOrOptions === "function" ? { loader: loaderOrOptions } : loaderOrOptions;
  let pending: Promise<MikuruComponent> | undefined;
  let resolved: MikuruComponent | undefined;

  const load = () => {
    if (resolved) {
      return Promise.resolve(resolved);
    }

    pending ??= options.loader().then(
      (result) => {
        resolved = "default" in result ? result.default : result;
        return resolved;
      },
      (error) => {
        pending = undefined;
        throw error;
      }
    );

    return pending;
  };

  return {
    async renderToString(props = {}) {
      const context = props.__mikuru_context as MikuruComponentContext | undefined;
      const timeout = options.timeout && options.timeout > 0
        ? new Promise<MikuruComponent>((_, reject) => {
          setTimeout(() => reject(new Error("Async component timed out")), options.timeout);
        })
        : undefined;

      try {
        const component = await (timeout ? Promise.race([load(), timeout]) : load());
        if (typeof component.renderToString !== "function") {
          throw new TypeError("Async component resolved component does not expose renderToString()");
        }
        return component.renderToString(props);
      } catch (error) {
        if (options.errorComponent?.renderToString) {
          return options.errorComponent.renderToString({
            ...props,
            error,
            errorInfo: {
              component: context?.component,
              filename: context?.filename,
              phase: error instanceof Error && error.message === "Async component timed out" ? "async-timeout" : "async-loader"
            },
            retry: () => {}
          });
        }

        throw error;
      }
    },

    hydrate(target, props = {}) {
      const context = props.__mikuru_context as MikuruComponentContext | undefined;
      let child: MikuruComponentInstance | undefined;
      let cancelled = false;
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      let token = 0;

      const clearTimer = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = undefined;
        }
      };

      const reportHydrationError = (error: unknown, phase: MikuruErrorPhase) => {
        if (typeof context?.errorHandler === "function") {
          context.errorHandler(error, { component: context.component, filename: context.filename, phase });
          return;
        }

        setTimeout(() => { throw error; });
      };

      const replaceWithMount = (component: MikuruComponent, nextProps: Record<string, unknown>) => {
        const parent = target.parentNode;
        if (!parent) {
          return;
        }

        const anchor = (target.ownerDocument ?? globalThis.document).createComment("async-hydrate-component");
        const fragment = (target.ownerDocument ?? globalThis.document).createDocumentFragment();
        parent.insertBefore(anchor, target);
        target.remove();
        child = component.mount(fragment, nextProps);
        parent.insertBefore(fragment, anchor);
        anchor.remove();
      };

      const applyResolved = (component: MikuruComponent, currentToken: number) => {
        if (cancelled || currentToken !== token) {
          return;
        }

        clearTimer();

        if (typeof component.hydrate === "function") {
          Promise.resolve(component.hydrate(target, props)).then(
            (instance) => {
              if (cancelled || currentToken !== token) {
                instance.unmount();
                return;
              }
              child = instance;
            },
            (error) => reportHydrationError(error, "async-loader")
          );
          return;
        }

        replaceWithMount(component, props);
      };

      const renderError = (error: unknown, phase: MikuruErrorPhase) => {
        if (cancelled) {
          return;
        }

        clearTimer();

        const errorInfo = { component: context?.component, filename: context?.filename, phase };
        if (options.errorComponent) {
          replaceWithMount(options.errorComponent, { ...props, error, errorInfo, retry: () => startHydration() });
          return;
        }

        reportHydrationError(error, phase);
      };

      const startHydration = () => {
        const currentToken = ++token;
        clearTimer();

        if (options.timeout && options.timeout > 0) {
          timeoutTimer = setTimeout(() => {
            if (cancelled || currentToken !== token) {
              return;
            }

            pending = undefined;
            token += 1;
            renderError(new Error("Async component timed out"), "async-timeout");
          }, options.timeout);
        }

        load().then(
          (component) => applyResolved(component, currentToken),
          (error) => renderError(error, "async-loader")
        );
      };

      startHydration();

      return {
        element: target,
        unmount() {
          cancelled = true;
          token += 1;
          clearTimer();
          child?.unmount();
        }
      };
    },

    mount(target, props = {}) {
      const context = props.__mikuru_context as MikuruComponentContext | undefined;
      const ownerDocument = target.ownerDocument ?? globalThis.document;
      const start = ownerDocument.createComment("async-component");
      const end = ownerDocument.createComment("/async-component");
      let child: MikuruComponentInstance | undefined;
      let cancelled = false;
      let active = false;
      let token = 0;
      let delayTimer: ReturnType<typeof setTimeout> | undefined;
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

      target.appendChild(start);
      target.appendChild(end);

      const clear = () => {
        child?.unmount();
        child = undefined;
        removeBetween(start, end);
      };

      const render = (component: MikuruComponent, nextProps: Record<string, unknown>) => {
        const fragment = ownerDocument.createDocumentFragment();
        child = component.mount(fragment, nextProps);
        end.parentNode?.insertBefore(fragment, end);
        if (active) {
          child.activate?.();
        }
      };

      const renderFallback = (component: MikuruComponent | undefined, nextProps: Record<string, unknown>) => {
        clear();
        if (component) {
          render(component, nextProps);
        }
      };

      const reportError = (error: unknown, phase: MikuruErrorPhase) => {
        if (typeof context?.errorHandler === "function") {
          context.errorHandler(error, { component: context.component, filename: context.filename, phase });
          return;
        }

        setTimeout(() => { throw error; });
      };

      const clearTimers = () => {
        if (delayTimer) {
          clearTimeout(delayTimer);
          delayTimer = undefined;
        }

        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = undefined;
        }
      };

      const startLoad = () => {
        const currentToken = ++token;
        const boundaryEntry = resolved ? undefined : context?.asyncBoundary?.start({ retry: () => startLoad() });
        clearTimers();
        emitDebugEvent("async:pending", {
          component: context ? { component: context.component, filename: context.filename } : undefined,
          componentId: context?.debugId,
          hasBoundary: Boolean(boundaryEntry),
          cached: Boolean(resolved)
        });

        if (options.loadingComponent && (options.delay ?? 0) <= 0) {
          renderFallback(options.loadingComponent, props);
        } else if (options.loadingComponent) {
          delayTimer = setTimeout(() => {
            if (!cancelled && currentToken === token && !child) {
              renderFallback(options.loadingComponent, props);
            }
          }, options.delay);
        }

        if (options.timeout && options.timeout > 0) {
          timeoutTimer = setTimeout(() => {
            if (!cancelled && currentToken === token && !resolved) {
              token += 1;
              clearTimers();
              pending = undefined;
              const error = new Error("Async component timed out");
              renderFallback(options.errorComponent, { ...props, error, retry: () => startLoad() });
              emitDebugEvent("async:rejected", {
                component: context ? { component: context.component, filename: context.filename } : undefined,
                componentId: context?.debugId,
                hasBoundary: Boolean(boundaryEntry),
                error,
                errorInfo: { component: context?.component, filename: context?.filename, phase: "async-timeout" }
              });
              if (!options.errorComponent) {
                boundaryEntry?.reject(error, { component: context?.component, filename: context?.filename, phase: "async-timeout" });
                if (!boundaryEntry) {
                  reportError(error, "async-timeout");
                }
              } else {
                boundaryEntry?.resolve();
              }
            }
          }, options.timeout);
        }

        const promise = load();
        promise.then(
          (component) => {
            if (cancelled || currentToken !== token) {
              return;
            }

            clearTimers();
            boundaryEntry?.resolve();
            emitDebugEvent("async:resolved", {
              component: context ? { component: context.component, filename: context.filename } : undefined,
              componentId: context?.debugId,
              hasBoundary: Boolean(boundaryEntry)
            });
            clear();
            render(component, props);
          },
          (error) => {
            if (cancelled || currentToken !== token) {
              return;
            }

            clearTimers();
            renderFallback(options.errorComponent, { ...props, error, retry: () => startLoad() });
            emitDebugEvent("async:rejected", {
              component: context ? { component: context.component, filename: context.filename } : undefined,
              componentId: context?.debugId,
              hasBoundary: Boolean(boundaryEntry),
              error,
              errorInfo: { component: context?.component, filename: context?.filename, phase: "async-loader" }
            });

            if (!options.errorComponent) {
              boundaryEntry?.reject(error, { component: context?.component, filename: context?.filename, phase: "async-loader" });
              if (!boundaryEntry) {
                reportError(error, "async-loader");
              }
            } else {
              boundaryEntry?.resolve();
            }
          }
        );

        return promise;
      };

      void startLoad();

      return {
        element: start,
        activate() {
          active = true;
          child?.activate?.();
        },
        deactivate() {
          active = false;
          child?.deactivate?.();
        },
        unmount() {
          cancelled = true;
          clearTimers();
          clear();
          start.remove();
          end.remove();
        }
      };
    }
  };
}

function removeBetween(start: Comment, end: Comment): void {
  let current = start.nextSibling;

  while (current && current !== end) {
    const next = current.nextSibling;
    current.remove();
    current = next;
  }
}
