import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    },
  },
  use: {
    trace: "on-first-retry",
    screenshot: "on",
  },
  reporter: [
    ["json", { outputFile: "test-results/report.json" }],
    ["html", { open: "never" }],
  ],
  projects: [
    {
      name: "vrt-desktop",
      use: {
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "vrt-mobile",
      use: {
        viewport: { width: 375, height: 812 },
      },
    },
  ],
});
