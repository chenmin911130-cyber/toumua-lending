import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @toumua/api start:e2e",
      url: "http://127.0.0.1:3001/api/v1/health",
      reuseExistingServer: true,
      timeout: 120000,
      cwd: "../..",
    },
    {
      command: "pnpm --filter @toumua/web dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      cwd: "../..",
    },
  ],
});
