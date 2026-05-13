import { effect, inject, provide, ref, unwrap } from "../runtime/index.js";
import { emitDebugEvent } from "../runtime/devtools.js";
import type { Ref } from "../runtime/index.js";

export type RouteParams = Record<string, string | string[]>;
export type RouteParamsRaw = Record<string, string | number | boolean | Array<string | number | boolean>>;
export type RouteQueryValue = string | string[] | undefined;
export type RouteQuery = Record<string, RouteQueryValue>;
export type RouteComponent = {
  mount(target: Element | DocumentFragment, props?: Record<string, unknown>): { element: Element | Comment; unmount(): void };
  hydrate?: (target: Element, props?: Record<string, unknown>) => { element: Element | Comment; unmount(): void } | Promise<{ element: Element | Comment; unmount(): void }>;
  renderToString?: (props?: Record<string, unknown>) => string | Promise<string>;
};
export type LazyRouteComponent = () => Promise<RouteComponent | { default: RouteComponent }>;
export type RoutePropsOption =
  | boolean
  | Record<string, unknown>
  | ((route: RouteLocation) => Record<string, unknown> | undefined);
export type RouteRecordInput = Omit<RouteRecord, "children" | "__mikuru_resolvedComponent"> & {
  children?: readonly RouteRecordInput[];
};
export type RouteRecord = {
  path: string;
  name?: string;
  component?: RouteComponent | LazyRouteComponent;
  loadingComponent?: RouteComponent;
  errorComponent?: RouteComponent;
  redirect?: RouteLocationRaw | ((to: RouteLocation) => RouteLocationRaw);
  alias?: string | string[];
  meta?: Record<string, unknown>;
  beforeEnter?: NavigationGuard | NavigationGuard[];
  props?: RoutePropsOption;
  children?: RouteRecord[];
  __mikuru_resolvedComponent?: RouteComponent;
};
export type QueryCodec = {
  parseQuery?(query: string): RouteQuery;
  stringifyQuery?(query: RouteQuery): string;
};
export type RouteLocation = {
  path: string;
  fullPath: string;
  query: RouteQuery;
  hash: string;
  params: RouteParams;
  matched?: RouteRecord;
  matchedRecords: RouteRecord[];
  name?: string;
  meta: Record<string, unknown>;
};
export type RouteLocationRaw =
  | string
  | { path: string; query?: RouteQuery; hash?: string }
  | { name: string; params?: RouteParamsRaw; query?: RouteQuery; hash?: string };
export type NavigationGuardResult = void | boolean | string | RouteLocationRaw;
export type NavigationGuard = (
  to: RouteLocation,
  from: RouteLocation
) => NavigationGuardResult | Promise<NavigationGuardResult>;
export const NavigationFailureType = {
  aborted: "aborted",
  cancelled: "cancelled",
  duplicated: "duplicated"
} as const;
export type NavigationFailureType = (typeof NavigationFailureType)[keyof typeof NavigationFailureType];
export type NavigationFailure = {
  type: NavigationFailureType;
  to: RouteLocation;
  from: RouteLocation;
  message: string;
};
export type NavigationResult = RouteLocation | NavigationFailure;
export type AfterNavigationHook = (to: RouteLocation, from: RouteLocation, failure?: NavigationFailure) => void;
export type RouterErrorHandler = (error: unknown, to: RouteLocation, from?: RouteLocation) => void;
export type ScrollPosition = ScrollToOptions;
export type ScrollBehavior = (
  to: RouteLocation,
  from: RouteLocation
) => ScrollPosition | false | void | Promise<ScrollPosition | false | void>;
export type ScrollMeta = {
  scroll?: ScrollPosition | false | ((to: RouteLocation, from: RouteLocation) => ScrollPosition | false | void | Promise<ScrollPosition | false | void>);
};
export type RouterHistory = {
  mode: "hash" | "history" | "memory";
  location(): string;
  push(path: string): void;
  replace(path: string): void;
  listen(fn: () => void): () => void;
  createHref(path: string): string;
  back(): void;
  forward(): void;
};
export type RouterOptions = {
  history?: RouterHistory;
  routes: readonly RouteRecord[];
  notFound?: RouteComponent;
  scrollBehavior?: ScrollBehavior;
  parseQuery?: QueryCodec["parseQuery"];
  stringifyQuery?: QueryCodec["stringifyQuery"];
  loadingComponent?: RouteComponent;
  errorComponent?: RouteComponent;
};
export type Router = {
  currentRoute: Ref<RouteLocation>;
  routes: RouteRecord[];
  push(to: RouteLocationRaw): Promise<NavigationResult>;
  replace(to: RouteLocationRaw): Promise<NavigationResult>;
  back(): void;
  forward(): void;
  resolve(to: RouteLocationRaw): RouteLocation;
  preload(to: RouteLocationRaw): Promise<RouteLocation>;
  isReady(): Promise<void>;
  beforeEach(guard: NavigationGuard): () => void;
  afterEach(hook: AfterNavigationHook): () => void;
  onError(handler: RouterErrorHandler): () => void;
  addRoute(record: RouteRecord): () => void;
  addRoute(parentName: string, record: RouteRecord): () => void;
  removeRoute(name: string): boolean;
  hasRoute(name: string): boolean;
  listen(): () => void;
  createHref(to: RouteLocationRaw): string;
  loadingComponent?: RouteComponent;
  errorComponent?: RouteComponent;
};

type RouteRecordTree = {
  path: string;
  name?: string;
  children?: readonly RouteRecordTree[];
};
type JoinRouteLiteral<Parent extends string, Path extends string> = Path extends `/${string}`
  ? Path
  : Parent extends "" | "/"
    ? Path extends ""
      ? "/"
      : `/${Path}`
    : Path extends ""
      ? Parent
      : `${Parent}/${Path}`;
