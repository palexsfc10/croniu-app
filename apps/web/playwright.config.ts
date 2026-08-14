import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  testIgnore: ["**/prd-smoke.spec.ts"],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    ...devices["Pixel 7"],
  },
  projects: [{ name: "local", use: { ...devices["Pixel 7"] } }],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npx next dev --hostname 127.0.0.1 --port 3000",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          ...process.env,
          API_PROXY_TARGET: process.env.API_PROXY_TARGET || "http://127.0.0.1:8010",
          NEXT_PUBLIC_API_URL: "",
        },
      },
});
