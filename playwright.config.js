import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30000,
  fullyParallel: false,
  use: {
    baseURL: process.env.APP_URL || "http://127.0.0.1:4173/absurd-os/",
    headless: true,
  },
  webServer: process.env.APP_URL
    ? undefined
    : {
        command: process.env.PWA_TEST
          ? "npm run preview -- --port 4173"
          : "npm run dev -- --port 4173",
        url: "http://127.0.0.1:4173/absurd-os/",
        reuseExistingServer: true,
      },
  reporter: [["list"]],
});