type RouteEntries<Routes extends readonly RouteRecordTree[], Parent extends string = ""> = Routes[number] extends infer Record
  ? Record extends RouteRecordTree
    ?
        | (Record extends { name: infer Name extends string }
            ? { name: Name; path: JoinRouteLiteral<Parent, Record["path"]> }
            : never)
        | (Record extends { children: infer Children extends readonly RouteRecordTree[] }
            ? RouteEntries<Children, JoinRouteLiteral<Parent, Record["path"]>>
            : never)
    : never
  : never;
type RoutePathByName<Routes extends readonly RouteRecordTree[], Name extends string> = Extract<
  RouteEntries<Routes>,
  { name: Name }
> extends { path: infer Path extends string }
  ? Path
  : never;
type RouteParamInfo<Segment extends string> =
  Segment extends `:${infer Name}(${string})*`
    ? { name: Name; optional: true; repeat: true }
    : Segment extends `:${infer Name}(${string})+`
      ? { name: Name; optional: false; repeat: true }
      : Segment extends `:${infer Name}(${string})?`
        ? { name: Name; optional: true; repeat: false }
        : Segment extends `:${infer Name}(${string})`
          ? { name: Name; optional: false; repeat: false }
          : Segment extends `:${infer Name}?`
            ? { name: Name; optional: true; repeat: false }
            : Segment extends `:${infer Name}+`
              ? { name: Name; optional: false; repeat: true }
              : Segment extends `:${infer Name}*`
                ? { name: Name; optional: true; repeat: true }
                : Segment extends `:${infer Name}`
                  ? { name: Name; optional: false; repeat: false }
                  : never;
type RouteParamInfosFromPath<Path extends string> = Path extends `${infer Segment}/${infer Rest}`
  ? RouteParamInfo<Segment> | RouteParamInfosFromPath<Rest>
  : RouteParamInfo<Path>;
type RequiredRouteParams<Path extends string> = {
  [Param in RouteParamInfosFromPath<Path> as Param extends { optional: false; name: infer Name extends string }
    ? Name
    : never]: Param extends { repeat: true } ? string[] : string;
};
type OptionalRouteParams<Path extends string> = {
  [Param in RouteParamInfosFromPath<Path> as Param extends { optional: true; name: infer Name extends string }
    ? Name
    : never]?: Param extends { repeat: true } ? string[] : string;
};
type RouteParamsForPath<Path extends string> = RequiredRouteParams<Path> & OptionalRouteParams<Path>;
type HasRouteParams<Path extends string> = keyof RouteParamsForPath<Path> extends never ? false : true;
type HasRequiredRouteParams<Path extends string> = keyof RequiredRouteParams<Path> extends never ? false : true;
export type RouteNames<Routes extends readonly RouteRecordTree[]> = RouteEntries<Routes> extends {
  name: infer Name extends string;
}
  ? Name
  : never;
export type RouteParamNames<Path extends string> = RouteParamInfosFromPath<Path> extends {
  name: infer Name extends string;
}
  ? Name
  : never;
export type RouteLocationForName<
  Routes extends readonly RouteRecordTree[],
  Name extends RouteNames<Routes>
> = HasRouteParams<RoutePathByName<Routes, Name>> extends false
  ? { name: Name; query?: RouteQuery; hash?: string }
  : HasRequiredRouteParams<RoutePathByName<Routes, Name>> extends true
    ? { name: Name; params: RouteParamsForPath<RoutePathByName<Routes, Name>>; query?: RouteQuery; hash?: string }
    : { name: Name; params?: RouteParamsForPath<RoutePathByName<Routes, Name>>; query?: RouteQuery; hash?: string };

export function defineRoutes<const Routes extends readonly RouteRecordInput[]>(routes: Routes): Routes {
  return routes;
}

type CompiledRoute = {
  record: RouteRecord;
  records: RouteRecord[];
  path: string;
  keys: RouteParamKey[];
  pattern: RegExp;
};

type RouteParamKey = {
  name: string;
  repeat: boolean;
};

type RouteMatcher = {
  routes: CompiledRoute[];
  byName: Map<string, CompiledRoute>;
};

const notFoundRoute: RouteRecord = { path: "/:pathMatch(.*)*", name: "not-found" };
const routerKey = Symbol.for("mikuru.router");
const routerErrorNotifiers = new WeakMap<Router, RouterErrorHandler>();
const routerReadyTrackers = new WeakMap<Router, <T>(promise: Promise<T>) => Promise<T>>();
const maxNavigationRedirects = 20;

type RouterContext = {
  parent?: RouterContext;
  provides: Map<unknown, unknown>;
};

export function provideRouter(router: Router): void {
  provide(routerKey, router);
}

export function useRouter(): Router {
  const router = inject<Router>(routerKey);
  if (!router) {
    throw new Error("No router was provided. Call provideRouter(router) in an ancestor component.");
  }
  return router;
}

export function useRoute(): RouteLocation {
  const router = useRouter();
  return new Proxy({} as RouteLocation, {
    get(_target, key) {
      return router.currentRoute.value[key as keyof RouteLocation];
    },
    has(_target, key) {
      return key in router.currentRoute.value;
    },
    ownKeys() {
      return Reflect.ownKeys(router.currentRoute.value);
    },
    getOwnPropertyDescriptor(_target, key) {
      return Object.getOwnPropertyDescriptor(router.currentRoute.value, key);
    }
  });
}

export function isNavigationFailure(value: unknown, type?: NavigationFailureType): value is NavigationFailure {
  const failure = value as NavigationFailure | undefined;
  const isFailure =
    !!failure &&
    typeof failure === "object" &&
    typeof failure.type === "string" &&
    typeof failure.message === "string" &&
    !!failure.to &&
    !!failure.from;
  return isFailure && (!type || failure.type === type);
}

