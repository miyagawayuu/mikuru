import { renderToString as renderHomeToString } from "./HomePage.mikuru?ssr";
import HomeHydrate from "./HomePage.mikuru?hydrate";
import { renderToString as renderUserToString } from "./UserPage.mikuru?ssr";
import UserHydrate from "./UserPage.mikuru?hydrate";
import { renderToString as renderProfileToString } from "./ProfilePage.mikuru?ssr";
import ProfileHydrate from "./ProfilePage.mikuru?hydrate";
import { renderToString as renderLoginToString } from "./LoginPage.mikuru?ssr";
import LoginHydrate from "./LoginPage.mikuru?hydrate";
import { renderToString as renderNotFoundToString } from "./NotFoundPage.mikuru?ssr";
import NotFoundHydrate from "./NotFoundPage.mikuru?hydrate";
import { createMemoryHistory, createRouter, createWebHistory } from "mikuru/router";
import { escapeHtml, hydrateRoute, renderRouteToString } from "mikuru/server";
import type { RouteComponent, RouteLocation, RouteRecord, Router } from "mikuru/router";
import type { MikuruHydrationInstance, MikuruRouteHydrationResult, MikuruSsrComponent } from "mikuru/server";

import "./style.css";

type RouteComponents = {
  shell: RouteComponent | MikuruSsrComponent;
  home: RouteComponent | MikuruSsrComponent;
  user: RouteComponent | MikuruSsrComponent;
  settings: RouteComponent | MikuruSsrComponent;
  profile: RouteComponent | MikuruSsrComponent;
  login: RouteComponent | MikuruSsrComponent;
  notFound: RouteComponent | MikuruSsrComponent;
  lazy: () => Promise<RouteComponent | MikuruSsrComponent | { default: RouteComponent | MikuruSsrComponent }>;
};
type HydrationRouteComponent = {
  hydrate(target: Element, props?: Record<string, unknown>): MikuruHydrationInstance | Promise<MikuruHydrationInstance>;
  mount(target: Element | DocumentFragment, props?: Record<string, unknown>): MikuruHydrationInstance;
};

const root = document.getElementById("route-root");
const status = document.getElementById("route-status");

if (!root || !status) {
  throw new Error("Missing router SSR hydration example roots");
}

const ssrComponents: RouteComponents = {
  shell: createShellSsrComponent(),
  home: { renderToString: renderHomeToString },
  user: { renderToString: renderUserToString },
  settings: createSettingsSsrComponent(),
  profile: { renderToString: renderProfileToString },
  login: { renderToString: renderLoginToString },
  notFound: { renderToString: renderNotFoundToString },
  lazy: async () => {
    const module = await import("./LazyPage.mikuru?ssr");
    return { renderToString: module.renderToString };
  }
};

const hydrationComponents: RouteComponents = {
  shell: createShellHydrationComponent(),
  home: HomeHydrate,
  user: UserHydrate,
  settings: createSettingsHydrationComponent(),
  profile: ProfileHydrate,
  login: LoginHydrate,
  notFound: NotFoundHydrate,
  lazy: () => import("./LazyPage.mikuru?hydrate")
};

const initialPath = currentBrowserPath();
const clientRouter = createHydrationRouter(initialPath);
let routeInstance: MikuruRouteHydrationResult | undefined;
let hydratingNavigation = false;

clientRouter.afterEach((to, _from, failure) => {
  if (failure || hydratingNavigation) return;
  void renderAndHydrateRoute(to.fullPath, `navigated:${to.fullPath}`);
});

const initialResult = await renderRouteHtml(initialPath);
root.innerHTML = initialResult.html;
routeInstance = await hydrateExistingRoute(clientRouter, initialResult.route.fullPath);
status.textContent = `hydrated:${routeInstance.route.fullPath}`;
const stopListening = clientRouter.listen();

window.addEventListener("beforeunload", () => {
  stopListening();
  routeInstance?.unmount();
});

function currentBrowserPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function createSsrRouter(path: string): Router {
  const router = createRouter({
    history: createMemoryHistory(path),
    routes: createRoutes(ssrComponents),
    notFound: ssrComponents.notFound as RouteComponent
  });
  installGuards(router);
  return router;
}

function createHydrationRouter(path: string): Router {
  const router = createRouter({
    history: createWebHistory(),
    routes: createRoutes(hydrationComponents),
    notFound: hydrationComponents.notFound as RouteComponent
  });
  installGuards(router);
  if (router.currentRoute.value.fullPath !== path) {
    window.history.replaceState({}, "", path);
  }
  return router;
}

function createRoutes(components: RouteComponents): RouteRecord[] {
  const userRoute = { name: "user", params: { id: "42" }, query: { tab: "profile" } };
  return [
    {
      path: "/",
      component: components.shell as RouteComponent,
      children: [
        { path: "", name: "home", component: components.home as RouteComponent },
        { path: "legacy-user", redirect: userRoute },
        {
          path: "users/:id",
          name: "user",
          component: components.user as RouteComponent,
          props: (route) => ({ id: route.params.id, tab: route.query.tab })
        },
        { path: "lazy", name: "lazy", component: components.lazy as RouteRecord["component"] },
        { path: "admin", name: "admin", meta: { requiresAuth: true }, component: components.user as RouteComponent },
        {
          path: "settings",
          name: "settings",
          component: components.settings as RouteComponent,
          children: [{ path: "profile", name: "settings-profile", component: components.profile as RouteComponent }]
        },
        { path: "login", name: "login", component: components.login as RouteComponent }
      ]
    }
  ];
}

