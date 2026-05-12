import type { NavigationFailure, RouteLocation, RouteLocationRaw, RouteRecord, Router } from "./router/index.js";

export type MikuruSsrComponent = {
  renderToString: (props?: Record<string, unknown>) => string | Promise<string>;
};

export type MikuruHydrationInstance = {
  element: Element | Comment;
  unmount(): void;
};

export type MikuruHydrationComponent = {
  hydrate?: (target: Element, props?: Record<string, unknown>) => MikuruHydrationInstance | Promise<MikuruHydrationInstance>;
  mount?: (target: Element | DocumentFragment, props?: Record<string, unknown>) => MikuruHydrationInstance;
};

export type MikuruSsrRouteRenderResult = {
  html: string;
  route: RouteLocation;
};

export type MikuruRouteHydrationResult = {
  element: Element | Comment;
  route: RouteLocation;
  unmount(): void;
};

const booleanAttributes = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected"
]);

const unsafeAttributeNamePattern = /[\s"'<>/=]/;

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderAttr(name: string, value: unknown): string {
  if (!name || unsafeAttributeNamePattern.test(name) || value === false || value === null || value === undefined) {
    return "";
  }

  const normalizedName = name.toLowerCase();
  if (value === true && booleanAttributes.has(normalizedName)) {
    return ` ${name}`;
  }

  if (value === true) {
    return ` ${name}=""`;
  }

  return ` ${name}="${escapeHtml(value)}"`;
}

export function renderAttrs(attrs: Record<string, unknown> | null | undefined): string {
  if (!attrs) {
    return "";
  }

  let rendered = "";
  for (const [name, value] of Object.entries(attrs)) {
    rendered += renderAttr(name, value);
  }
  return rendered;
}

export async function renderComponentToString(component: MikuruSsrComponent | ((props?: Record<string, unknown>) => string | Promise<string>), props: Record<string, unknown> = {}): Promise<string> {
  return String(await renderToString(component, props));
}

export function renderToString(component: MikuruSsrComponent | ((props?: Record<string, unknown>) => string | Promise<string>), props: Record<string, unknown> = {}): string | Promise<string> {
  if (typeof component === "function") {
    return component(props);
  }

  if (component && typeof component.renderToString === "function") {
    return component.renderToString(props);
  }

  throw new TypeError("renderToString() expects a component with renderToString(props) or a render function.");
}

export async function renderRouteToString(router: Router, to: RouteLocationRaw = router.currentRoute.value.fullPath): Promise<MikuruSsrRouteRenderResult> {
  const target = router.resolve(to);
  let route = target;

  if (router.currentRoute.value.fullPath !== target.fullPath) {
    const navigation = await router.replace(to);
    if (isNavigationFailureLike(navigation)) {
      throw new Error(navigation.message);
    }
    route = navigation;
  }

  await router.isReady();
  route = router.currentRoute.value.fullPath === route.fullPath ? router.currentRoute.value : router.resolve(route.fullPath);

  return {
    html: await renderMatchedRoute(route, router, 0),
    route
  };
}

export async function hydrateRoute(router: Router, target: Element, to: RouteLocationRaw = router.currentRoute.value.fullPath): Promise<MikuruRouteHydrationResult> {
  const targetRoute = router.resolve(to);
  let route = targetRoute;

  if (router.currentRoute.value.fullPath !== targetRoute.fullPath) {
    const navigation = await router.replace(to);
    if (isNavigationFailureLike(navigation)) {
      throw new Error(navigation.message);
    }
    route = navigation;
  }

  await router.isReady();
  route = router.currentRoute.value.fullPath === route.fullPath ? router.currentRoute.value : router.resolve(route.fullPath);
  return hydrateMatchedRoute(route, router, 0, target);
}

async function renderMatchedRoute(route: RouteLocation, router: Router, depth: number): Promise<string> {
  const record = route.matchedRecords[depth];
  if (!record) {
    return "";
  }

  const component = await resolveSsrRouteComponent(record);
  const props = {
    ...resolveSsrRouteProps(record, route),
    route,
    router,
    children: () => renderMatchedRoute(route, router, depth + 1),
    slots: {
      default: () => renderMatchedRoute(route, router, depth + 1)
    }
  };

  return renderComponentToString(component, props);
}

async function hydrateMatchedRoute(route: RouteLocation, router: Router, depth: number, target: Element): Promise<MikuruRouteHydrationResult> {
  const record = route.matchedRecords[depth];
  if (!record) {
    return {
      element: target,
      route,
      unmount() {}
    };
  }

  const component = await resolveHydrationRouteComponent(record);
  const cleanups: Array<() => void> = [];
  const props = {
    ...resolveSsrRouteProps(record, route),
    route,
    router,
    children: (childTarget?: Element) => childTarget ? trackHydratedChild(cleanups, hydrateMatchedRoute(route, router, depth + 1, childTarget)) : Promise.resolve(""),
    slots: {
      default: (childTarget?: Element) => childTarget ? trackHydratedChild(cleanups, hydrateMatchedRoute(route, router, depth + 1, childTarget)) : Promise.resolve("")
    }
  };

  let instance: MikuruHydrationInstance;
  if (component.hydrate) {
    instance = await component.hydrate(target, props);
  } else if (component.mount) {
    const parent = target.parentNode;
    const anchor = target.ownerDocument.createComment("mikuru-route-hydrate");
    parent?.insertBefore(anchor, target);
    target.remove();
    const fragment = target.ownerDocument.createDocumentFragment();
    instance = component.mount(fragment, props);
    parent?.insertBefore(fragment, anchor);
    anchor.remove();
  } else {
    throw new TypeError(`Route ${record.path} does not have hydrate() or mount().`);
  }

  return {
    element: instance.element,
    route,
    unmount() {
      for (const cleanup of cleanups.splice(0).reverse()) cleanup();
      instance.unmount();
    }
  };
}

async function trackHydratedChild(cleanups: Array<() => void>, promise: Promise<MikuruRouteHydrationResult>): Promise<string> {
  const child = await promise;
  cleanups.push(() => child.unmount());
  return "";
}

async function resolveSsrRouteComponent(record: RouteRecord): Promise<MikuruSsrComponent> {
  const cached = record.__mikuru_resolvedComponent as unknown;
  if (isSsrComponent(cached)) {
    return cached;
  }

  const component = record.component as unknown;
  if (isSsrComponent(component)) {
    record.__mikuru_resolvedComponent = component as unknown as RouteRecord["__mikuru_resolvedComponent"];
    return component;
  }

  if (typeof component === "function") {
    const loaded = await component();
    const resolved = isSsrComponent(loaded) ? loaded : isSsrComponent((loaded as { default?: unknown })?.default) ? (loaded as { default: MikuruSsrComponent }).default : undefined;
    if (resolved) {
      record.__mikuru_resolvedComponent = resolved as unknown as RouteRecord["__mikuru_resolvedComponent"];
      return resolved;
    }
  }

  throw new TypeError(`Route ${record.path} does not have an SSR renderToString component.`);
}

async function resolveHydrationRouteComponent(record: RouteRecord): Promise<MikuruHydrationComponent> {
  const cached = record.__mikuru_resolvedComponent as unknown;
  if (isHydrationComponent(cached)) {
    return cached;
  }

  const component = record.component as unknown;
  if (isHydrationComponent(component)) {
    record.__mikuru_resolvedComponent = component as unknown as RouteRecord["__mikuru_resolvedComponent"];
    return component;
  }

  if (typeof component === "function") {
    const loaded = await component();
    const resolved = isHydrationComponent(loaded)
      ? loaded
      : isHydrationComponent((loaded as { default?: unknown })?.default)
        ? (loaded as { default: MikuruHydrationComponent }).default
        : undefined;
    if (resolved) {
      record.__mikuru_resolvedComponent = resolved as unknown as RouteRecord["__mikuru_resolvedComponent"];
      return resolved;
    }
  }

  throw new TypeError(`Route ${record.path} does not have a hydration component.`);
}

function resolveSsrRouteProps(record: RouteRecord, route: RouteLocation): Record<string, unknown> {
  if (record.props === true) return { ...route.params };
  if (typeof record.props === "function") return record.props(route) ?? {};
  if (record.props && typeof record.props === "object") return { ...record.props };
  return {};
}

function isSsrComponent(component: unknown): component is MikuruSsrComponent {
  return !!component && typeof component === "object" && typeof (component as MikuruSsrComponent).renderToString === "function";
}

function isHydrationComponent(component: unknown): component is MikuruHydrationComponent {
  return !!component
    && typeof component === "object"
    && (typeof (component as MikuruHydrationComponent).hydrate === "function"
      || typeof (component as MikuruHydrationComponent).mount === "function");
}

function isNavigationFailureLike(value: unknown): value is NavigationFailure {
  return !!value && typeof value === "object" && typeof (value as NavigationFailure).type === "string" && typeof (value as NavigationFailure).message === "string";
}
