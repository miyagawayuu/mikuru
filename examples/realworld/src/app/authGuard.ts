import { getAuthToken } from "../lib/auth.js";

export type RouteName = "dashboard" | "login" | "admin" | "notFound";

export type RouteDefinition = {
  name: RouteName;
  path: string;
  title: string;
  requiresAuth?: boolean;
};

export type GuardResult =
  | { allow: true; route: RouteDefinition }
  | { allow: false; redirectTo: string; reason: "auth-required" };

export function guardRoute(route: RouteDefinition): GuardResult {
  if (route.requiresAuth && !getAuthToken()) {
    return {
      allow: false,
      redirectTo: `/login?redirect=${encodeURIComponent(route.path)}`,
      reason: "auth-required"
    };
  }

  return { allow: true, route };
}