export function createRouter(options: RouterOptions): Router {
  const history = options.history ?? createWebHashHistory();
  const routes = options.routes.slice();
  const fallbackRoute = options.notFound ? { ...notFoundRoute, component: options.notFound } : undefined;
  const loadingComponent = options.loadingComponent;
  const errorComponent = options.errorComponent;
  const queryCodec: Required<QueryCodec> = {
    parseQuery: options.parseQuery ?? parseRouteQuery,
    stringifyQuery: options.stringifyQuery ?? stringifyRouteQuery
  };
  let matcher = createMatcher(readMatcherRoutes());
  const beforeGuards: NavigationGuard[] = [];
  const afterHooks: AfterNavigationHook[] = [];
  const errorHandlers: RouterErrorHandler[] = [];
  const initial = resolveRouteTarget(history.location());
  const currentRoute = ref(initial);
  const pendingReady = new Set<Promise<unknown>>();
  let listeningStop: (() => void) | undefined;
  let navigationId = 0;

  async function navigate(to: RouteLocationRaw, replace: boolean, redirectCount = 0): Promise<NavigationResult> {
    const from = currentRoute.value;
    let target = from;

    try {
      target = resolveRouteTarget(to, from.path);
      const id = ++navigationId;
      emitDebugEvent("route:navigate", { status: "start", to: target, from, replace });

      if (target.fullPath === from.fullPath) {
        const failure = createNavigationFailure(NavigationFailureType.duplicated, target, from);
        emitDebugEvent("route:navigate", { status: "duplicated", to: target, from, replace, failure });
        return failure;
      }

      const guards = [...beforeGuards, ...readBeforeEnterGuards(target.matchedRecords)];
      for (const guard of guards) {
        const result = await guard(target, from);
        if (id !== navigationId) {
          const failure = createNavigationFailure(NavigationFailureType.cancelled, target, from);
          emitDebugEvent("route:navigate", { status: "cancelled", to: target, from, replace, failure });
          return failure;
        }
        if (result === false) {
          const failure = createNavigationFailure(NavigationFailureType.aborted, target, from);
          for (const hook of afterHooks) hook(target, from, failure);
          emitDebugEvent("route:navigate", { status: "aborted", to: target, from, replace, failure });
          return failure;
        }
        if (typeof result === "string" || (result && typeof result === "object")) {
          if (redirectCount >= maxNavigationRedirects) {
            throw new Error("Too many navigation guard redirects.");
          }
          return navigate(result, true, redirectCount + 1);
        }
      }

      if (replace) history.replace(target.fullPath);
      else history.push(target.fullPath);

      currentRoute.value = target;
      for (const hook of afterHooks) {
        hook(target, from);
      }
      await trackReady(handleScroll(target, from));
      emitDebugEvent("route:navigate", { status: "success", to: target, from, replace });

      return target;
    } catch (error) {
      emitDebugEvent("route:error", { error, to: target, from, replace });
      notifyRouterError(error, target, from);
      throw error;
    }
  }

  async function preload(to: RouteLocationRaw): Promise<RouteLocation> {
    const from = currentRoute.value;
    let target = from;

    try {
      target = resolveRouteTarget(to, from.path);
      emitDebugEvent("route:preload", { status: "start", to: target, from });
      await trackReady(Promise.all(
        target.matchedRecords.map((record) => record.component ? resolveRouteComponent(record) : Promise.resolve())
      ));
      emitDebugEvent("route:preload", { status: "success", to: target, from });
      return target;
    } catch (error) {
      emitDebugEvent("route:error", { error, to: target, from, preload: true });
      notifyRouterError(error, target, from);
      throw error;
    }
  }

  function syncFromHistory(): void {
    currentRoute.value = resolveRouteTarget(history.location());
  }

  function syncCurrentRoute(): void {
    currentRoute.value = resolveRouteTarget(currentRoute.value.fullPath, currentRoute.value.path);
  }

  function readMatcherRoutes(): RouteRecord[] {
    return fallbackRoute ? [...routes, fallbackRoute] : routes;
  }

  function resolveRouteTarget(to: RouteLocationRaw, basePath?: string): RouteLocation {
    let target = resolveLocation(stringifyLocation(to, matcher, basePath, queryCodec.stringifyQuery), matcher, queryCodec.parseQuery);

    for (let redirects = 0; redirects < 10; redirects += 1) {
      const redirect = target.matched?.redirect;
      if (!redirect) return target;
      const next = typeof redirect === "function" ? redirect(target) : redirect;
      target = resolveLocation(stringifyLocation(next, matcher, target.path, queryCodec.stringifyQuery), matcher, queryCodec.parseQuery);
    }

    throw new Error("Too many route redirects.");
  }

  function replaceMatcher(nextRoutes = routes): void {
    matcher = createMatcher(fallbackRoute ? [...nextRoutes, fallbackRoute] : nextRoutes);
  }

  function addRoute(record: RouteRecord): () => void;
  function addRoute(parentName: string, record: RouteRecord): () => void;
  function addRoute(parentOrRecord: string | RouteRecord, record?: RouteRecord): () => void {
    if (typeof parentOrRecord !== "string") {
      const nextRoutes = [...routes, parentOrRecord];
      replaceMatcher(nextRoutes);
      routes.push(parentOrRecord);
      syncCurrentRoute();
      return () => {
        if (parentOrRecord.name) removeRoute(parentOrRecord.name);
        else if (removeRouteRecord(routes, parentOrRecord)) {
          replaceMatcher();
          syncCurrentRoute();
        }
      };
    }

    if (!record) {
      throw new Error("router.addRoute(parentName, record) requires a route record.");
    }

    const parent = matcher.byName.get(parentOrRecord)?.record;
    if (!parent) {
      throw new Error(`Unknown route name: ${parentOrRecord}`);
    }

    const nextChildren = [...(parent.children ?? []), record];
    const previousChildren = parent.children;
    parent.children = nextChildren;

    try {
      replaceMatcher();
    } catch (error) {
      parent.children = previousChildren;
      replaceMatcher();
      throw error;
    }

    syncCurrentRoute();
    return () => {
      if (record.name) removeRoute(record.name);
      else if (parent.children && removeRouteRecord(parent.children, record)) syncCurrentRoute();
    };
  }

  function removeRoute(name: string): boolean {
    if (!matcher.byName.has(name)) return false;
    const removed = removeRouteByName(routes, name);
    if (!removed) return false;
    replaceMatcher();
    syncCurrentRoute();
    return true;
  }

  async function handleScroll(to: RouteLocation, from: RouteLocation): Promise<void> {
    if (history.mode === "memory") return;

    if (options.scrollBehavior) {
      const position = await options.scrollBehavior(to, from);
      if (!position) return;
      scrollToPosition(position);
      return;
    }

    const metaScroll = to.meta.scroll as ScrollMeta["scroll"] | undefined;
    if (metaScroll !== undefined) {
      const position = typeof metaScroll === "function" ? await metaScroll(to, from) : metaScroll;
      if (!position) return;
      scrollToPosition(position);
      return;
    }

    scrollToDefaultPosition(to);
  }

  function trackReady<T>(promise: Promise<T>): Promise<T> {
    pendingReady.add(promise);
    return promise.finally(() => pendingReady.delete(promise));
  }

  const router: Router = {
    currentRoute,
    routes,
    push(to) {
      return trackReady(navigate(to, false));
    },
    replace(to) {
      return trackReady(navigate(to, true));
    },
    back() {
      history.back();
    },
    forward() {
      history.forward();
    },
    resolve(to) {
      return resolveRouteTarget(to, currentRoute.value.path);
    },
    preload,
    isReady() {
      return Promise.all(Array.from(pendingReady)).then(() => undefined);
    },
    beforeEach(guard) {
      beforeGuards.push(guard);
      return () => removeItem(beforeGuards, guard);
    },
    afterEach(hook) {
      afterHooks.push(hook);
      return () => removeItem(afterHooks, hook);
    },
    onError(handler) {
      errorHandlers.push(handler);
      return () => removeItem(errorHandlers, handler);
    },
    addRoute,
    removeRoute,
    hasRoute(name) {
      return matcher.byName.has(name);
    },
    listen() {
      if (listeningStop) return listeningStop;
      listeningStop = history.listen(syncFromHistory);
      syncFromHistory();
      return () => {
        listeningStop?.();
        listeningStop = undefined;
      };
    },
    createHref(to) {
      return history.createHref(stringifyLocation(to, matcher, currentRoute.value.path, queryCodec.stringifyQuery));
    },
    loadingComponent,
    errorComponent
  };
  routerErrorNotifiers.set(router, notifyRouterError);
  routerReadyTrackers.set(router, trackReady);
  return router;

  function notifyRouterError(error: unknown, to: RouteLocation, from?: RouteLocation): void {
    for (const handler of errorHandlers) {
      try {
        handler(error, to, from);
      } catch (handlerError) {
        setTimeout(() => {
          throw handlerError;
        });
      }
    }
  }
}

