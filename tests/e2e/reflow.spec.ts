// Conformance check 7 (SPEC §12): WCAG 2.2 reflow. Every screen at 320px wide, with no
// sideways scrolling and nothing cut off. 360px is the design target; 320px is the floor.
import { expect, test } from "@playwright/test";
import { findReflowProblems } from "./reflow.ts";
import { SCREENS, viewAs } from "./screens.ts";

for (const screen of SCREENS) {
  test(`${screen.name} reflows at 320px`, async ({ page, baseURL }) => {
    await viewAs(page, screen, baseURL);
    await page.goto(screen.path);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(findReflowProblems)).toEqual([]);
  });
}
