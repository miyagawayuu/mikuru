import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";

import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  isNavigationFailure,
  NavigationFailureType,
  RouterLink,
  RouterView
} from "../src/router/index.js";
import type { NavigationResult, RouteComponent, RouteLocation } from "../src/router/index.js";

function textComponent(text: string): RouteComponent {
  return {
    mount(target) {
      const element = document.createElement("p");
      element.textContent = text;
      target.appendChild(element);
      return {
        element,
        unmount() {
          element.remove();
        }
      };
    }
  };
}

function expectRoute(result: NavigationResult): RouteLocation {
  expect(isNavigationFailure(result)).toBe(false);
  if (isNavigationFailure(result)) throw new Error(result.message);
  return result;
}

describe("router", () => {
  it("matches dynamic params and parses query and hash", () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/users/:id", name: "user" }]
    });

    const route = router.resolve("/users/42?tab=posts&tag=a&tag=b#bio");

    expect(route).toMatchObject({
      path: "/users/42",
      fullPath: "/users/42?tab=posts&tag=a&tag=b#bio",
      name: "user",
      params: { id: "42" },
      hash: "#bio"
    });
    expect(route.query).toEqual({ tab: "posts", tag: ["a", "b"] });
  });

  it("navigates with guards and after hooks", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/" }, { path: "/login" }, { path: "/admin" }]
    });
    const after: string[] = [];

    router.beforeEach((to) => {
      if (to.path === "/admin") return "/login";
      return undefined;
    });
    router.afterEach((to, from) => {
      after.push(`${from.path}->${to.path}`);
    });

    const route = expectRoute(await router.push("/admin"));

    expect(route.path).toBe("/login");
    expect(router.currentRoute.value.path).toBe("/login");
    expect(after).toEqual(["/->/login"]);
  });

  it("navigates with route location objects", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/" }, { path: "/users/:id" }]
    });

    const route = expectRoute(await router.push({ path: "/users/7", query: { tab: "details", tag: ["a", "b"] }, hash: "bio" }));

    expect(route.fullPath).toBe("/users/7?tab=details&tag=a&tag=b#bio");
    expect(route.params).toEqual({ id: "7" });
    expect(route.query).toEqual({ tab: "details", tag: ["a", "b"] });
    expect(route.hash).toBe("#bio");
  });

  it("resolves named routes with params", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/users/:id", name: "user" }]
    });

    const route = expectRoute(await router.push({ name: "user", params: { id: 9 }, query: { tab: "profile" } }));

    expect(route.fullPath).toBe("/users/9?tab=profile");
    expect(route.name).toBe("user");
    expect(route.params).toEqual({ id: "9" });
  });

  it("follows route redirects", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [
        { path: "/" },
        { path: "/old", redirect: "/new?from=old" },
        { path: "/legacy/:id", redirect: (to) => ({ name: "user", params: { id: to.params.id } }) },
        { path: "/new", name: "new" },
        { path: "/users/:id", name: "user" }
      ]
    });

    const staticRoute = expectRoute(await router.push("/old"));
    const dynamicRoute = expectRoute(await router.push("/legacy/42"));

    expect(staticRoute.fullPath).toBe("/new?from=old");
    expect(staticRoute.name).toBe("new");
    expect(dynamicRoute.fullPath).toBe("/users/42");
    expect(dynamicRoute.name).toBe("user");
  });

  it("detects redirect loops", () => {
    const router = createRouter({
      history: createMemoryHistory("/safe"),
      routes: [
        { path: "/safe" },
        { path: "/", redirect: "/one" },
        { path: "/one", redirect: "/two" },
        { path: "/two", redirect: "/one" }
      ]
    });

    expect(() => router.resolve("/")).toThrow("Too many route redirects.");
  });

  it("matches route aliases", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [
        { path: "/", name: "home", alias: ["/home", "/start"] },
        { path: "/users/:id", name: "user", alias: "/members/:id" }
      ]
    });

    const home = router.resolve("/start");
    const user = expectRoute(await router.push("/members/42"));

    expect(home.path).toBe("/start");
    expect(home.name).toBe("home");
    expect(user.path).toBe("/members/42");
    expect(user.name).toBe("user");
    expect(user.params).toEqual({ id: "42" });
    expect(router.resolve({ name: "user", params: { id: "7" } }).path).toBe("/users/7");
  });

  it("matches nested route records for nested RouterView depth", () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [
        {
          path: "/settings",
          name: "settings",
          alias: "/preferences",
          component: textComponent("Settings"),
          children: [{ path: "profile", name: "settings-profile", component: textComponent("Profile") }]
        }
      ]
    });

    const route = router.resolve({ name: "settings-profile" });
    const aliasRoute = router.resolve("/preferences/profile");

    expect(route.fullPath).toBe("/settings/profile");
    expect(route.matchedRecords.map((record) => record.name)).toEqual(["settings", "settings-profile"]);
    expect(aliasRoute.fullPath).toBe("/preferences/profile");
    expect(aliasRoute.matchedRecords.map((record) => record.name)).toEqual(["settings", "settings-profile"]);
  });

  it("adds and removes routes dynamically", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/", name: "home" }]
    });

    expect(router.hasRoute("about")).toBe(false);
    expect(() => router.resolve({ name: "about" })).toThrow("Unknown route name: about");

    const removeAbout = router.addRoute({ path: "/about", name: "about", alias: "/company" });
    const route = expectRoute(await router.push({ name: "about" }));

    expect(router.hasRoute("about")).toBe(true);
    expect(route.path).toBe("/about");
    expect(router.resolve("/company").name).toBe("about");

    removeAbout();

    expect(router.hasRoute("about")).toBe(false);
    expect(router.removeRoute("about")).toBe(false);
    expect(() => router.resolve({ name: "about" })).toThrow("Unknown route name: about");
  });

  it("adds nested routes dynamically", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/settings", name: "settings", alias: "/preferences" }]
    });

    const removeBilling = router.addRoute("settings", {
      path: "billing",
      name: "settings-billing",
      component: textComponent("Billing")
    });
    const route = expectRoute(await router.push({ name: "settings-billing" }));
    const aliasRoute = router.resolve("/preferences/billing");

    expect(route.fullPath).toBe("/settings/billing");
    expect(route.matchedRecords.map((record) => record.name)).toEqual(["settings", "settings-billing"]);
    expect(aliasRoute.matchedRecords.map((record) => record.name)).toEqual(["settings", "settings-billing"]);

    removeBilling();

    expect(router.hasRoute("settings-billing")).toBe(false);
    expect(() => router.addRoute("missing", { path: "child", name: "missing-child" })).toThrow("Unknown route name: missing");
  });

  it("updates the current route when dynamic routes change", async () => {
    const router = createRouter({
      history: createMemoryHistory("/late"),
      routes: [{ path: "/", name: "home" }],
      notFound: textComponent("Not found")
    });

    expect(router.currentRoute.value.name).toBe("not-found");

    router.addRoute({ path: "/late", name: "late" });

    expect(router.currentRoute.value.name).toBe("late");
    expect(router.currentRoute.value.path).toBe("/late");

    router.removeRoute("late");

    expect(router.currentRoute.value.name).toBe("not-found");
  });

  it("keeps route table unchanged when dynamic routes are invalid", () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/", name: "home" }]
    });

    expect(() => router.addRoute({ path: "/start", name: "home" })).toThrow("Duplicate route name: home");
    expect(router.resolve({ name: "home" }).path).toBe("/");
    expect(router.routes.map((route) => route.path)).toEqual(["/"]);
  });

  it("supports memory back and forward navigation", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/" }, { path: "/one" }, { path: "/two" }]
    });
    const stop = router.listen();

    expectRoute(await router.push("/one"));
    expectRoute(await router.push("/two"));
    router.back();
    expect(router.currentRoute.value.path).toBe("/one");
    router.forward();
    expect(router.currentRoute.value.path).toBe("/two");
    stop();
  });

  it("returns duplicated navigation failures without changing history", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/" }, { path: "/one" }]
    });
    const after: string[] = [];

    router.afterEach((to, from, failure) => {
      after.push(`${from.path}->${to.path}:${failure?.type ?? "ok"}`);
    });

    const failure = await router.push("/");
    const route = expectRoute(await router.push("/one"));

    expect(isNavigationFailure(failure, NavigationFailureType.duplicated)).toBe(true);
    expect(failure).toMatchObject({ type: "duplicated" });
    expect(route.path).toBe("/one");
    expect(after).toEqual(["/->/one:ok"]);
  });

  it("returns aborted navigation failures from guards", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/" }, { path: "/blocked" }]
    });
    const after: string[] = [];

    router.beforeEach((to) => {
      if (to.path === "/blocked") return false;
      return undefined;
    });
    router.afterEach((to, from, failure) => {
      after.push(`${from.path}->${to.path}:${failure?.type ?? "ok"}`);
    });

    const failure = await router.push("/blocked");

    expect(isNavigationFailure(failure, NavigationFailureType.aborted)).toBe(true);
    expect(router.currentRoute.value.path).toBe("/");
    expect(after).toEqual(["/->/blocked:aborted"]);
  });

  it("returns cancelled navigation failures for superseded async guards", async () => {
    let releaseGuard: (() => void) | undefined;
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/" }, { path: "/slow" }, { path: "/fast" }]
    });

    router.beforeEach((to) => {
      if (to.path !== "/slow") return undefined;
      return new Promise<void>((resolve) => {
        releaseGuard = resolve;
      });
    });

    const slow = router.push("/slow");
    const fast = expectRoute(await router.push("/fast"));
    releaseGuard?.();
    const failure = await slow;

    expect(fast.path).toBe("/fast");
    expect(isNavigationFailure(failure, NavigationFailureType.cancelled)).toBe(true);
    expect(router.currentRoute.value.path).toBe("/fast");
  });

  it("renders RouterView and RouterLink runtime components", async () => {
    const window = new Window();
    const previousDocument = globalThis.document;
    const previousLocation = globalThis.location;
    const previousHistory = globalThis.history;

    try {
      Object.defineProperty(globalThis, "document", { configurable: true, value: window.document });
      Object.defineProperty(globalThis, "location", { configurable: true, value: window.location });
      Object.defineProperty(globalThis, "history", { configurable: true, value: window.history });

      const router = createRouter({
        history: createMemoryHistory("/"),
        routes: [
          { path: "/", component: textComponent("Home") },
          { path: "/about", component: textComponent("About") }
        ]
      });
      const root = document.createElement("main");

      RouterLink.mount(root, { router, to: "/about", label: "About" });
      RouterView.mount(root, { router });
      document.body.appendChild(root);

      expect(root.textContent).toContain("AboutHome");
      root.querySelector("a")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }) as unknown as Event);
      await Promise.resolve();

      expect(router.currentRoute.value.path).toBe("/about");
      expect(root.textContent).toContain("AboutAbout");
      expect(root.querySelector("a")?.getAttribute("aria-current")).toBe("page");
      expect(root.querySelector("a")?.classList.contains("router-link-active")).toBe(true);
      expect(root.querySelector("a")?.classList.contains("router-link-exact-active")).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
      Object.defineProperty(globalThis, "location", { configurable: true, value: previousLocation });
      Object.defineProperty(globalThis, "history", { configurable: true, value: previousHistory });
    }
  });

  it("supports RouterLink replace and custom active classes", async () => {
    const window = new Window();
    const previousDocument = globalThis.document;
    const previousLocation = globalThis.location;
    const previousHistory = globalThis.history;

    try {
      Object.defineProperty(globalThis, "document", { configurable: true, value: window.document });
      Object.defineProperty(globalThis, "location", { configurable: true, value: window.location });
      Object.defineProperty(globalThis, "history", { configurable: true, value: window.history });

      const history = createMemoryHistory("/");
      const router = createRouter({
        history,
        routes: [{ path: "/" }, { path: "/settings" }, { path: "/settings/profile" }]
      });
      const root = document.createElement("main");

      RouterLink.mount(root, {
        router,
        to: "/settings",
        label: "Settings",
        replace: true,
        activeClass: "is-active",
        exactActiveClass: "is-exact"
      });
      document.body.appendChild(root);
      root.querySelector("a")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }) as unknown as Event);
      await Promise.resolve();

      expect(router.currentRoute.value.path).toBe("/settings");
      expect(root.querySelector("a")?.classList.contains("is-active")).toBe(true);
      expect(root.querySelector("a")?.classList.contains("is-exact")).toBe(true);

      expectRoute(await router.push("/settings/profile"));
      expect(root.querySelector("a")?.classList.contains("is-active")).toBe(true);
      expect(root.querySelector("a")?.classList.contains("is-exact")).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
      Object.defineProperty(globalThis, "location", { configurable: true, value: previousLocation });
      Object.defineProperty(globalThis, "history", { configurable: true, value: previousHistory });
    }
  });

  it("renders RouterLink children instead of label text", () => {
    const window = new Window();
    const previousDocument = globalThis.document;

    try {
      Object.defineProperty(globalThis, "document", { configurable: true, value: window.document });

      const router = createRouter({
        history: createMemoryHistory("/"),
        routes: [{ path: "/" }]
      });
      const root = document.createElement("main");

      RouterLink.mount(root, {
        router,
        to: "/",
        children(target: Element) {
          const strong = document.createElement("strong");
          strong.textContent = "Slot Home";
          target.appendChild(strong);
          return () => strong.remove();
        }
      });

      expect(root.querySelector("a")?.textContent).toBe("Slot Home");
      expect(root.querySelector("strong")?.textContent).toBe("Slot Home");
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
    }
  });

  it("creates hash hrefs for browser hash history", () => {
    const window = new Window();
    const previousLocation = globalThis.location;
    const previousHistory = globalThis.history;

    try {
      Object.defineProperty(globalThis, "location", { configurable: true, value: window.location });
      Object.defineProperty(globalThis, "history", { configurable: true, value: window.history });

      const history = createWebHashHistory();

      expect(history.createHref("/settings?tab=profile")).toBe("#/settings?tab=profile");
    } finally {
      Object.defineProperty(globalThis, "location", { configurable: true, value: previousLocation });
      Object.defineProperty(globalThis, "history", { configurable: true, value: previousHistory });
    }
  });
});
