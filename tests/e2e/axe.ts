// The one way the browser checks run axe (DECISIONS #136). It first waits for every finite
// CSS animation and transition on the page to finish: dialogs fade in from opacity 0
// (dialog.css), and axe run mid-fade measures half-transparent text and reports a color
// contrast failure that depends on machine speed. Infinite animations (the loading spinners)
// never finish and only rotate, so they don't count.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

export const WCAG_22_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// In-page code goes as a string because test code has no DOM types (DECISIONS #26).
const SETTLED = "document.getAnimations().every((a) => a.playState === 'finished' || a.effect?.getComputedTiming().iterations === Infinity)";

/** Waits for the page to stop animating, then runs axe for WCAG 2.2 AA, optionally scoped to `include`. */
export async function runAxe(page: Page, include?: string): ReturnType<AxeBuilder["analyze"]> {
  await page.waitForFunction(SETTLED);
  const builder = new AxeBuilder({ page }).withTags(WCAG_22_AA);
  if (include) builder.include(include);
  return builder.analyze();
}
