// Conformance check 3 (SPEC §12): zero axe violations on every screen, light and dark, at 390px and 1280px.
import { expect, test } from "@playwright/test";
import { runAxe } from "./axe.ts";
import { SCREENS, viewAs } from "./screens.ts";

for (const screen of SCREENS) {
  test(`${screen.name} has no accessibility violations`, async ({ page, baseURL }) => {
    await viewAs(page, screen, baseURL);
    await page.goto(screen.path);
    await page.waitForLoadState("networkidle");
    const { violations } = await runAxe(page);
    expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} element(s))`)).toEqual([]);
  });
}