export function createWebHistory(base = ""): RouterHistory {
  const normalizedBase = normalizeBase(base);

  return {
    mode: "history",
    location() {
      const path = stripBase(globalThis.location?.pathname ?? "/", normalizedBase);
      return `${path || "/"}${globalThis.location?.search ?? ""}${globalThis.location?.hash ?? ""}`;
    },
    push(path) {
      globalThis.history?.pushState({}, "", `${normalizedBase}${path.replace(/^\//, "")}`);
    },
    replace(path) {
      globalThis.history?.replaceState({}, "", `${normalizedBase}${path.replace(/^\//, "")}`);
    },
    listen(fn) {
      globalThis.addEventListener?.("popstate", fn);
      return () => globalThis.removeEventListener?.("popstate", fn);
    },
    createHref(path) {
      return `${normalizedBase}${path.replace(/^\//, "")}`;
    },
    back() {
      globalThis.history?.back();
    },
    forward() {
      globalThis.history?.forward();
    }
  };
}

export function createWebHashHistory(base = ""): RouterHistory {
  const normalizedBase = normalizeBase(base);

  return {
    mode: "hash",
    location() {
      const hash = globalThis.location?.hash ?? "";
      return normalizePath(hash.startsWith("#") ? hash.slice(1) : hash);
    },
    push(path) {
      globalThis.location.hash = `${normalizedBase.replace(/\/$/, "")}#${normalizePath(path)}`;
    },
    replace(path) {
      const url = `${globalThis.location?.pathname ?? ""}${globalThis.location?.search ?? ""}${normalizedBase.replace(/\/$/, "")}#${normalizePath(path)}`;
      globalThis.location?.replace?.(url);
    },
    listen(fn) {
      globalThis.addEventListener?.("hashchange", fn);
      return () => globalThis.removeEventListener?.("hashchange", fn);
    },
    createHref(path) {
      return `${normalizedBase.replace(/\/$/, "")}#${normalizePath(path)}`;
    },
    back() {
      globalThis.history?.back();
    },
    forward() {
      globalThis.history?.forward();
    }
  };
}

