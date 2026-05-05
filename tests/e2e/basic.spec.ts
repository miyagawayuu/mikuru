import { expect, test } from "@playwright/test";

test("realworld example supports app-like browser interactions", async ({ page }) => {
  await page.goto("/", { waitUntil: "commit" });

  await expect(page.getByRole("heading", { name: "Release task board" })).toBeVisible();
  await expect(page.getByText("Code frames for parser failures")).toBeVisible();
  await expect(page.getByText("Runtime / medium")).toBeVisible();
  await expect(page.getByText("Published package smoke test")).toBeVisible();

  await page.getByLabel("Search tasks").fill("package");
  await expect(page.getByText("Published package smoke test")).toBeVisible();
  await expect(page.getByText("Code frames for parser failures")).toHaveCount(0);

  await page.getByLabel("Search tasks").fill("");
  await page.getByPlaceholder("New task title").fill("Production fixture");
  await page.locator(".new-task select").first().selectOption("DX");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Production fixture")).toBeVisible();
});

test("realworld example exposes routing, auth guard, 404, and form validation", async ({ page }) => {
  await page.goto("/", { waitUntil: "commit" });

  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Enter a task title")).toBeVisible();

  await page.getByRole("button", { name: "Admin guard" }).click();
  await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin$/);
  await expect(page.getByRole("heading", { name: "Login required" })).toBeVisible();
  await expect(page.getByText("before continuing to /admin")).toBeVisible();

  await page.getByRole("button", { name: "Back to board" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Release task board" })).toBeVisible();

  await page.getByRole("button", { name: "404 route" }).click();
  await expect(page).toHaveURL(/\/missing$/);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByText("The route /missing does not exist")).toBeVisible();
});
