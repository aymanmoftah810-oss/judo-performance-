import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    browserName: "chromium",
    launchOptions: { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] },
    headless: true,
  },
  reporter: "list",
});
