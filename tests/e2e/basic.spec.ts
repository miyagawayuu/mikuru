import { expect, test } from "@playwright/test";

test("realworld example supports app-like browser interactions", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Release task board" })).toBeVisible();
  await expect(page.getByText("Code frames for parser failures")).toBeVisible();
  await expect(page.getByText("Runtime / medium")).toBeVisible();

  await page.getByLabel("Search tasks").fill("package");
  await expect(page.getByText("Published package smoke test")).toBeVisible();
  await expect(page.getByText("Code frames for parser failures")).toHaveCount(0);

  await page.getByLabel("Search tasks").fill("");
  await page.getByLabel("Owner").selectOption("Runtime");
  await expect(page.getByText("Unmount cleanup under filters")).toBeVisible();
  await expect(page.getByText("Published package smoke test")).toHaveCount(0);

  await page.getByLabel("Owner").selectOption("all");
  await page.getByPlaceholder("New task title").fill("Production fixture");
  await page.locator(".new-task select").first().selectOption("DX");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Production fixture")).toBeVisible();

  await page.getByRole("button", { name: "Compact" }).click();
  await expect(page.getByRole("button", { name: "Comfortable" })).toBeVisible();
});