export function createMemoryHistory(initial = "/"): RouterHistory {
  const stack = [normalizePath(initial)];
  const listeners = new Set<() => void>();
  let index = 0;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return {
    mode: "memory",
    location() {
      return stack[index] ?? "/";
    },
    push(path) {
      stack.splice(index + 1);
      stack.push(normalizePath(path));
      index = stack.length - 1;
      notify();
    },
    replace(path) {
      stack[index] = normalizePath(path);
      notify();
    },
    listen(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    createHref(path) {
      return normalizePath(path);
    },
    back() {
      if (index > 0) {
        index -= 1;
        notify();
      }
    },
    forward() {
      if (index < stack.length - 1) {
        index += 1;
        notify();
      }
    }
  };
}

export const RouterView: RouteComponent = {
  async renderToString(props = {}) {
    const child = typeof props.children === "function"
      ? await (props.children as (slotProps?: Record<string, unknown>) => string | Promise<string>)({ __mikuru_context: props.__mikuru_context })
      : "";
    return String(child ?? "");
  },
  hydrate(target, props = {}) {
    const cleanup: Array<() => void> = [];
    const childTarget = target.matches("[data-mikuru-router-view]")
      ? target.firstElementChild
      : target;

    if (childTarget && typeof props.children === "function") {
      void Promise.resolve((props.children as (target: Element, slotProps?: Record<string, unknown>) => unknown)(childTarget, { __mikuru_context: props.__mikuru_context }))
        .then((result) => {
          if (result && typeof result === "object" && typeof (result as { unmount?: unknown }).unmount === "function") {
            cleanup.push(() => (result as { unmount(): void }).unmount());
          }
        });
    }

    return {
      element: target,
      unmount() {
        for (const fn of cleanup.splice(0).reverse()) fn();
      }
    };
  },
  mount(target, props = {}) {
    const anchor = document.createComment("mikuru-router-view");
    const cleanup: Array<() => void> = [];
    let child: { element: Element | Comment; unmount(): void } | undefined;
    let renderId = 0;
    target.appendChild(anchor);

    const stop = effect(() => {
      const router = getRouterProp(props);
      const route = router.currentRoute.value;
      const depth = Number(unwrap(props.depth) ?? 0);
      const record = route.matchedRecords[depth];
      const id = ++renderId;
      child?.unmount();
      child = undefined;

      if (!record?.component) return;

      if (isLazyRouteComponent(record.component)) {
        const loadingComponent = record.loadingComponent ?? router.loadingComponent;
        if (loadingComponent) {
          const fragment = anchor.ownerDocument.createDocumentFragment();
          child = loadingComponent.mount(fragment, { route, router, __mikuru_context: props.__mikuru_context });
          anchor.parentNode?.insertBefore(fragment, anchor);
        }
      }

      const componentPromise = resolveRouteComponent(record);
      void (routerReadyTrackers.get(router)?.(componentPromise) ?? componentPromise).catch(() => undefined);
      void componentPromise
        .then((component) => {
          if (id !== renderId) return;
          child?.unmount();
          child = undefined;

          const fragment = anchor.ownerDocument.createDocumentFragment();
          child = component.mount(fragment, createRouteComponentProps(record, route, router, props.__mikuru_context));
          anchor.parentNode?.insertBefore(fragment, anchor);
        })
        .catch((error) => {
          if (id !== renderId) return;
          child?.unmount();
          child = undefined;

          routerErrorNotifiers.get(router)?.(error, route);
          const errorComponent = record.errorComponent ?? router.errorComponent;
          if (!errorComponent) {
            setTimeout(() => {
              throw error;
            });
            return;
          }

          const fragment = anchor.ownerDocument.createDocumentFragment();
          child = errorComponent.mount(fragment, { error, route, router, __mikuru_context: props.__mikuru_context });
          anchor.parentNode?.insertBefore(fragment, anchor);
        });
    });

    cleanup.push(stop, () => child?.unmount(), () => anchor.remove());

    return {
      element: anchor,
      unmount() {
        for (const fn of cleanup.splice(0).reverse()) fn();
      }
    };
  }
};

export const RouterLink: RouteComponent = {
  async renderToString(props = {}) {
    const router = getRouterProp(props);
    const to = readToProp(props);
    const targetRoute = router.resolve(to);
    const activeClass = String(unwrap(props.activeClass) ?? "router-link-active");
    const exactActiveClass = String(unwrap(props.exactActiveClass) ?? "router-link-exact-active");
    const isExactActive = router.currentRoute.value.fullPath === targetRoute.fullPath;
    const isActive = isExactActive || isPathActive(router.currentRoute.value.path, targetRoute.path);
    const classes = [isActive ? activeClass : "", isExactActive ? exactActiveClass : ""].filter(Boolean).join(" ");
    const ariaCurrent = isExactActive ? " aria-current=\"page\"" : "";
    const classAttr = classes ? ` class="${escapeRouterHtml(classes)}"` : "";
    const label = typeof props.children === "function"
      ? String(await (props.children as (slotProps?: Record<string, unknown>) => string | Promise<string>)({ __mikuru_context: props.__mikuru_context }) ?? "")
      : escapeRouterHtml(readRouterLinkText(props));

    return `<a href="${escapeRouterHtml(router.createHref(to))}"${classAttr}${ariaCurrent}>${label}</a>`;
  },
  hydrate(target, props = {}) {
    const anchor = target as HTMLAnchorElement;
    const cleanup: Array<() => void> = [];
    const hasChildren = typeof props.children === "function";
    const navigate = (event: Event) => {
      const router = getRouterProp(props);
      event.preventDefault();
      void (unwrap(props.replace) ? router.replace(readToProp(props)) : router.push(readToProp(props)));
    };
    const preload = () => {
      if (!unwrap(props.preload)) return;
      const router = getRouterProp(props);
      void router.preload(readToProp(props)).catch(() => undefined);
    };

    anchor.addEventListener("click", navigate);
    anchor.addEventListener("mouseenter", preload);
    anchor.addEventListener("focus", preload);
    cleanup.push(() => anchor.removeEventListener("click", navigate));
    cleanup.push(() => anchor.removeEventListener("mouseenter", preload));
    cleanup.push(() => anchor.removeEventListener("focus", preload));

    if (hasChildren) {
      const cleanupResult = (props.children as (target: Element, props?: Record<string, unknown>) => void | (() => void))(anchor, {});
      if (cleanupResult) cleanup.push(cleanupResult);
    }

    const stop = effect(() => {
      const router = getRouterProp(props);
      const to = readToProp(props);
      const targetRoute = router.resolve(to);
      const activeClass = String(unwrap(props.activeClass) ?? "router-link-active");
      const exactActiveClass = String(unwrap(props.exactActiveClass) ?? "router-link-exact-active");
      const isExactActive = router.currentRoute.value.fullPath === targetRoute.fullPath;
      const isActive = isExactActive || isPathActive(router.currentRoute.value.path, targetRoute.path);
      anchor.href = router.createHref(to);
      if (!hasChildren) anchor.textContent = readRouterLinkText(props);
      anchor.classList.toggle(activeClass, isActive);
      anchor.classList.toggle(exactActiveClass, isExactActive);

      if (isExactActive) {
        anchor.setAttribute("aria-current", "page");
      } else {
        anchor.removeAttribute("aria-current");
      }
    });

    cleanup.push(stop);

    return {
      element: anchor,
      unmount() {
        for (const fn of cleanup.splice(0).reverse()) fn();
      }
    };
  },
  mount(target, props = {}) {
    const anchor = document.createElement("a");
    const cleanup: Array<() => void> = [];
    const hasChildren = typeof props.children === "function";
    const text = () => {
      const label = unwrap(props.label) ?? unwrap(props.childrenText);
      if (label !== undefined) return String(label);

      const to = readToProp(props);
      if (typeof to === "string") return to;
      if ("name" in to) return to.name;
      return to.path;
    };
    const navigate = (event: Event) => {
      const router = getRouterProp(props);
      event.preventDefault();
      void (unwrap(props.replace) ? router.replace(readToProp(props)) : router.push(readToProp(props)));
    };
    const preload = () => {
      if (!unwrap(props.preload)) return;
      const router = getRouterProp(props);
      void router.preload(readToProp(props)).catch(() => undefined);
    };

    anchor.addEventListener("click", navigate);
    anchor.addEventListener("mouseenter", preload);
    anchor.addEventListener("focus", preload);
    cleanup.push(() => anchor.removeEventListener("click", navigate));
    cleanup.push(() => anchor.removeEventListener("mouseenter", preload));
    cleanup.push(() => anchor.removeEventListener("focus", preload));

    if (hasChildren) {
      const cleanupResult = (props.children as (target: Element, props?: Record<string, unknown>) => void | (() => void))(anchor, {});
      if (cleanupResult) cleanup.push(cleanupResult);
    }

    const stop = effect(() => {
      const router = getRouterProp(props);
      const to = readToProp(props);
      const targetRoute = router.resolve(to);
      const activeClass = String(unwrap(props.activeClass) ?? "router-link-active");
      const exactActiveClass = String(unwrap(props.exactActiveClass) ?? "router-link-exact-active");
      const isExactActive = router.currentRoute.value.fullPath === targetRoute.fullPath;
      const isActive = isExactActive || isPathActive(router.currentRoute.value.path, targetRoute.path);
      anchor.href = router.createHref(to);
      if (!hasChildren) anchor.textContent = text();
      anchor.classList.toggle(activeClass, isActive);
      anchor.classList.toggle(exactActiveClass, isExactActive);

      if (isExactActive) {
        anchor.setAttribute("aria-current", "page");
      } else {
        anchor.removeAttribute("aria-current");
      }
    });

    cleanup.push(stop, () => anchor.remove());
    target.appendChild(anchor);

    return {
      element: anchor,
      unmount() {
        for (const fn of cleanup.splice(0).reverse()) fn();
      }
    };
  }
};

function readRouterLinkText(props: Record<string, unknown>): string {
  const label = unwrap(props.label) ?? unwrap(props.childrenText);
  if (label !== undefined) return String(label);

  const to = readToProp(props);
  if (typeof to === "string") return to;
  if ("name" in to) return to.name;
  return to.path;
}

function escapeRouterHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function getRouterProp(props: Record<string, unknown>): Router {
  const router = unwrap(props.router);
  if (!router || typeof router !== "object" || !("currentRoute" in router)) {
    const contextRouter = injectRouterFromContext(props.__mikuru_context);
    if (contextRouter) return contextRouter;
    throw new Error("RouterView and RouterLink require a router prop or provided router context.");
  }
  return router as Router;
}

function injectRouterFromContext(context: unknown): Router | undefined {
  for (let current = context as RouterContext | undefined; current; current = current.parent) {
    const router = current.provides?.get(routerKey);
    if (router && typeof router === "object" && "currentRoute" in router) {
      return router as Router;
    }
  }
  return undefined;
}

async function resolveRouteComponent(record: RouteRecord): Promise<RouteComponent> {
  if (record.__mikuru_resolvedComponent) return record.__mikuru_resolvedComponent;
  const component = record.component;

  if (!component) {
    throw new Error(`Route ${record.path} does not have a component.`);
  }

  if (isRouteComponent(component)) {
    record.__mikuru_resolvedComponent = component;
    return component;
  }

  const loaded = await component();
  const resolved = isRouteComponent(loaded) ? loaded : loaded.default;
  if (!isRouteComponent(resolved)) {
    throw new Error(`Lazy route component for ${record.path} did not resolve to a component.`);
  }

  record.__mikuru_resolvedComponent = resolved;
  return resolved;
}

function isRouteComponent(component: unknown): component is RouteComponent {
  return !!component && typeof component === "object" && typeof (component as RouteComponent).mount === "function";
}

function isLazyRouteComponent(component: unknown): component is LazyRouteComponent {
  return typeof component === "function";
}

function createRouteComponentProps(
  record: RouteRecord,
  route: RouteLocation,
  router: Router,
  context: unknown
): Record<string, unknown> {
  return {
    ...resolveRouteProps(record, route),
    route,
    router,
    __mikuru_context: context
  };
}

function resolveRouteProps(record: RouteRecord, route: RouteLocation): Record<string, unknown> {
  if (record.props === true) return { ...route.params };
  if (typeof record.props === "function") return record.props(route) ?? {};
  if (record.props && typeof record.props === "object") return { ...record.props };
  return {};
}

function compileRoutePath(path: string): { keys: RouteParamKey[]; pattern: RegExp } {
  const keys: RouteParamKey[] = [];
  const normalized = normalizePath(path);
  if (normalized === "/") return { keys, pattern: /^\/$/ };

  const source = normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => compileRouteSegment(segment, keys))
    .join("");

  return { keys, pattern: new RegExp(`^${source}$`) };
}

