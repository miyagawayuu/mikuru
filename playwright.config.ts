import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/basic-example.spec.ts", "**/dogfood.spec.ts", "**/router.spec.ts", "**/router-ssr-hydration.spec.ts", "**/ssr-hydration.spec.ts"],
  webServer: {
    command: "npm run dev:realworld -- --host 127.0.0.1 --port 5177",
    url: "http://127.0.0.1:5177",
    reuseExistingServer: !process.env.CI
  },
  use: {
    baseURL: "http://127.0.0.1:5177",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
