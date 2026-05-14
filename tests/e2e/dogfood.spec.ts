import { expect, test } from "@playwright/test";

test("dogfood app supports note and filter interactions", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dogfood Notes" })).toBeVisible();
  await expect(page.locator(".note-card")).toHaveCount(3);

  await page.getByRole("button", { name: "Seed more notes" }).click();
  await expect(page.locator(".note-card").getByText("Keyed lists keep card identity", { exact: true })).toBeVisible();
  await expect(page.locator(".note-card")).toHaveCount(4);
  await expect(page.getByText("Async note stats")).toBeVisible();
  await expect(page.getByText("Total: 4")).toBeVisible();

  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await expect(page.getByText("Parser limits should stay loud")).toBeVisible();

  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toHaveCount(2);

  await page.getByLabel("Search", { exact: true }).fill("scoped");
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

test("dogfood app keeps dynamic panel state alive", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "KeepAlive lab" })).toBeVisible();
  await page.getByRole("button", { name: "First kept count: 0" }).click();
  await expect(page.getByRole("button", { name: "First kept count: 1" })).toBeVisible();

  await page.getByRole("button", { name: "Second panel" }).click();
  await expect(page.getByRole("button", { name: "Second kept async count: 0" })).toBeVisible();
  await page.getByRole("button", { name: "Second kept async count: 0" }).click();
  await expect(page.getByRole("button", { name: "Second kept async count: 1" })).toBeVisible();

  await page.getByRole("button", { name: "First panel" }).click();
  await expect(page.getByRole("button", { name: "First kept count: 1" })).toBeVisible();

  await page.getByRole("button", { name: "Third transient panel" }).click();
  await page.getByRole("button", { name: "Third transient count: 0" }).click();
  await expect(page.getByRole("button", { name: "Third transient count: 1" })).toBeVisible();

  await page.getByRole("button", { name: "First panel" }).click();
  await page.getByRole("button", { name: "Third transient panel" }).click();
  await expect(page.getByRole("button", { name: "Third transient count: 0" })).toBeVisible();
});

test("dogfood app animates keyed rows with TransitionGroup", async ({ page }) => {
  await page.goto("/");

  const lab = page.getByRole("region", { name: "TransitionGroup lab" });
  await expect(lab.getByRole("heading", { name: "TransitionGroup lab" })).toBeVisible();
  await expect(lab.getByText("Parser diagnostics")).toBeVisible();

  await lab.getByRole("button", { name: "Add row" }).click();
  await expect(lab.getByText("Generated row 4")).toBeVisible();

  await lab.getByRole("button", { name: "Remove first" }).click();
  await expect(lab.getByText("Parser diagnostics")).toBeVisible();
  await page.waitForTimeout(160);
  await expect(lab.getByText("Parser diagnostics")).not.toBeVisible();

  await lab.getByRole("button", { name: "Reverse rows" }).click();
  const rows = lab.getByRole("listitem");
  await expect(rows.first()).toContainText("Generated row 4");
});

test("dogfood app syncs practical m-model forms", async ({ page }) => {
  await page.goto("/");

  const lab = page.getByRole("region", { name: "m-model lab" });
  await expect(lab.getByRole("heading", { name: "m-model lab" })).toBeVisible();
  await expect(lab.getByText("ready:1:2:Launch checklist:false:Mikuru:Runtime:waiting:effect:Mikuru Runtime:queued:Mikuru Runtime")).toBeVisible();

  await lab.getByLabel("Search phrase").fill("  shipped  ");
  await lab.getByLabel("Priority").focus();
  await lab.getByLabel("Priority").fill("7");
  await lab.getByLabel("One").check();
  await lab.getByLabel("Two").uncheck();
  await lab.getByLabel("Card title").fill("  Release notes  ");
  await lab.getByLabel("Feature enabled").check();
  await lab.getByLabel("Owner name").fill("Writable Computed");

  await expect(lab.getByText("shipped:7:1:Release notes:true:Writable:Computed:Mikuru Runtime -> Writable Computed:effect:Writable Computed:queued:Writable Computed")).toBeVisible();
});