function compileRouteSegment(segment: string, keys: RouteParamKey[]): string {
  const param = parseRouteParamSegment(segment);
  if (!param) return `/${escapeRegExp(segment)}`;

  keys.push({ name: param.name, repeat: param.repeat });

  if (param.pattern === ".*") {
    return param.optional ? "(?:/(.*))?" : "/(.*)";
  }

  if (param.repeat) {
    const repeated = "([^/]+(?:/[^/]+)*)";
    return param.optional ? `(?:/${repeated})?` : `/${repeated}`;
  }

  return param.optional ? "(?:/([^/]+))?" : "/([^/]+)";
}

function parseRouteParamSegment(
  segment: string
): { name: string; pattern?: string; optional: boolean; repeat: boolean } | undefined {
  const match = /^:([^()+*?]+)(?:\((\.\*)\))?([?+*])?$/.exec(segment);
  if (!match) return undefined;

  const modifier = match[3] ?? "";
  return {
    name: match[1],
    pattern: match[2],
    optional: modifier === "?" || modifier === "*",
    repeat: modifier === "+" || modifier === "*" || match[2] === ".*"
  };
}

function stringifyRoutePath(path: string, params: RouteParamsRaw): string {
  const normalized = normalizePath(path);
  if (normalized === "/") return "/";

  const segments = normalized.split("/").filter(Boolean);
  const resolved: string[] = [];

  for (const segment of segments) {
    const param = parseRouteParamSegment(segment);
    if (!param) {
      resolved.push(segment);
      continue;
    }

    const value = params[param.name];
    if (value === undefined) {
      if (param.optional) continue;
      throw new Error(`Missing route param: ${param.name}`);
    }

    const values = Array.isArray(value) ? value : [value];
    if (values.length === 0) {
      if (param.optional) continue;
      throw new Error(`Missing route param: ${param.name}`);
    }

    if (values.length > 1 && !param.repeat) {
      throw new Error(`Route param is not repeatable: ${param.name}`);
    }

    resolved.push(...values.map((item) => encodeURIComponent(String(item))));
  }

  return normalizePath(resolved.join("/"));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createMatcher(routes: RouteRecord[]): RouteMatcher {
  const compiled: CompiledRoute[] = [];
  const byName = new Map<string, CompiledRoute>();

  function addCompiledRoute(record: RouteRecord, path: string, parents: RouteRecord[], registerName: boolean): CompiledRoute {
    const compiledPath = compileRoutePath(path);

    const route = {
      record,
      records: [...parents, record],
      path,
      keys: compiledPath.keys,
      pattern: compiledPath.pattern
    };

    compiled.push(route);

    if (registerName && record.name) {
      if (byName.has(record.name)) {
        throw new Error(`Duplicate route name: ${record.name}`);
      }
      byName.set(record.name, route);
    }

    return route;
  }

  function addRoute(record: RouteRecord, parentPath: string, parents: RouteRecord[], registerNames = true): void {
    const path = joinRoutePath(parentPath, record.path);
    const paths = [path, ...readAliases(record).map((alias) => joinRoutePath(parentPath, alias))];

    paths.forEach((routePath, index) => {
      addCompiledRoute(record, routePath, parents, registerNames && index === 0);
    });

    paths.forEach((routePath, index) => {
      for (const child of record.children ?? []) {
        addRoute(child, routePath, [...parents, record], registerNames && index === 0);
      }
    });
  }

  for (const route of routes) {
    addRoute(route, "", []);
  }

  compiled.sort((left, right) => {
    if (left.path !== right.path) return 0;
    return right.records.length - left.records.length;
  });

  return { routes: compiled, byName };
}

function resolveLocation(raw: string, matcher: RouteMatcher, parseQuery: QueryCodec["parseQuery"] = parseRouteQuery): RouteLocation {
  const fullPath = normalizePath(raw);
  const parsed = parsePath(fullPath, parseQuery);
  const matched = matcher.routes.find((route) => route.pattern.test(parsed.path));
  const params: RouteParams = {};

  if (matched) {
    const match = matched.pattern.exec(parsed.path);
    matched.keys.forEach((key, index) => {
      const value = match?.[index + 1];
      if (value === undefined || value === "") return;
      params[key.name] = key.repeat ? value.split("/").map((part) => decodeURIComponent(part)) : decodeURIComponent(value);
    });
  }

  return {
    path: parsed.path,
    fullPath,
    query: parsed.query,
    hash: parsed.hash,
    params,
    matched: matched?.record,
    matchedRecords: matched?.records ?? [],
    name: matched?.record.name,
    meta: mergeMeta(matched?.records ?? [])
  };
}

function parsePath(fullPath: string, parseQuery: QueryCodec["parseQuery"] = parseRouteQuery): { path: string; query: RouteQuery; hash: string } {
  const [pathAndQuery, rawHash = ""] = fullPath.split("#", 2);
  const [path = "/", rawQuery = ""] = pathAndQuery.split("?", 2);
  return {
    path: normalizePath(path),
    query: parseQuery(rawQuery),
    hash: rawHash ? `#${rawHash}` : ""
  };
}

function stringifyLocation(
  to: RouteLocationRaw,
  matcher?: RouteMatcher,
  basePath?: string,
  stringifyQuery: QueryCodec["stringifyQuery"] = stringifyRouteQuery
): string {
  if (typeof to === "string") return stringifyPathLocation(to, basePath);
  const path = "name" in to ? stringifyNamedLocation(to, matcher) : normalizeRelativePath(to.path, basePath);
  const query = stringifyQuery(to.query ?? {});
  const hash = to.hash ? (to.hash.startsWith("#") ? to.hash : `#${to.hash}`) : "";
  return `${path}${query}${hash}`;
}

function stringifyPathLocation(raw: string, basePath?: string): string {
  const [pathAndQuery, rawHash = ""] = raw.split("#", 2);
  const [path = "/", rawQuery = ""] = pathAndQuery.split("?", 2);
  const query = rawQuery ? `?${rawQuery}` : "";
  const hash = rawHash ? `#${rawHash}` : "";
  return `${normalizeRelativePath(path, basePath)}${query}${hash}`;
}

function stringifyNamedLocation(
  to: Extract<RouteLocationRaw, { name: string }>,
  matcher: RouteMatcher | undefined
): string {
  const route = matcher?.byName.get(to.name);
  if (!route) {
    throw new Error(`Unknown route name: ${to.name}`);
  }

  return stringifyRoutePath(route.path, to.params ?? {});
}

export function parseRouteQuery(raw: string): RouteQuery {
  const query: RouteQuery = {};
  const search = new URLSearchParams(raw);

  for (const [key, value] of search) {
    const current = query[key];
    if (Array.isArray(current)) current.push(value);
    else if (current !== undefined) query[key] = [current, value];
    else query[key] = value;
  }

  return query;
}

export function stringifyRouteQuery(query: RouteQuery): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else if (value !== undefined) {
      search.set(key, value);
    }
  }

  const result = search.toString();
  return result ? `?${result}` : "";
}

