// Conformance check 3 (SPEC §12): zero axe violations on every screen, light and dark, at 390px and 1280px.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SCREENS, viewAs } from "./screens.ts";

const WCAG_22_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const screen of SCREENS) {
  test(`${screen.name} has no accessibility violations`, async ({ page, baseURL }) => {
    await viewAs(page, screen, baseURL);
    await page.goto(screen.path);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
    expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} element(s))`)).toEqual([]);
  });
}
