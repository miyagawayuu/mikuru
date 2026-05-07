# Mikuru Router

Mikuru provides a small runtime router from `mikuru/router`. It is designed to work with the existing component contract: route components and router components are plain objects with a `mount(target, props)` method.

## Setup

```ts
import { createRouter, createWebHashHistory } from "mikuru/router";
import HomePage from "./HomePage.mikuru";
import UserPage from "./UserPage.mikuru";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", alias: "/start", component: HomePage },
    { path: "/legacy-user", redirect: { name: "user", params: { id: "42" } } },
    { path: "/users/:id", name: "user", component: UserPage }
  ]
});

router.listen();
```

`createWebHashHistory()` is the simplest browser mode because it does not require server fallback configuration. `createWebHistory()` uses normal history URLs. `createMemoryHistory()` is available for tests and embedded examples.

## RouterView and RouterLink

`RouterView` renders the matched route component. `RouterLink` renders an anchor and calls `router.push()` on click.

```mikuru
<template>
  <main>
    <nav>
      <RouterLink to="/" label="Home" />
      <RouterLink to="/users/42?tab=profile" label="User" />
      <RouterLink :to="{ name: 'user', params: { id: '42' }, query: { tab: 'profile' } }">
        <strong>User</strong>
      </RouterLink>
      <RouterLink to="/settings" label="Settings" :replace="true" activeClass="is-active" exactActiveClass="is-exact" />
    </nav>

    <RouterView />
  </main>
</template>

<script>
import { onBeforeUnmount } from "mikuru";
import { createRouter, createWebHashHistory, provideRouter, RouterLink, RouterView } from "mikuru/router";
import HomePage from "./HomePage.mikuru";
import UserPage from "./UserPage.mikuru";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: HomePage },
    { path: "/users/:id", name: "user", component: UserPage }
  ]
});

provideRouter(router);
const stopRouter = router.listen();
onBeforeUnmount(stopRouter);
</script>
```

`provideRouter(router)` makes `RouterView`, `RouterLink`, `useRouter()`, and `useRoute()` work through the component tree. A direct `router` prop is still accepted and takes priority when you need an explicit router instance.

Route components receive `route` and `router` props from `RouterView`. Components can also call `useRoute()` and `useRouter()` after an ancestor calls `provideRouter(router)`.

```mikuru
<template>
  <section>
    <h2>User {{ route.params.id }}</h2>
    <p>Tab: {{ route.query.tab }}</p>
  </section>
</template>

<script>
import { useRoute } from "mikuru/router";

const route = useRoute();
</script>
```

`route.matched` is the final matched route record. `route.matchedRecords` contains the full parent-to-child chain. `route.meta` is a shallow merge of every matched record's `meta`, with child records overriding parent keys.

## API

- `defineRoutes(routes)` returns a route array unchanged while preserving route name and path literal types.
- `createRouter({ history, routes, notFound? })` creates a router.
- `router.currentRoute` is a `ref` containing the current route.
- `router.push(to)` and `router.replace(to)` navigate programmatically and resolve to either a `RouteLocation` or `NavigationFailure`.
- `router.back()` and `router.forward()` delegate to the configured history.
- `router.resolve(to)` parses a route without navigating.
- `router.preload(to)` resolves lazy route components without navigating.
- `router.beforeEach(fn)` registers a navigation guard and returns an unsubscribe function.
- `router.afterEach(fn)` registers a post-navigation hook and returns an unsubscribe function.
- `router.onError(fn)` registers a handler for uncaught navigation and lazy route loader errors.
- `router.addRoute(record)` adds a top-level route and returns a remove callback.
- `router.addRoute(parentName, record)` adds a nested route under a named parent and returns a remove callback.
- `router.removeRoute(name)` removes a named route and its children.
- `router.hasRoute(name)` checks whether a named route exists.
- `router.listen()` starts syncing browser or memory history events and returns a stop function.
- `provideRouter(router)` provides a router to descendant components.
- `useRouter()` returns the provided router.
- `useRoute()` returns a reactive proxy of `router.currentRoute.value`.

