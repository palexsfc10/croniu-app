import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PRD_BASE_URL;
if (!baseURL) {
  throw new Error("PRD_BASE_URL is required for PRD smoke. Do not run against production without authorization.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/prd-smoke.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    ...devices["Pixel 7"],
  },
  projects: [{ name: "prd-smoke", use: { ...devices["Pixel 7"] } }],
});
