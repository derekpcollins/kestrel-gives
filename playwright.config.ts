// Browser checks (SPEC §12): axe accessibility and visual-review screenshots, each in
// light and dark mode at a phone width (390px) and a desktop width (1280px), plus a reflow
// check at 320px (WCAG 2.2), against
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
  projects: [
    ...(["light", "dark"] as const).flatMap((colorScheme) =>
      WIDTHS.map(({ width, height }) => ({
        name: `${colorScheme}-${width}`,
        testIgnore: /reflow\.spec\.ts/,
        use: { ...devices["Desktop Chrome"], colorScheme, viewport: { width, height } },
      })),
    ),
    // WCAG 2.2 reflow floor (SPEC §8): layout doesn't depend on the color scheme.
    { name: "reflow-320", testMatch: /reflow\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 800 } } },
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
