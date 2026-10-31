// Conformance check 6 (SPEC §12): full-page screenshots of every screen, light and
// dark, with demo controls hidden, saved to visual-review/ for a person to review.
// Nothing is compared automatically.
import { test } from "@playwright/test";
import { SCREENS } from "./screens.ts";

for (const screen of SCREENS) {
  test(`${screen.name} screenshot`, async ({ page }, testInfo) => {
    const url = new URL(screen.path, "http://placeholder");
    url.searchParams.set("demo", "off");
    await page.goto(url.pathname + url.search);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `visual-review/${screen.name}-${testInfo.project.name}.png`, fullPage: true });
  });
}
