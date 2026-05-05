import { ref } from "mikuru/runtime";

import { guardRoute, type RouteDefinition, type RouteName } from "./authGuard.js";

const routes: RouteDefinition[] = [
  {
    name: "dashboard",
    path: "/",
    title: "Release task board"
  },
  {
    name: "login",
    path: "/login",
    title: "Login"
  },
  {
    name: "admin",
    path: "/admin",
    title: "Protected admin",
    requiresAuth: true
  }
];

export function createRouter() {
  const currentPage = ref<RouteName>("dashboard");
  const currentPath = ref("/");
  const redirectTarget = ref("/");

  function start() {
    resolveCurrentLocation();
    window.addEventListener("popstate", resolveCurrentLocation);

    return () => {
      window.removeEventListener("popstate", resolveCurrentLocation);
    };
  }

  function navigate(path: string) {
    window.history.pushState({}, "", path);
    resolveCurrentLocation();
  }

  function resolveCurrentLocation() {
    const path = normalizePath(window.location.pathname);
    const route = matchRoute(path);
    const guarded = guardRoute(route);

    if (!guarded.allow) {
      window.history.replaceState({}, "", guarded.redirectTo);
      currentPage.value = "login";
      currentPath.value = "/login";
      redirectTarget.value = route.path;
      return;
    }

    currentPage.value = guarded.route.name;
    currentPath.value = path;
    redirectTarget.value = getRedirectTarget(window.location.search);
    document.title = `${guarded.route.title} | Mikuru Realworld`;
  }

  return {
    currentPage,
    currentPath,
    redirectTarget,
    start,
    navigate
  };
}

function matchRoute(path: string): RouteDefinition {
  return (
    routes.find((route) => route.path === path) ?? {
      name: "notFound",
      path,
      title: "Not found"
    }
  );
}

function normalizePath(path: string): string {
  return path === "" ? "/" : path;
}

function getRedirectTarget(search: string): string {
  const params = new URLSearchParams(search);
  const redirect = params.get("redirect");

  return redirect?.startsWith("/") ? redirect : "/";
}
