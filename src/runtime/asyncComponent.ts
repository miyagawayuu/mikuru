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

type MikuruComponentContext = {
  errorHandler?: (error: unknown) => void;
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

      const reportError = (error: unknown) => {
        if (typeof context?.errorHandler === "function") {
          context.errorHandler(error);
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
                reportError(error);
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
              reportError(error);
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
