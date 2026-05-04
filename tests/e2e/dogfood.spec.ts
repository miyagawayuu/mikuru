import { expect, test } from "@playwright/test";

test("dogfood app supports note and filter interactions", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dogfood Notes" })).toBeVisible();
  await expect(page.locator(".note-card")).toHaveCount(3);

  await page.getByRole("button", { name: "Seed more notes" }).click();
  await expect(page.getByText("Keyed lists keep card identity")).toBeVisible();
  await expect(page.locator(".note-card")).toHaveCount(4);

  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await expect(page.getByText("Parser limits should stay loud")).toBeVisible();

  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toHaveCount(2);

  await page.getByLabel("Search").fill("scoped");
  await expect(page.getByText("Scoped CSS works for simple selectors")).toBeVisible();
});
