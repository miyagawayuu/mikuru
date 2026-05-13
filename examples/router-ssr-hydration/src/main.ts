import { renderToString as renderShellToString } from "./Shell.mikuru?ssr";
import ShellHydrate from "./Shell.mikuru?hydrate";
import { renderToString as renderHomeToString } from "./HomePage.mikuru?ssr";
import HomeHydrate from "./HomePage.mikuru?hydrate";
import { renderToString as renderUserToString } from "./UserPage.mikuru?ssr";
import UserHydrate from "./UserPage.mikuru?hydrate";
import { renderToString as renderSettingsToString } from "./SettingsPage.mikuru?ssr";
import SettingsHydrate from "./SettingsPage.mikuru?hydrate";
import { renderToString as renderProfileToString } from "./ProfilePage.mikuru?ssr";
import ProfileHydrate from "./ProfilePage.mikuru?hydrate";
import { renderToString as renderLoginToString } from "./LoginPage.mikuru?ssr";
import LoginHydrate from "./LoginPage.mikuru?hydrate";
import { renderToString as renderNotFoundToString } from "./NotFoundPage.mikuru?ssr";
import NotFoundHydrate from "./NotFoundPage.mikuru?hydrate";
import { createMemoryHistory, createRouter, createWebHistory } from "mikuru/router";
import { hydrateRoute, renderRouteToString } from "mikuru/server";
import type { RouteComponent, RouteLocation, RouteRecord, Router } from "mikuru/router";
import type { MikuruRouteHydrationResult, MikuruSsrComponent } from "mikuru/server";

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

const root = document.getElementById("route-root");
const modalRoot = document.getElementById("route-modal-root");
const status = document.getElementById("route-status");

if (!root || !modalRoot || !status) {
  throw new Error("Missing router SSR hydration example roots");
}

const ssrComponents: RouteComponents = {
  shell: { renderToString: renderShellToString },
  home: { renderToString: renderHomeToString },
  user: { renderToString: renderUserToString },
  settings: { renderToString: renderSettingsToString },
  profile: { renderToString: renderProfileToString },
  login: { renderToString: renderLoginToString },
  notFound: { renderToString: renderNotFoundToString },
  lazy: async () => {
    const module = await import("./LazyPage.mikuru?ssr");
    return { renderToString: module.renderToString };
  }
};

const hydrationComponents: RouteComponents = {
  shell: ShellHydrate,
  home: HomeHydrate,
  user: UserHydrate,
  settings: SettingsHydrate,
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
applyTeleports(initialResult.teleports);
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
          children: [
            { path: "profile", name: "settings-profile", component: components.profile as RouteComponent },
            { path: "lazy", name: "settings-lazy", component: components.lazy as RouteRecord["component"] }
          ]
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

async function renderRouteHtml(path: string) {
  return renderRouteToString(createSsrRouter(path), path, { teleports: {} });
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
    applyTeleports(rendered.teleports);
    routeInstance = await hydrateExistingRoute(clientRouter, rendered.route.fullPath);
    status!.textContent = label;
  } finally {
    hydratingNavigation = false;
  }
}

function applyTeleports(teleports: Record<string, string>): void {
  modalRoot!.innerHTML = teleports["#route-modal-root"] ?? "";
}
