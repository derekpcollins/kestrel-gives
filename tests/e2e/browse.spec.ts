// Silent Auction and Instant Sale (SPEC §8, DECISIONS #88) against the real API on dev. These
// only read, and other specs may jump phases meanwhile, so nothing here depends on the phase:
// the items, their order and the announcements are the same in every phase.
import { expect, test, type Page } from "@playwright/test";
import { pageLoaded } from "./page-load.ts";

test.beforeEach(({}, info) => test.skip(info.project.name !== "light-1280", "content is the same in every project"));

const grid = (page: Page) => page.locator("[data-browse-grid]");
const titles = (page: Page) => grid(page).locator(".card__title a");

test("Silent Auction: every active auction as a tile, linking to its page; cancelled items are left out", async ({ page }) => {
  await page.goto("/silent-auction");
  await pageLoaded(page);
  await expect(grid(page).getByRole("listitem")).toHaveCount(9);
  await expect(page.locator("main")).not.toContainText("9 items"); // no item count (visible changes C)
  await expect(titles(page).first()).toHaveText(/^Weekend dog-sitting/); // newest
  await expect(grid(page)).not.toContainText("Board game night");
  for (const href of await titles(page).evaluateAll((links) => links.map((a) => a.getAttribute("href")))) expect(href).toMatch(/^\/items\/\d+$/);
  await expect(page.getByLabel("Sort by").locator("option")).toHaveText(["Newest", "Price: low to high", "Most bids"]);
  await expect(page.locator("[data-browse-status]")).toHaveText(""); // nothing announced on load
  expect(await page.locator("main").innerText()).not.toMatch(/\b(pay|paid|payment|checkout)\b/i);
});

test("Choosing a sort reorders the tiles, puts it in the URL and announces it; a reload keeps it", async ({ page }) => {
  await page.goto("/silent-auction");
  await pageLoaded(page);
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
  await pageLoaded(page);
  await expect(page.getByLabel("Sort by")).toHaveValue("bids");
  await expect(titles(page).first()).toHaveText(/^Lakeside Cabin Weekend/);
  await expect(page.locator("[data-browse-status]")).toHaveText("");
});

test("Instant Sale: price and newest only; an unknown sort falls back to newest", async ({ page }) => {
  await page.goto("/instant-sale?sort=bids");
  await pageLoaded(page);
  await expect(page.getByLabel("Sort by")).toHaveValue("newest");
  await expect(page.getByLabel("Sort by").locator("option")).toHaveText(["Newest", "Price: low to high"]);
  await expect(grid(page).getByRole("listitem")).toHaveCount(6);
  await page.getByLabel("Sort by").selectOption("price");
  await expect(titles(page)).toHaveText([/^Banana bread/, /^Lemon squares/, /^Homemade hot sauce/, /^Hand-poured candles/, /^Desk plant/, /^Hand-knit scarf/]);
});

test("Viewing as someone else redraws the tiles for them without announcing anything", async ({ page }) => {
  await page.goto("/silent-auction");
  await pageLoaded(page);
  await page.getByLabel("Viewing as").selectOption({ label: "Dev Kapoor (employee)" });
  await expect(page.locator(".demo-bar__who")).toContainText("Dev Kapoor");
  await pageLoaded(page);
  // Dev is never the top bidder on guitar lessons, whatever the phase.
  await expect(titles(page).filter({ hasText: "Guitar lessons" })).not.toContainText("You're winning");
  await expect(page.locator("[data-browse-status]")).toHaveText("");
  await page.getByLabel("Viewing as").selectOption({ label: "Jules Ferreira (employee)" });
  await expect(page.locator(".demo-bar__who")).toContainText("Jules Ferreira");
});

test("Tiles in a row share one height; only the number takes the amount style", async ({ page }) => {
  await page.goto("/silent-auction");
  await pageLoaded(page);
  const boxes = await grid(page).locator(".item-tile").evaluateAll((tiles) =>
    tiles.map((t) => { const r = t.getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height) }; }));
  const rows = new Map<number, number[]>();
  for (const b of boxes) rows.set(b.top, [...(rows.get(b.top) ?? []), b.height]);
  expect(rows.size).toBeGreaterThan(1);
  for (const heights of rows.values()) expect(new Set(heights).size).toBe(1);
  // Only the number takes the amount style; the label is on the detail line.
  const cabin = grid(page).locator(".item-tile").filter({ hasText: "Lakeside Cabin Weekend" });
  await expect(cabin.locator(".item-tile__amount")).toHaveText("$240");
  await expect(cabin.locator(".item-tile__detail")).toHaveText(/^(Top|Winning) bid · 6 bids$/);
});

// Visible changes C: the sort's place in the header, and prices pinned to the bottom of each tile.
test("Sort by sits right of the heading on desktop and under the description on phones", async ({ page }) => {
  for (const path of ["/silent-auction", "/instant-sale"]) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(path);
    await pageLoaded(page);
    const title = (await page.locator(".page-header__title").boundingBox())!;
    const description = (await page.locator(".page-header__description").boundingBox())!;
    const select = (await page.getByLabel("Sort by").boundingBox())!;
    const header = (await page.locator(".page-header").boundingBox())!;
    expect(Math.abs(select.y + select.height - (title.y + title.height)), `${path} 1280: level with the heading`).toBeLessThan(12);
    expect(Math.abs(select.x + select.width - (header.x + header.width)), `${path} 1280: right-aligned`).toBeLessThan(2);
    expect(description.y, `${path} 1280: description below`).toBeGreaterThan(select.y + select.height);

    await page.setViewportSize({ width: 390, height: 900 });
    const narrowDescription = (await page.locator(".page-header__description").boundingBox())!;
    const narrowSelect = (await page.getByLabel("Sort by").boundingBox())!;
    expect(narrowSelect.y, `${path} 390: under the description`).toBeGreaterThan(narrowDescription.y + narrowDescription.height);
  }
});

test("Prices line up across a row of tiles, whatever the titles' lengths", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const path of ["/silent-auction", "/instant-sale"]) {
    await page.goto(path);
    await pageLoaded(page);
    const tiles = await grid(page).locator(".item-tile").evaluateAll((cards) =>
      cards.map((card) => ({
        top: Math.round(card.getBoundingClientRect().top),
        bottom: card.getBoundingClientRect().bottom,
        title: card.querySelector(".card__title")!.getBoundingClientRect().height,
        amount: card.querySelector(".item-tile__amount")!.getBoundingClientRect().top,
      })),
    );
    const rows = new Map<number, typeof tiles>();
    for (const t of tiles) rows.set(t.top, [...(rows.get(t.top) ?? []), t]);
    let mixed = false;
    for (const row of rows.values()) {
      if (new Set(row.map((t) => Math.round(t.title))).size > 1) mixed = true;
      for (const t of row) expect(Math.abs(t.amount - row[0]!.amount), `${path}: prices level in a row`).toBeLessThan(1);
    }
    if (path === "/silent-auction") expect(mixed, "the seed has a row with titles of different lengths").toBe(true);
  }
});
