import { expect, test } from "@playwright/test";

test("router example navigates through RouterLink and RouterView", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Mikuru Router" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(page.getByText("RouterView renders the matched component.")).toBeVisible();

  await page.getByRole("link", { name: "User" }).click();
  await expect(page.getByRole("heading", { name: "User 42" })).toBeVisible();
  await expect(page.getByText("Tab: profile")).toBeVisible();
  await expect(page.getByRole("link", { name: "User" })).toHaveAttribute("aria-current", "page");

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(page.getByText("Nested RouterView rendered this page.")).toBeVisible();

  await page.getByRole("link", { name: "Missing" }).click();
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(page.getByText("/missing does not match a route.")).toBeVisible();
});
