import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "browser",
  testMatch: "*.e2e.ts",
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:3001",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:3001/api/health",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
