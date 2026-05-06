import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";

import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  RouterLink,
  RouterView
} from "../src/router/index.js";
import type { RouteComponent } from "../src/router/index.js";

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

    const route = await router.push("/admin");

    expect(route.path).toBe("/login");
    expect(router.currentRoute.value.path).toBe("/login");
    expect(after).toEqual(["/->/login"]);
  });

  it("navigates with route location objects", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/" }, { path: "/users/:id" }]
    });

    const route = await router.push({ path: "/users/7", query: { tab: "details", tag: ["a", "b"] }, hash: "bio" });

    expect(route.fullPath).toBe("/users/7?tab=details&tag=a&tag=b#bio");
    expect(route.params).toEqual({ id: "7" });
    expect(route.query).toEqual({ tab: "details", tag: ["a", "b"] });
    expect(route.hash).toBe("#bio");
  });

  it("supports memory back and forward navigation", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/" }, { path: "/one" }, { path: "/two" }]
    });
    const stop = router.listen();

    await router.push("/one");
    await router.push("/two");
    router.back();
    expect(router.currentRoute.value.path).toBe("/one");
    router.forward();
    expect(router.currentRoute.value.path).toBe("/two");
    stop();
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

      await router.push("/settings/profile");
      expect(root.querySelector("a")?.classList.contains("is-active")).toBe(true);
      expect(root.querySelector("a")?.classList.contains("is-exact")).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
      Object.defineProperty(globalThis, "location", { configurable: true, value: previousLocation });
      Object.defineProperty(globalThis, "history", { configurable: true, value: previousHistory });
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
