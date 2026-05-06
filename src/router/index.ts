import { effect, ref, unwrap } from "../runtime/index.js";
import type { Ref } from "../runtime/index.js";

export type RouteParams = Record<string, string>;
export type RouteParamsRaw = Record<string, string | number | boolean>;
export type RouteQuery = Record<string, string | string[] | undefined>;
export type RouteComponent = {
  mount(target: Element | DocumentFragment, props?: Record<string, unknown>): { element: Element | Comment; unmount(): void };
};
export type RouteRecord = {
  path: string;
  name?: string;
  component?: RouteComponent;
  redirect?: RouteLocationRaw | ((to: RouteLocation) => RouteLocationRaw);
  alias?: string | string[];
  meta?: Record<string, unknown>;
  children?: RouteRecord[];
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
export type AfterNavigationHook = (to: RouteLocation, from: RouteLocation) => void;
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
  routes: RouteRecord[];
  notFound?: RouteComponent;
};
export type Router = {
  currentRoute: Ref<RouteLocation>;
  routes: RouteRecord[];
  push(to: RouteLocationRaw): Promise<RouteLocation>;
  replace(to: RouteLocationRaw): Promise<RouteLocation>;
  back(): void;
  forward(): void;
  resolve(to: RouteLocationRaw): RouteLocation;
  beforeEach(guard: NavigationGuard): () => void;
  afterEach(hook: AfterNavigationHook): () => void;
  listen(): () => void;
  createHref(to: RouteLocationRaw): string;
};

type CompiledRoute = {
  record: RouteRecord;
  records: RouteRecord[];
  path: string;
  keys: string[];
  pattern: RegExp;
};

type RouteMatcher = {
  routes: CompiledRoute[];
  byName: Map<string, CompiledRoute>;
};

const notFoundRoute: RouteRecord = { path: "/:pathMatch(.*)*", name: "not-found" };

