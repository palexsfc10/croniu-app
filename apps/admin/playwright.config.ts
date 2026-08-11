import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3002";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } }],
});