function normalizePath(path: string): string {
  const normalized = path.trim() || "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizeRelativePath(path: string, basePath?: string): string {
  const normalized = path.trim() || "/";
  if (!isRelativePath(normalized)) return normalizePath(normalized);

  const segments = normalizePath(basePath ?? "/")
    .split("/")
    .filter(Boolean);

  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }

  return normalizePath(segments.map((segment) => encodeURIComponent(decodeURIComponent(segment))).join("/"));
}

function isRelativePath(path: string): boolean {
  return path === "." || path === ".." || path.startsWith("./") || path.startsWith("../");
}

function normalizeBase(base: string): string {
  if (!base) return "/";
  return base.endsWith("/") ? base : `${base}/`;
}

function joinRoutePath(parentPath: string, path: string): string {
  if (path.startsWith("/")) return normalizePath(path);
  if (!parentPath) return normalizePath(path);
  if (!path) return parentPath;
  return normalizePath(`${parentPath.replace(/\/$/, "")}/${path}`);
}

function readToProp(props: Record<string, unknown>): RouteLocationRaw {
  return (unwrap(props.to) as RouteLocationRaw | undefined) ?? "/";
}

function readAliases(record: RouteRecord): string[] {
  if (!record.alias) return [];
  return Array.isArray(record.alias) ? record.alias : [record.alias];
}