export function createRouter(options: RouterOptions): Router {
  const history = options.history ?? createWebHashHistory();
  const routes = options.notFound ? [...options.routes, { ...notFoundRoute, component: options.notFound }] : options.routes.slice();
  const matcher = createMatcher(routes);
  const beforeGuards: NavigationGuard[] = [];
  const afterHooks: AfterNavigationHook[] = [];
  const initial = resolveRouteTarget(history.location());
  const currentRoute = ref(initial);
  let listeningStop: (() => void) | undefined;
  let navigationId = 0;

  async function navigate(to: RouteLocationRaw, replace: boolean): Promise<RouteLocation> {
    let target = resolveRouteTarget(to);
    const from = currentRoute.value;
    const id = ++navigationId;

    for (const guard of beforeGuards) {
      const result = await guard(target, from);
      if (id !== navigationId) return currentRoute.value;
      if (result === false) return from;
      if (typeof result === "string" || (result && typeof result === "object")) {
        return navigate(result, true);
      }
    }

    if (replace) history.replace(target.fullPath);
    else history.push(target.fullPath);

    currentRoute.value = target;
    for (const hook of afterHooks) {
      hook(target, from);
    }

    return target;
  }

  function syncFromHistory(): void {
    currentRoute.value = resolveRouteTarget(history.location());
  }

  function resolveRouteTarget(to: RouteLocationRaw): RouteLocation {
    let target = resolveLocation(stringifyLocation(to, matcher), matcher);

    for (let redirects = 0; redirects < 10; redirects += 1) {
      const redirect = target.matched?.redirect;
      if (!redirect) return target;
      const next = typeof redirect === "function" ? redirect(target) : redirect;
      target = resolveLocation(stringifyLocation(next, matcher), matcher);
    }

    throw new Error("Too many route redirects.");
  }

  return {
    currentRoute,
    routes,
    push(to) {
      return navigate(to, false);
    },
    replace(to) {
      return navigate(to, true);
    },
    back() {
      history.back();
    },
    forward() {
      history.forward();
    },
    resolve(to) {
      return resolveRouteTarget(to);
    },
    beforeEach(guard) {
      beforeGuards.push(guard);
      return () => removeItem(beforeGuards, guard);
    },
    afterEach(hook) {
      afterHooks.push(hook);
      return () => removeItem(afterHooks, hook);
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
      return history.createHref(stringifyLocation(to, matcher));
    }
  };
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
  mount(target, props = {}) {
    const anchor = document.createComment("mikuru-router-view");
    const cleanup: Array<() => void> = [];
    let child: { element: Element | Comment; unmount(): void } | undefined;
    target.appendChild(anchor);

    const stop = effect(() => {
      const router = getRouterProp(props);
      const route = router.currentRoute.value;
      const depth = Number(unwrap(props.depth) ?? 0);
      const component = route.matchedRecords[depth]?.component;
      child?.unmount();
      child = undefined;

      if (!component) return;

      const fragment = document.createDocumentFragment();
      child = component.mount(fragment, { route, router, __mikuru_context: props.__mikuru_context });
      anchor.parentNode?.insertBefore(fragment, anchor);
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

    anchor.addEventListener("click", navigate);
    cleanup.push(() => anchor.removeEventListener("click", navigate));

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

function getRouterProp(props: Record<string, unknown>): Router {
  const router = unwrap(props.router);
  if (!router || typeof router !== "object" || !("currentRoute" in router)) {
    throw new Error("RouterView and RouterLink require a router prop.");
  }
  return router as Router;
}

function createMatcher(routes: RouteRecord[]): RouteMatcher {
  const compiled: CompiledRoute[] = [];
  const byName = new Map<string, CompiledRoute>();

  function addCompiledRoute(record: RouteRecord, path: string, parents: RouteRecord[], registerName: boolean): CompiledRoute {
    const keys: string[] = [];
    const source = path
      .replace(/\/:([^/(]+)\(\.\*\)\*/g, (_match, key) => {
        keys.push(key);
        return "/(.*)";
      })
      .replace(/:([^/]+)/g, (_match, key) => {
        keys.push(key);
        return "([^/]+)";
      });

    const route = {
      record,
      records: [...parents, record],
      path,
      keys,
      pattern: new RegExp(`^${source.replace(/\//g, "\\/")}$`)
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

  return { routes: compiled, byName };
}

function resolveLocation(raw: string, matcher: RouteMatcher): RouteLocation {
  const fullPath = normalizePath(raw);
  const parsed = parsePath(fullPath);
  const matched = matcher.routes.find((route) => route.pattern.test(parsed.path));
  const params: RouteParams = {};

  if (matched) {
    const match = matched.pattern.exec(parsed.path);
    matched.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match?.[index + 1] ?? "");
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
    meta: matched?.record.meta ?? {}
  };
}

function parsePath(fullPath: string): { path: string; query: RouteQuery; hash: string } {
  const [pathAndQuery, rawHash = ""] = fullPath.split("#", 2);
  const [path = "/", rawQuery = ""] = pathAndQuery.split("?", 2);
  return {
    path: normalizePath(path),
    query: parseQuery(rawQuery),
    hash: rawHash ? `#${rawHash}` : ""
  };
}

function stringifyLocation(to: RouteLocationRaw, matcher?: RouteMatcher): string {
  if (typeof to === "string") return normalizePath(to);
  const path = "name" in to ? stringifyNamedLocation(to, matcher) : normalizePath(to.path);
  const query = stringifyQuery(to.query ?? {});
  const hash = to.hash ? (to.hash.startsWith("#") ? to.hash : `#${to.hash}`) : "";
  return `${path}${query}${hash}`;
}

function stringifyNamedLocation(
  to: Extract<RouteLocationRaw, { name: string }>,
  matcher: RouteMatcher | undefined
): string {
  const route = matcher?.byName.get(to.name);
  if (!route) {
    throw new Error(`Unknown route name: ${to.name}`);
  }

  return route.path.replace(/:([^/]+)/g, (_match, key) => {
    const value = to.params?.[key];
    if (value === undefined) {
      throw new Error(`Missing route param: ${key}`);
    }

    return encodeURIComponent(String(value));
  });
}

function parseQuery(raw: string): RouteQuery {
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

function stringifyQuery(query: RouteQuery): string {
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
