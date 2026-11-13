// Browser checks (SPEC §12): axe accessibility and visual-review screenshots, each in
// light and dark mode at a phone width (390px) and a desktop width (1280px), plus a reflow
// check at 320px (WCAG 2.2), against
// `npm start` (vercel dev on the dev database).
import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, WELCOME_SEEN } from "./tests/e2e/welcome-seen.ts";

// SPEC §8: one responsive site, mobile first, from 360px up.
const WIDTHS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];

/** PLAYWRIGHT_WORKERS as Playwright takes it: "2" becomes 2, "50%" stays a share; unset or blank is 3. */
function workersFrom(value: string | undefined): number | string {
  const v = value?.trim();
  if (!v) return 3;
  return /^\d+$/.test(v) ? Number(v) : v;
}

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  // 3 workers, not the default 4 (DECISIONS entry 149): under vercel dev every API request
  // starts its own Node process, and with 4 workers the late tests timed out waiting for
  // pages. PLAYWRIGHT_WORKERS overrides it (a count, or a share like "50%"), so a cloud
  // check can choose its own. A --workers flag still wins over both.
  workers: workersFrom(process.env.PLAYWRIGHT_WORKERS),
  reporter: "list",
  // The welcome dialog starts seen, so it never covers the page under test (DECISIONS entry 140).
  use: { baseURL: BASE_URL, storageState: WELCOME_SEEN },
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