function installGuards(router: Router): void {
  router.beforeEach((to: RouteLocation) => {
    if (to.meta.requiresAuth) {
      return { name: "login", query: { redirect: to.fullPath } };
    }
    return undefined;
  });
}

function createShellSsrComponent(): MikuruSsrComponent {
  return {
    async renderToString(props = {}) {
      const router = props.router as Router;
      const route = props.route as RouteLocation;
      const child = typeof props.children === "function" ? await props.children({ __mikuru_context: props.__mikuru_context }) : "";
      return `<main class="router-shell" data-testid="router-shell" data-route="${escapeHtml(route.fullPath)}">
    <header>
      <h1>Router SSR Hydration</h1>
      <p>Current route: ${escapeHtml(route.fullPath)}</p>
      <nav aria-label="Router SSR routes">
        ${renderNavLink(router, "/", "Home", "home")}
        ${renderNavLink(router, { name: "user", params: { id: "42" }, query: { tab: "profile" } }, "User", "user")}
        ${renderNavLink(router, "/legacy-user", "Redirect", "redirect")}
        ${renderNavLink(router, { name: "settings-profile" }, "Settings", "settings")}
        ${renderNavLink(router, { name: "lazy" }, "Lazy", "lazy")}
        ${renderNavLink(router, { name: "admin" }, "Admin", "admin")}
        ${renderNavLink(router, "/missing", "Missing", "missing")}
      </nav>
    </header>
    <section class="route-outlet" data-testid="route-outlet" data-route-outlet>${child}</section>
  </main>`;
    }
  };
}

function createShellHydrationComponent(): RouteComponent {
  const component: HydrationRouteComponent = {
    async hydrate(target: Element, props: Record<string, unknown> = {}) {
      const router = props.router as Router;
      const outlet = target.querySelector("[data-route-outlet]");
      if (!outlet?.firstElementChild) {
        throw new Error("Missing route outlet for hydration");
      }
      await (props.children as (target: Element, slotProps?: Record<string, unknown>) => Promise<unknown>)(outlet.firstElementChild, { __mikuru_context: props.__mikuru_context });
      const links = Array.from(target.querySelectorAll<HTMLAnchorElement>("[data-nav]"));
      const onClick = (event: Event) => {
        const link = event.currentTarget as HTMLAnchorElement;
        event.preventDefault();
        void router.push(navTarget(link.dataset.nav));
      };
      for (const link of links) link.addEventListener("click", onClick);
      return {
        element: target,
        unmount() {
          for (const link of links) link.removeEventListener("click", onClick);
        }
      };
    },
    mount() {
      throw new Error("Shell route is SSR/hydration only in this example.");
    }
  };
  return component as unknown as RouteComponent;
}

function createSettingsSsrComponent(): MikuruSsrComponent {
  return {
    async renderToString(props = {}) {
      const child = typeof props.children === "function" ? await props.children({ __mikuru_context: props.__mikuru_context }) : "";
      return `<section class="route-page"><h2>Settings</h2><div data-settings-outlet>${child}</div></section>`;
    }
  };
}

function createSettingsHydrationComponent(): RouteComponent {
  const component: HydrationRouteComponent = {
    async hydrate(target: Element, props: Record<string, unknown> = {}) {
      const outlet = target.querySelector("[data-settings-outlet]");
      if (outlet?.firstElementChild) {
        await (props.children as (target: Element, slotProps?: Record<string, unknown>) => Promise<unknown>)(outlet.firstElementChild, { __mikuru_context: props.__mikuru_context });
      }
      return { element: target, unmount() {} };
    },
    mount() {
      throw new Error("Settings route is SSR/hydration only in this example.");
    }
  };
  return component as unknown as RouteComponent;
}

function renderNavLink(router: Router, to: Parameters<Router["createHref"]>[0], label: string, key: string): string {
  return `<a href="${escapeHtml(router.createHref(to))}" data-nav="${key}">${escapeHtml(label)}</a>`;
}

function navTarget(key: string | undefined) {
  switch (key) {
    case "home":
      return "/";
    case "user":
      return { name: "user", params: { id: "42" }, query: { tab: "profile" } };
    case "redirect":
      return "/legacy-user";
    case "settings":
      return { name: "settings-profile" };
    case "lazy":
      return { name: "lazy" };
    case "admin":
      return { name: "admin" };
    case "missing":
      return "/missing";
    default:
      return "/";
  }
}

async function renderRouteHtml(path: string) {
  return renderRouteToString(createSsrRouter(path), path);
}

async function hydrateExistingRoute(router: Router, path: string): Promise<MikuruRouteHydrationResult> {
  const element = root?.firstElementChild;
  if (!element) {
    throw new Error("Route SSR did not render an element");
  }
  return hydrateRoute(router, element, path);
}

async function renderAndHydrateRoute(path: string, label: string): Promise<void> {
  hydratingNavigation = true;
  try {
    routeInstance?.unmount();
    const rendered = await renderRouteHtml(path);
    root!.innerHTML = rendered.html;
    routeInstance = await hydrateExistingRoute(clientRouter, rendered.route.fullPath);
    status!.textContent = label;
  } finally {
    hydratingNavigation = false;
  }
}
