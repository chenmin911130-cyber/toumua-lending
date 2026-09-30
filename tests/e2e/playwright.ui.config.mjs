import { defineConfig } from "@playwright/test";

const baseURL = process.env.WEB_UI_BASE_URL;
if (!baseURL || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL)) {
  throw new Error("WEB_UI_BASE_URL must be an isolated http://127.0.0.1:<port> from scripts/test-web-ui.mjs");
}
if (["3001", "4173", "5173"].includes(new URL(baseURL).port)) {
  throw new Error(`Refusing reused dev port ${baseURL}`);
}

export default defineConfig({
  testDir: "./ui",
  outputDir: process.env.WEB_UI_OUTPUT_DIR ?? ".playwright-out",
  timeout: 45000,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL,
    headless: true,
    browserName: "chromium",
    channel: "chrome",
    trace: "off",
    video: "off",
    screenshot: "off",
  },
});
