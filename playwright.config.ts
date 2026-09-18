import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3001";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]],
  outputDir: "e2e/test-results",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "on",
    video: "on",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: {
      slowMo: 450,
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        command: "npm run dev -- --port 3001 --strictPort",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
