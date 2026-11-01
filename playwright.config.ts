// Browser checks (SPEC §12): axe accessibility and visual-review screenshots, each in
// light and dark mode at a phone width (390px) and a desktop width (1280px), against
// `npm start` (vercel dev on the dev database).
import { defineConfig, devices } from "@playwright/test";

// SPEC §8: one responsive site, mobile first, from 360px up.
const WIDTHS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://localhost:3000" },
  projects: (["light", "dark"] as const).flatMap((colorScheme) =>
    WIDTHS.map(({ width, height }) => ({
      name: `${colorScheme}-${width}`,
      use: { ...devices["Desktop Chrome"], colorScheme, viewport: { width, height } },
    })),
  ),
  webServer: {
    command: "npm start",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
    // The default hard kill skips scripts/dev.ts's cleanup and orphans tsc and vercel.
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
