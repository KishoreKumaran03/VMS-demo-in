import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  timeout: 90_000,
  use: {
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