function mergeMeta(records: RouteRecord[]): Record<string, unknown> {
  return records.reduce<Record<string, unknown>>((meta, record) => ({ ...meta, ...(record.meta ?? {}) }), {});
}

function readBeforeEnterGuards(records: RouteRecord[]): NavigationGuard[] {
  return records.flatMap((record) => {
    if (!record.beforeEnter) return [];
    return Array.isArray(record.beforeEnter) ? record.beforeEnter : [record.beforeEnter];
  });
}

function removeRouteByName(routes: RouteRecord[], name: string): boolean {
  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index];
    if (!route) continue;

    if (route.name === name) {
      routes.splice(index, 1);
      return true;
    }

    if (route.children && removeRouteByName(route.children, name)) {
      return true;
    }
  }

  return false;
}

function removeRouteRecord(routes: RouteRecord[], record: RouteRecord): boolean {
  const index = routes.indexOf(record);
  if (index >= 0) {
    routes.splice(index, 1);
    return true;
  }

  for (const route of routes) {
    if (route.children && removeRouteRecord(route.children, record)) {
      return true;
    }
  }

  return false;
}

function createNavigationFailure(type: NavigationFailureType, to: RouteLocation, from: RouteLocation): NavigationFailure {
  return {
    type,
    to,
    from,
    message: `Navigation ${type} from ${from.fullPath} to ${to.fullPath}.`
  };
}

function scrollToDefaultPosition(to: RouteLocation): void {
  if (to.hash) {
    const id = decodeURIComponent(to.hash.slice(1));
    const element = globalThis.document?.getElementById?.(id);
    if (element) {
      element.scrollIntoView();
      return;
    }
  }

  scrollToPosition({ left: 0, top: 0 });
}

function scrollToPosition(position: ScrollPosition): void {
  const scrollTo = globalThis.scrollTo ?? globalThis.window?.scrollTo;
  (scrollTo as ((options: ScrollToOptions) => void) | undefined)?.call(globalThis.window ?? globalThis, position);
}

function stripBase(path: string, base: string): string {
  if (base === "/") return path;
  return path.startsWith(base) ? path.slice(base.length - 1) : path;
}

function isPathActive(currentPath: string, targetPath: string): boolean {
  if (targetPath === "/") return currentPath === "/";
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function removeItem<T>(items: T[], item: T): void {
  const index = items.indexOf(item);
  if (index >= 0) items.splice(index, 1);
}
