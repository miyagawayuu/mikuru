import { expect, test } from "@playwright/test";

test("basic example shows watch cleanup cancelling stale delayed mood updates", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Mikuru Counter" })).toBeVisible();
  await expect(page.getByText("Current mood is curious")).toBeVisible();
  await expect(page.getByText("Settled mood is curious")).toBeVisible();

  const counter = page.getByRole("button", { name: "count: 0" });
  await counter.click();

  await expect(page.getByRole("button", { name: "count: 1" })).toBeVisible();
  await expect(page.getByText("Current mood is building")).toBeVisible();
  await expect(page.getByText("Settled mood is curious")).toBeVisible();

  await page.waitForTimeout(50);
  await page.getByRole("button", { name: "count: 1" }).click();

  await expect(page.getByRole("button", { name: "count: 2" })).toBeVisible();
  await expect(page.getByText("Current mood is curious")).toBeVisible();

  await page.waitForTimeout(180);
  await expect(page.getByText("Settled mood is curious")).toBeVisible();
  await expect(page.getByText("Settled mood is building")).toHaveCount(0);

  await page.waitForTimeout(100);
  await expect(page.getByText("Settled mood is curious")).toBeVisible();
});
