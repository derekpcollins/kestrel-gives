// Conformance check 6 (SPEC §12): full-page screenshots of every screen, light and
// dark at 390px and 1280px, with demo controls hidden, saved to visual-review/ for a person to review.
// Nothing is compared automatically.
import { test } from "@playwright/test";
import { SCREENS, viewAs } from "./screens.ts";

for (const screen of SCREENS) {
  test(`${screen.name} screenshot`, async ({ page, baseURL }, testInfo) => {
    await viewAs(page, screen, baseURL);
    const url = new URL(screen.path, "http://placeholder");
    url.searchParams.set("demo", "off");
    await page.goto(url.pathname + url.search);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `visual-review/${screen.name}-${testInfo.project.name}.png`, fullPage: true });
  });
}
