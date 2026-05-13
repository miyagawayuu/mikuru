import { expect, test } from "@playwright/test";

test("SSR hydration example reuses DOM, streams output, and recovers drift", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") {
      warnings.push(message.text());
    }
  });

  await page.goto("/");

  const app = page.locator("#app");
  await expect(app.getByRole("heading", { name: "SSR Hydration Example" })).toBeVisible();
  await expect(app.getByText("Server HTML is reused.")).toBeVisible();

  await app.getByRole("button", { name: "count: 2" }).click();
  await expect(app.getByRole("button", { name: "count: 3" })).toBeVisible();

  const drift = page.locator("#drift");
  await expect(drift.getByText("Recovered from mismatched SSR DOM.")).toBeVisible();
  await expect(drift.getByRole("button", { name: "count: 5" })).toBeVisible();
  expect(warnings.some((warning) => warning.includes("remounting"))).toBe(true);

  await expect(page.locator("#stream-output")).toContainText("<section");
  await expect(page.locator("#stream-output")).toContainText("Server HTML is reused.");
});
