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
      <RouterLink :router="router" to="/" label="Home" />
      <RouterLink :router="router" to="/users/42?tab=profile" label="User" />
      <RouterLink :router="router" :to="{ name: 'user', params: { id: '42' }, query: { tab: 'profile' } }">
        <strong>User</strong>
      </RouterLink>
      <RouterLink :router="router" to="/settings" label="Settings" :replace="true" activeClass="is-active" exactActiveClass="is-exact" />
    </nav>

    <RouterView :router="router" />
  </main>
</template>

<script>
import { onBeforeUnmount } from "mikuru";
import { createRouter, createWebHashHistory, RouterLink, RouterView } from "mikuru/router";
import HomePage from "./HomePage.mikuru";
import UserPage from "./UserPage.mikuru";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: HomePage },
    { path: "/users/:id", name: "user", component: UserPage }
  ]
});

const stopRouter = router.listen();
onBeforeUnmount(stopRouter);
</script>
```

Route components receive `route` and `router` props from `RouterView`.

```mikuru
<template>
  <section>
    <h2>User {{ route.params.id }}</h2>
    <p>Tab: {{ route.query.tab }}</p>
  </section>
</template>

<script>
const { route } = defineProps();
</script>
```

## API

- `createRouter({ history, routes, notFound? })` creates a router.
- `router.currentRoute` is a `ref` containing the current route.
- `router.push(to)` and `router.replace(to)` navigate programmatically and resolve to either a `RouteLocation` or `NavigationFailure`.
- `router.back()` and `router.forward()` delegate to the configured history.
- `router.resolve(to)` parses a route without navigating.
- `router.beforeEach(fn)` registers a navigation guard and returns an unsubscribe function.
- `router.afterEach(fn)` registers a post-navigation hook and returns an unsubscribe function.
- `router.addRoute(record)` adds a top-level route and returns a remove callback.
- `router.addRoute(parentName, record)` adds a nested route under a named parent and returns a remove callback.
- `router.removeRoute(name)` removes a named route and its children.
- `router.hasRoute(name)` checks whether a named route exists.
- `router.listen()` starts syncing browser or memory history events and returns a stop function.

Routes support static paths, dynamic params such as `/users/:id`, query parsing, hash parsing, aliases, and redirects. Use `notFound` to provide a fallback component for unmatched paths.

Programmatic navigation accepts strings or route location objects:

```ts
await router.push({
  path: "/users/42",
  query: { tab: "profile", tag: ["a", "b"] },
  hash: "bio"
});
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
    <RouterView :router="router" depth="1" />
  </section>
</template>
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

Duplicated navigations do not call `afterEach`. Aborted navigations call `afterEach(to, from, failure)` and keep `currentRoute` unchanged. Guard redirects resolve to the final route and call `afterEach` for the final navigation only.

## Current Limits

- `RouterView` and `RouterLink` require an explicit `router` prop.
- SSR and hydration are outside v1 scope.