test("dogfood app exposes debug inspector panel", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(value: string) {
          window.localStorage.setItem("dogfood-debug-snapshot", value);
        }
      }
    });
  });
  await page.goto("/");

  const panel = page.getByRole("region", { name: "Debug panel" });
  await expect(panel.getByRole("heading", { name: "Debug Panel" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Component Tree" })).toBeVisible();
  await expect(panel.locator(".debug-list").first()).toHaveCSS("overflow-y", "auto");
  await expect(panel.locator(".debug-event-list").first()).toHaveCSS("overflow-y", "auto");
  await expect(panel.getByText("App.mikuru").first()).toBeVisible();
  await expect(panel.getByText("DebugPanel.mikuru").first()).toBeVisible();
  await expect(panel.getByText(/root #\d+ .*App\.mikuru/).first()).toBeVisible();
  await expect(panel.getByText(/child #\d+ .*DebugPanel\.mikuru/).first()).toBeVisible();
  await expect(panel.getByText(/\d+ children, \d+ styles, \d+ events/).first()).toBeVisible();
  await expect(panel.getByText("component:register").first()).toBeVisible();
  await panel.getByRole("button", { name: "Collapse all" }).click();
  await expect(panel.getByText(/child #\d+ .*DebugPanel\.mikuru/)).toHaveCount(0);
  await panel.getByLabel("Component search").fill("DebugPanel");
  await expect(panel.getByText(/root #\d+ .*App\.mikuru/).first()).toBeVisible();
  await expect(panel.getByText(/child #\d+ .*DebugPanel\.mikuru/).first()).toBeVisible();
  await panel.getByRole("button", { name: "Clear search" }).click();
  await expect(panel.getByText(/child #\d+ .*DebugPanel\.mikuru/)).toHaveCount(0);
  await panel.getByRole("button", { name: "Expand all" }).click();
  await expect(panel.getByText(/child #\d+ .*DebugPanel\.mikuru/).first()).toBeVisible();

  await panel.getByText(/child #\d+ .*DebugPanel\.mikuru/).first().click();
  await expect(panel.getByText("root").first()).toBeVisible();
  await expect(panel.getByText(/<section\.debug-panel>/).first()).toBeVisible();
  await expect(panel.getByText(/section\.debug-panel/).first()).toBeVisible();
  await panel.getByRole("button", { name: "Reveal root" }).click();
  await expect(panel).toHaveAttribute("data-mikuru-debug-highlight", "true");
  await expect(panel.getByText("scopes").first()).toBeVisible();
  await expect(panel.getByText(/data-mikuru-scope-/).first()).toBeVisible();
  await expect(panel.getByText("event types").first()).toBeVisible();
  await expect(panel.getByText(/style: \d+/).first()).toBeVisible();
  await panel.getByRole("button", { name: "Show component events" }).click();
  await expect(panel.getByText(/Filtered by #\d+ .*DebugPanel\.mikuru/)).toBeVisible();
  await expect(panel.getByRole("heading", { name: /Events \d+ \/ \d+/ })).toBeVisible();
  await expect(panel.locator(".debug-filters").getByRole("button", { name: /All \d+/ })).toBeVisible();
  await expect(panel.getByText("style:inject").first()).toBeVisible();
  await panel.getByRole("button", { name: "Clear component filter" }).click();
  await expect(panel.getByText(/Filtered by #/)).toHaveCount(0);

  await panel.locator(".debug-filters").getByRole("button", { name: /Style/ }).click();
  await panel.getByLabel("Event search").fill("scoped");
  await expect(panel.getByText("style:inject").first()).toBeVisible();
  await expect(panel.getByText(/mikuru-.*scoped/).first()).toBeVisible();
  await panel.getByLabel("Event search").fill("route:navigate");
  await expect(panel.getByText("No matching debug events.")).toBeVisible();
  await panel.getByRole("button", { name: "Clear search" }).click();
  await expect(panel.getByText("style:inject").first()).toBeVisible();
  await panel.getByText("style:inject").first().click();
  await expect(panel.getByRole("button", { name: "Select component" })).toBeVisible();
  await panel.getByRole("button", { name: "Select component" }).click();
  await expect(panel.locator(".debug-component-row.selected").first()).toContainText(/\.mikuru/);
  await expect(panel.locator(".debug-detail").filter({ hasText: /data-mikuru-scope-/ }).first()).toBeVisible();
  await expect(panel.locator(".debug-detail").filter({ hasText: /#\d+ .*\.mikuru/ }).first()).toBeVisible();

  await panel.getByRole("button", { name: "Clear events" }).click();
  await expect(panel.getByText("No matching debug events.")).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("Current route: /settings")).toBeVisible();
  await panel.locator(".debug-filters").getByRole("button", { name: /Router/ }).click();
  await expect(panel.getByText("route:navigate").first()).toBeVisible();
  await expect(panel.getByText("/ -> /settings").first()).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Snapshot" })).toBeVisible();
  await expect(panel.locator(".debug-snapshot-summary")).toContainText("components");
  await expect(panel.locator(".debug-snapshot-summary")).toContainText("type: router");
  await expect(panel.locator(".debug-snapshot pre")).toHaveCount(0);
  await panel.getByRole("button", { name: "Show snapshot" }).click();
  await expect(panel.locator(".debug-snapshot pre")).toContainText('"eventFilter": "router"');
  await expect(panel.locator(".debug-snapshot pre")).toContainText('"filteredEvents"');
  await panel.getByRole("button", { name: "Hide snapshot" }).click();
  await expect(panel.locator(".debug-snapshot pre")).toHaveCount(0);
  await panel.getByRole("button", { name: "Copy snapshot" }).click();
  await expect(panel.getByText("Snapshot copied.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("dogfood-debug-snapshot"))).toContain('"eventFilter": "router"');

  await page.getByRole("button", { name: "Trigger boundary error" }).click();
  await panel.locator(".debug-filters").getByRole("button", { name: /Error/ }).click();
  await expect(panel.getByText("component:error").first()).toBeVisible();
  await expect(panel.getByText("Dogfood boundary failure").first()).toBeVisible();
});
