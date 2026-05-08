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

export function defineAsyncComponent(loaderOrOptions: AsyncComponentLoader | AsyncComponentOptions): MikuruComponent {
  const options = typeof loaderOrOptions === "function" ? { loader: loaderOrOptions } : loaderOrOptions;
  let pending: Promise<MikuruComponent> | undefined;
  let resolved: MikuruComponent | undefined;

  const load = () => {
    if (resolved) {
      return Promise.resolve(resolved);
    }

    pending ??= options.loader().then((result) => {
      resolved = "default" in result ? result.default : result;
      return resolved;
    });

    return pending;
  };

  return {
    mount(target, props = {}) {
      const ownerDocument = target.ownerDocument ?? globalThis.document;
      const start = ownerDocument.createComment("async-component");
      const end = ownerDocument.createComment("/async-component");
      let child: MikuruComponentInstance | undefined;
      let cancelled = false;
      let token = 0;

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

      const currentToken = ++token;
      let delayTimer: ReturnType<typeof setTimeout> | undefined;

      if (options.loadingComponent && (options.delay ?? 0) <= 0) {
        renderFallback(options.loadingComponent, props);
      } else if (options.loadingComponent) {
        delayTimer = setTimeout(() => {
          if (!cancelled && currentToken === token && !child) {
            renderFallback(options.loadingComponent, props);
          }
        }, options.delay);
      }
      const timeoutTimer =
        options.timeout && options.timeout > 0
          ? setTimeout(() => {
              if (!cancelled && currentToken === token && !resolved) {
                renderFallback(options.errorComponent, { ...props, error: new Error("Async component timed out"), retry: load });
              }
            }, options.timeout)
          : undefined;

      load().then(
        (component) => {
          if (cancelled || currentToken !== token) {
            return;
          }

          if (delayTimer) {
            clearTimeout(delayTimer);
          }

          if (timeoutTimer) {
            clearTimeout(timeoutTimer);
          }

          clear();
          render(component, props);
        },
        (error) => {
          if (cancelled || currentToken !== token) {
            return;
          }

          if (delayTimer) {
            clearTimeout(delayTimer);
          }

          if (timeoutTimer) {
            clearTimeout(timeoutTimer);
          }

          renderFallback(options.errorComponent, { ...props, error, retry: load });

          if (!options.errorComponent) {
            setTimeout(() => { throw error; });
          }
        }
      );

      return {
        element: start,
        unmount() {
          cancelled = true;
          if (delayTimer) {
            clearTimeout(delayTimer);
          }

          if (timeoutTimer) {
            clearTimeout(timeoutTimer);
          }

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
