export type MikuruComponentInstance = {
  element: Element | Comment;
  unmount(): void;
};

export type MikuruComponent = {
  mount(target: Element | DocumentFragment, props?: Record<string, unknown>): MikuruComponentInstance;
  inheritAttrs?: boolean;
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
  errorHandler?: (error: unknown, errorInfo?: MikuruErrorInfo) => void;
  asyncBoundary?: MikuruAsyncBoundary;
};

export function defineAsyncComponent(loaderOrOptions: AsyncComponentLoader | AsyncComponentOptions): MikuruComponent {
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
    mount(target, props = {}) {
      const context = props.__mikuru_context as MikuruComponentContext | undefined;
      const ownerDocument = target.ownerDocument ?? globalThis.document;
      const start = ownerDocument.createComment("async-component");
      const end = ownerDocument.createComment("/async-component");
      let child: MikuruComponentInstance | undefined;
      let cancelled = false;
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
            clear();
            render(component, props);
          },
          (error) => {
            if (cancelled || currentToken !== token) {
              return;
            }

            clearTimers();
            renderFallback(options.errorComponent, { ...props, error, retry: () => startLoad() });

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
