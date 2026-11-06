import { defineConfig } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3418";
const baseURL = "http://127.0.0.1:" + port;

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL,
    launchOptions: { executablePath: process.env.PROFILE_BROWSER || undefined },
  },
  webServer: {
    command: "node server/src/index.ts",
    env: { PORT: port, LOG_DIR: "./logs/e2e" },
    url: baseURL + "/health",
    reuseExistingServer: !process.env.CI,
  },
});