Routes support static paths, dynamic params such as `/users/:id`, optional params such as `/users/:id?`, repeat params such as `/tags/:tags+`, catch-all params such as `/files/:pathMatch(.*)*`, query parsing, hash parsing, aliases, and redirects. Use `notFound` to provide a fallback component for unmatched paths. Not found components receive the same `route` and `router` props as matched route components.

Repeat and catch-all params resolve to arrays:

```ts
const route = router.resolve("/tags/design/system");

route.params.tags; // ["design", "system"]
```

Route components can also be lazy loaders. `RouterView` resolves the loader when that route is rendered, caches the resolved component on the route record, and ignores stale loader results if navigation changes while the loader is pending:

```ts
createRouter({
  routes: [
    {
      path: "/settings",
      name: "settings",
      component: () => import("./SettingsPage.mikuru")
    }
  ]
});
```

Use `router.preload(to)` to resolve lazy route components before navigation. `RouterLink` also accepts `preload`; when true, it preloads the target on hover or focus:

```mikuru
<template>
  <RouterLink :to="{ name: 'settings' }" label="Settings" :preload="true" />
</template>
```

```ts
await router.preload({ name: "settings" });
```

Lazy routes can render loading and error fallback components. Router-level fallbacks apply to every lazy route, and route records can override them:

```ts
createRouter({
  routes: [
    {
      path: "/reports",
      name: "reports",
      component: () => import("./ReportsPage.mikuru"),
      loadingComponent: ReportsLoading,
      errorComponent: ReportsError
    }
  ],
  loadingComponent: PageLoading,
  errorComponent: PageError
});
```

Loading components receive `{ route, router }` props. Error components receive `{ error, route, router }` props. If no error component is configured, lazy loader errors are thrown asynchronously.

Route records can map route data into component props. `props: true` passes route params, object props are passed as static values, and a function can map params, query, hash, or meta into the component's props:

```ts
createRouter({
  routes: [
    { path: "/users/:id", component: UserPage, props: true },
    { path: "/reports", component: ReportsPage, props: { mode: "summary" } },
    {
      path: "/search",
      component: SearchPage,
      props: (route) => ({ q: route.query.q, page: route.query.page ?? "1" })
    }
  ]
});
```

Route components still receive `route` and `router` props, and those built-in props take priority over mapped route props.

Browser history modes support scroll behavior after successful navigation:

```ts
const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to) {
    if (to.hash) return undefined;
    return { left: 0, top: 0 };
  }
});
```

Without a custom `scrollBehavior`, browser navigation scrolls to a matching hash element or to the page top. A custom `scrollBehavior(to, from)` can return a `ScrollToOptions` object, `false`, or `undefined`. Returning `false` or `undefined` skips scrolling. Memory history does not run scroll behavior.

Programmatic navigation accepts strings or route location objects:

```ts
await router.push({
  path: "/users/42",
  query: { tab: "profile", tag: ["a", "b"] },
  hash: "bio"
});
```

Path navigation supports `./` and `../` relative paths from the current route:

```ts
await router.push("./details");
await router.push("../billing");
await router.push({ path: "../profile", query: { tab: "summary" }, hash: "bio" });
```

`RouterLink` accepts default slot children, route location objects, `replace`, `activeClass`, and `exactActiveClass` props. Active links receive `router-link-active` by default. Exact active links also receive `router-link-exact-active` and `aria-current="page"`.

Named routes use the route record's `name` plus `params`:

```ts
await router.push({
  name: "user",
  params: { id: "42" },
  query: { tab: "profile" }
});
```

Optional params can be omitted. Repeat params use arrays:

```ts
await router.push({ name: "optional-user" });
await router.push({ name: "tags", params: { tags: ["design", "system"] } });
```

`defineRoutes()` preserves route literals for type helpers:

