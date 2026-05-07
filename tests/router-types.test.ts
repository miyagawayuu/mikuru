import { describe, expect, it } from "vitest";

import { createMemoryHistory, createRouter, defineRoutes } from "../src/router/index.js";
import type { RouteLocationForName, RouteNames, RouteParamNames } from "../src/router/index.js";

function expectType<T>(_value: T): void {
  // Type-only assertion helper.
}

describe("router type helpers", () => {
  it("returns the route array unchanged at runtime", () => {
    const routes = [{ path: "/", name: "home" }];

    expect(defineRoutes(routes)).toBe(routes);
  });

  it("infers route names and params from defined routes", () => {
    const routes = defineRoutes([
      { path: "/", name: "home" },
      { path: "/users/:id", name: "user" },
      { path: "/tags/:tags+", name: "tags" },
      { path: "/files/:pathMatch(.*)*", name: "files" },
      {
        path: "/settings/:section",
        name: "settings",
        children: [{ path: "billing/:invoiceId?", name: "settings-billing" }]
      }
    ] as const);

    expectType<RouteNames<typeof routes>>("home");
    expectType<RouteNames<typeof routes>>("settings-billing");
    expectType<RouteParamNames<"/users/:id">>("id");
    expectType<RouteParamNames<"/tags/:tags+">>("tags");
    expectType<RouteParamNames<"/files/:pathMatch(.*)*">>("pathMatch");
    expectType<RouteLocationForName<typeof routes, "home">>({ name: "home" });
    expectType<RouteLocationForName<typeof routes, "user">>({ name: "user", params: { id: "42" } });
    expectType<RouteLocationForName<typeof routes, "tags">>({ name: "tags", params: { tags: ["design", "system"] } });
    expectType<RouteLocationForName<typeof routes, "files">>({ name: "files" });
    expectType<RouteLocationForName<typeof routes, "files">>({ name: "files", params: { pathMatch: ["docs", "router"] } });
    expectType<RouteLocationForName<typeof routes, "settings-billing">>({
      name: "settings-billing",
      params: { section: "account" }
    });
    expectType<RouteLocationForName<typeof routes, "settings-billing">>({
      name: "settings-billing",
      params: { section: "account", invoiceId: "latest" }
    });

    // @ts-expect-error unknown route names are rejected by RouteLocationForName.
    expectType<RouteLocationForName<typeof routes, "missing">>({ name: "missing" });
    // @ts-expect-error named routes with params require params.
    expectType<RouteLocationForName<typeof routes, "user">>({ name: "user" });
    // @ts-expect-error param keys are inferred from the route path.
    expectType<RouteLocationForName<typeof routes, "user">>({ name: "user", params: { slug: "42" } });
    // @ts-expect-error repeat params use arrays.
    expectType<RouteLocationForName<typeof routes, "tags">>({ name: "tags", params: { tags: "design" } });
    // @ts-expect-error nested route params include parent params.
    expectType<RouteLocationForName<typeof routes, "settings-billing">>({ name: "settings-billing", params: { invoiceId: "latest" } });

    expect(routes).toHaveLength(5);
  });

  it("accepts defined routes in createRouter", () => {
    const routes = defineRoutes([
      { path: "/", name: "home" },
      { path: "/users/:id", name: "user" }
    ] as const);

    const router = createRouter({
      history: createMemoryHistory("/"),
      routes
    });

    expect(router.resolve({ name: "user", params: { id: "42" } }).path).toBe("/users/42");
  });
});
