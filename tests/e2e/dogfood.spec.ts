import { expect, test } from "@playwright/test";

test("dogfood app supports note and filter interactions", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dogfood Notes" })).toBeVisible();
  await expect(page.locator(".note-card")).toHaveCount(3);

  await page.getByRole("button", { name: "Seed more notes" }).click();
  await expect(page.getByText("Keyed lists keep card identity")).toBeVisible();
  await expect(page.locator(".note-card")).toHaveCount(4);
  await expect(page.getByText("Loading note stats...")).toBeVisible();
  await expect(page.getByText("Async note stats")).toBeVisible();
  await expect(page.getByText("Total: 4")).toBeVisible();

  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await expect(page.getByText("Parser limits should stay loud")).toBeVisible();

  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toHaveCount(2);

  await page.getByLabel("Search").fill("scoped");
  await expect(page.getByText("Scoped CSS works for simple selectors")).toBeVisible();
});

test("dogfood app teleports the summary modal", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Open summary" }).click();

  const modalRoot = page.locator("#modal-root");
  await expect(modalRoot.getByRole("dialog")).toBeVisible();
  await expect(modalRoot.getByText("Teleported summary")).toBeVisible();
  await expect(modalRoot.getByText("2 active notes and 1 archived notes.")).toBeVisible();

  await page.getByRole("button", { name: "Close summary" }).click();
  await expect(modalRoot.getByRole("dialog")).toHaveCount(0);
});

test("dogfood app demonstrates ErrorBoundary diagnostics and recovery", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "ErrorBoundary lab" })).toBeVisible();

  await page.getByRole("button", { name: "Trigger boundary error" }).click();

  const alert = page.locator(".error-fallback");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Boundary caught an error");
  await expect(alert).toContainText("event in");
  await expect(alert).toContainText("Dogfood boundary failure");
  await expect(page.getByRole("button", { name: "Trigger boundary error" })).toHaveCount(0);

  await alert.getByRole("button", { name: "Reset boundary" }).click();
  await expect(alert).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Trigger boundary error" })).toBeVisible();

  await page.getByRole("button", { name: "Trigger boundary error" }).click();
  await expect(page.locator(".error-fallback")).toContainText("Dogfood boundary failure");

  await page.locator(".error-lab").getByRole("button", { name: "Reset boundary key" }).click();
  await expect(page.locator(".error-fallback")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Trigger boundary error" })).toBeVisible();
});

test("dogfood app demonstrates AsyncBoundary loading and retry", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "AsyncBoundary lab" })).toBeVisible();

  const asyncAlert = page.getByRole("alert").filter({ hasText: "AsyncBoundary caught an error" });
  await expect(asyncAlert).toBeVisible();
  await expect(asyncAlert).toContainText("async-loader");
  await expect(asyncAlert).toContainText("Dogfood async failure");

  await asyncAlert.getByRole("button", { name: "Retry async boundary" }).click();

  await expect(asyncAlert).toHaveCount(0);
  await expect(page.getByText("AsyncBoundary retry recovered")).toBeVisible();
});
