import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end click-through of every hero flow. By default it starts its own dev server on port
 * 3100 with an isolated PGlite database (.data/e2e), so it never touches your local data.
 * Point it at a running app or the live site with BASE_URL=https://… npm run test:e2e
 * On Windows it drives the installed Microsoft Edge (no browser download).
 */
const external = process.env.BASE_URL;
/** Only the shell can let a browser test reach a paid model (see evals/spend-lock.ts). */
const spend = process.env.NAZAR_ALLOW_MODEL_SPEND === "1";
const browser = process.platform === "win32" ? { channel: "msedge" as const } : {};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: external ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: external ?? "http://localhost:3100", trace: "retain-on-failure", ...browser },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...browser, viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"], ...browser, viewport: { width: 375, height: 812 } }, grep: /@mobile/ },
  ],
  webServer: external
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3100/signin",
        timeout: 300_000,
        reuseExistingServer: true,
        // The app under test refuses every call to a model, so no browser test can spend by accident.
        env: { PORT: "3100", NAZAR_PGLITE_DIR: ".data/e2e", EMAIL_DISABLED: "1", NEWS_ENABLED: "0", ...(spend ? {} : { NAZAR_NO_MODEL_CALLS: "1" }) },
      },
});
