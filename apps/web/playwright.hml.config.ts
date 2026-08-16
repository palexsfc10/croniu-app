import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.HML_BASE_URL || process.env.PLAYWRIGHT_BASE_URL;
if (!baseURL) {
  throw new Error("HML_BASE_URL or PLAYWRIGHT_BASE_URL is required for HML smoke.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/cycle-integrity.spec.ts",
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL,
    trace: "on",
    screenshot: "on",
    ...devices["Pixel 7"],
  },
  projects: [{ name: "hml-smoke", use: { ...devices["Pixel 7"] } }],
});
