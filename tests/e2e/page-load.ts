// The one wait for a page's first data load (DECISIONS #137). Each data page ships its data
// region with aria-busy="true" and the page script removes it once the API has answered,
// whether the load worked or failed. Under vercel dev every API request starts a new Node
// process, so with 5 workers a page's first answers can take 3–3.5 s on a slower machine,
// close to the default 5 s. This wait gets 15 s; every other assertion keeps the default.
import { expect, type Page } from "@playwright/test";

export const PAGE_LOAD_MS = 15_000;

/** The data regions the pages mark busy until loaded (public/*.html). */
const REGIONS = ["[data-item-content]", "[data-browse-grid]", "[data-charities]", "[data-your-items]", "[data-proof-body]", "[data-admin-content]"].join(", ");

/** Waits until the page has a data region and none of its data regions is still loading. */
export async function pageLoaded(page: Page): Promise<void> {
  await expect(page.locator(REGIONS).first()).toBeAttached({ timeout: PAGE_LOAD_MS });
  await expect(page.locator(REGIONS).and(page.locator("[aria-busy]"))).toHaveCount(0, { timeout: PAGE_LOAD_MS });
}
