import { expect, test } from "@playwright/test";

test("router SSR hydration example renders, hydrates, and navigates route trees", async ({ page }) => {
  await page.goto("/users/7?tab=info");

  await expect(page.getByRole("heading", { name: "Router SSR Hydration" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "User 7" })).toBeVisible();
  await expect(page.getByText("Tab: info")).toBeVisible();
  await expect(page.locator("#route-status")).toHaveText("hydrated:/users/7?tab=info");
  await expect(page.getByTestId("router-shell")).toHaveAttribute("data-route", "/users/7?tab=info");

  await page.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "SSR Home" })).toBeVisible();
  await expect(page.getByText("rendered with renderRouteToString() and hydrated with hydrateRoute()")).toBeVisible();
  await expect(page.locator("#route-status")).toHaveText("navigated:/");

  await page.getByRole("link", { name: "Redirect" }).click();
  await expect(page).toHaveURL(/\/users\/42\?tab=profile$/);
  await expect(page.getByRole("heading", { name: "User 42" })).toBeVisible();
  await expect(page.getByText("Tab: profile")).toBeVisible();
  await expect(page.getByRole("link", { name: "User" })).toHaveClass(/route-active/);
  await expect(page.getByRole("link", { name: "User" })).toHaveClass(/route-exact/);

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(page.getByText("Nested route content survived route hydration.")).toBeVisible();

  await page.getByRole("link", { name: "Lazy Child" }).click();
  await expect(page.getByRole("heading", { name: "Lazy SSR Route" })).toBeVisible();
  await expect(page.getByText("loaded lazily for both SSR rendering and hydration")).toBeVisible();

  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin$/);
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
  await expect(page.getByText("Guard redirected here from /admin")).toBeVisible();

  await page.getByRole("link", { name: "Missing" }).click();
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(page.getByText("/missing does not match a route.")).toBeVisible();
});
