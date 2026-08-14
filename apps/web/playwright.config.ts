import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
// Next.js 16 blocks 127.0.0.1 from loading /_next assets when the server
// bound hostname is localhost — keep default on localhost unless CI/HML overrides.

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
    ...devices["Pixel 7"],
  },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
});