```ts
import { defineRoutes } from "mikuru/router";
import type { RouteLocationForName, RouteNames, RouteParamNames } from "mikuru/router";

const routes = defineRoutes([
  { path: "/", name: "home" },
  { path: "/users/:id", name: "user" }
] as const);

type Names = RouteNames<typeof routes>; // "home" | "user"
type UserParams = RouteParamNames<"/users/:id">; // "id"
type UserLocation = RouteLocationForName<typeof routes, "user">;
```

Redirect routes can point to a string, route location object, or function:

```ts
createRouter({
  routes: [
    { path: "/old-home", redirect: "/" },
    { path: "/legacy/:id", redirect: (to) => ({ name: "user", params: { id: to.params.id } }) },
    { path: "/users/:id", name: "user", component: UserPage }
  ]
});
```

Navigation guards run on the final route after route redirects are resolved. For example, a redirect from `/legacy-admin` to `/admin` will run the `/admin` `beforeEnter` guard.

Aliases render the same route record from another path. Named navigation still uses the route's canonical `path`:

```ts
createRouter({
  routes: [
    { path: "/", name: "home", alias: ["/home", "/start"], component: HomePage },
    { path: "/users/:id", name: "user", alias: "/members/:id", component: UserPage }
  ]
});
```

Nested routes use `children` and nested `RouterView` instances. Pass `depth="1"` to the child view:

```mikuru
<template>
  <section>
    <h2>Settings</h2>
    <RouterView depth="1" />
  </section>
</template>
```

Use an empty child path for an index route. The index child is matched before the parent record for the same URL, so `route.matchedRecords` includes both the parent and index child:

```ts
createRouter({
  routes: [
    {
      path: "/settings",
      component: SettingsLayout,
      children: [{ path: "", name: "settings-index", component: SettingsHome }]
    }
  ]
});
```

Routes can also be added after router creation. Dynamic route changes rebuild the matcher and re-resolve the current route, so `RouterView`, `RouterLink`, and `router.resolve()` see the updated table immediately:

```ts
const removeAdmin = router.addRoute({
  path: "/admin",
  name: "admin",
  component: AdminPage
});

router.addRoute("settings", {
  path: "billing",
  name: "settings-billing",
  component: BillingPage
});

if (router.hasRoute("admin")) {
  removeAdmin();
}
```

Navigation guards can return:

- `false` to cancel navigation.
- A string or route location object to redirect.
- `undefined` to continue.

Route records can also define `beforeEnter` when a guard belongs to a specific route. Parent route guards run before child route guards, after global `beforeEach` guards:

```ts
createRouter({
  routes: [
    {
      path: "/account",
      beforeEnter: (to) => {
        if (!isLoggedIn) return { name: "login", query: { redirect: to.fullPath } };
        return undefined;
      },
      children: [{ path: "billing", component: BillingPage }]
    }
  ]
});
```

`beforeEnter` can also be an array of guards.

Because nested route meta is merged, guards can check parent and child metadata from `to.meta`:

```ts
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isLoggedIn) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  return undefined;
});
```

Navigation failures can be checked with `isNavigationFailure()`:

```ts
import { NavigationFailureType, isNavigationFailure } from "mikuru/router";

const result = await router.push("/settings");

if (isNavigationFailure(result, NavigationFailureType.duplicated)) {
  // Already on this route.
}
```

Failure types are:

- `duplicated` when navigating to the current `fullPath`.
- `aborted` when a guard returns `false`.
- `cancelled` when a newer navigation supersedes an older async navigation.

Duplicated navigations do not call `afterEach`. Aborted navigations call `afterEach(to, from, failure)` and keep `currentRoute` unchanged. Guard redirects resolve to the final route and call `afterEach` for the final navigation only. Repeated guard redirects are capped and throw `Too many navigation guard redirects.` through `router.onError()`.

Use `router.onError()` to observe errors thrown by guards, scroll behavior, preload, or lazy route loaders:

```ts
const stopErrors = router.onError((error, to, from) => {
  console.error("Router error", error, to.fullPath, from?.fullPath);
});
```

## Current Limits

- SSR and hydration are outside v1 scope.
