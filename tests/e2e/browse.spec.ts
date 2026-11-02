// Silent Auction and Instant Sale (SPEC §8, DECISIONS #88) against the real API on dev. These
// only read, and other specs may jump phases meanwhile, so nothing here depends on the phase:
// the items, their order and the announcements are the same in every phase.
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(({}, info) => test.skip(info.project.name !== "light-1280", "content is the same in every project"));

const grid = (page: Page) => page.locator("[data-browse-grid]");
const titles = (page: Page) => grid(page).locator(".card__title a");
const loaded = (page: Page) => expect(grid(page)).not.toHaveAttribute("aria-busy");

test("Silent Auction: every active auction as a tile, linking to its page; cancelled items are left out", async ({ page }) => {
  await page.goto("/silent-auction");
  await loaded(page);
  await expect(grid(page).getByRole("listitem")).toHaveCount(9);
  await expect(page.locator("[data-browse-count]")).toHaveText("9 items");
  await expect(titles(page).first()).toHaveText(/^Weekend dog-sitting/); // newest
  await expect(grid(page)).not.toContainText("Board game night");
  for (const href of await titles(page).evaluateAll((links) => links.map((a) => a.getAttribute("href")))) expect(href).toMatch(/^\/items\/\d+$/);
  await expect(page.getByLabel("Sort by").locator("option")).toHaveText(["Newest", "Price: low to high", "Most bids"]);
  await expect(page.locator("[data-browse-status]")).toHaveText(""); // nothing announced on load
  expect(await page.locator("main").innerText()).not.toMatch(/\b(pay|paid|payment|checkout)\b/i);
});

test("Choosing a sort reorders the tiles, puts it in the URL and announces it; a reload keeps it", async ({ page }) => {
  await page.goto("/silent-auction");
  await loaded(page);
  // Focused first, as a keyboard user would be. (Arrow keys on a closed select open the menu
  // on macOS instead of changing it, so the change itself goes through selectOption.)
  await page.getByLabel("Sort by").focus();
  await page.getByLabel("Sort by").selectOption("price");
  await expect(page).toHaveURL(/\/silent-auction\?sort=price$/);
  await expect(page.locator("[data-browse-status]")).toHaveText("Sorted by price: low to high. 9 items.");
  await expect(titles(page).first()).toHaveText(/^Pottery class for two/);
  await expect(page.getByLabel("Sort by")).toBeFocused(); // redrawing the grid leaves focus on the control

  await page.getByLabel("Sort by").selectOption("bids");
  await expect(titles(page).first()).toHaveText(/^Lakeside Cabin Weekend/);
  await expect(page.locator("[data-browse-status]")).toHaveText("Sorted by most bids. 9 items.");

  await page.reload();
  await loaded(page);
  await expect(page.getByLabel("Sort by")).toHaveValue("bids");
  await expect(titles(page).first()).toHaveText(/^Lakeside Cabin Weekend/);
  await expect(page.locator("[data-browse-status]")).toHaveText("");
});

test("Instant Sale: price and newest only; an unknown sort falls back to newest", async ({ page }) => {
  await page.goto("/instant-sale?sort=bids");
  await loaded(page);
  await expect(page.getByLabel("Sort by")).toHaveValue("newest");
  await expect(page.getByLabel("Sort by").locator("option")).toHaveText(["Newest", "Price: low to high"]);
  await expect(grid(page).getByRole("listitem")).toHaveCount(6);
  await page.getByLabel("Sort by").selectOption("price");
  await expect(titles(page)).toHaveText([/^Banana bread/, /^Lemon squares/, /^Homemade hot sauce/, /^Hand-poured candles/, /^Desk plant/, /^Hand-knit scarf/]);
});

test("Viewing as someone else redraws the tiles for them without announcing anything", async ({ page }) => {
  await page.goto("/silent-auction");
  await loaded(page);
  await page.getByLabel("Viewing as").selectOption({ label: "Dev Kapoor (employee)" });
  await expect(page.locator(".demo-bar__who")).toContainText("Dev Kapoor");
  await loaded(page);
  // Dev is never the top bidder on guitar lessons, whatever the phase.
  await expect(titles(page).filter({ hasText: "Guitar lessons" })).not.toContainText("You're winning");
  await expect(page.locator("[data-browse-status]")).toHaveText("");
  await page.getByLabel("Viewing as").selectOption({ label: "Jules Ferreira (employee)" });
  await expect(page.locator(".demo-bar__who")).toContainText("Jules Ferreira");
});
