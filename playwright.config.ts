// Browser checks (SPEC §12): axe accessibility and visual-review screenshots, each
// in light and dark mode, against `npm start` (vercel dev on the dev database).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://localhost:3000" },
  projects: [
    { name: "light", use: { ...devices["Desktop Chrome"], colorScheme: "light" } },
    { name: "dark", use: { ...devices["Desktop Chrome"], colorScheme: "dark" } },
  ],
  webServer: {
    command: "npm start",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
    // The default hard kill skips scripts/dev.ts's cleanup and orphans tsc and vercel.
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
