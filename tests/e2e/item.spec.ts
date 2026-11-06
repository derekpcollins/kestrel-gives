// The item page (SPEC §7.3, §7.4; DECISIONS #86, #88), read-only, against the real API on dev.
// Other specs may jump phases meanwhile, so these check what holds in every phase, and the
// refresh tests rewrite the API's answer in the browser instead of writing bids to dev.
import { expect, test, type Page } from "@playwright/test";
import { pageLoaded } from "./page-load.ts";

test.beforeEach(({}, info) => test.skip(info.project.name !== "light-1280", "content is the same in every project"));

// A refresh can still be in flight when a test ends; let its rewrite go quietly.
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });

const content = (page: Page) => page.locator("[data-item-content]");

test("Lakeside Cabin Weekend: title, donor, back link, five photos, and the public bid history with one crown", async ({ page }) => {
  await page.goto("/items/1");
  await pageLoaded(page);
  await expect(page).toHaveTitle("Lakeside Cabin Weekend · Kestrel Gives");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lakeside Cabin Weekend");
  await expect(content(page)).toContainText("Donated by Theo Lindqvist");
  await expect(page.getByRole("link", { name: "Silent Auction" }).first()).toHaveAttribute("href", "/silent-auction");
  // No nav link claims to be the current page on an item page.
  await expect(page.locator('.site-header [aria-current="page"]')).toHaveCount(0);

  const carousel = page.getByRole("region", { name: "Photos of Lakeside Cabin Weekend" });
  await expect(carousel.getByRole("button", { name: /^Photo \d of 5$/ })).toHaveCount(5);
  await carousel.getByRole("button", { name: "Next photo" }).click();
  await expect(carousel.getByRole("img", { name: "Lakeside Cabin Weekend, photo 2 of 5" })).toBeVisible();

  const history = page.getByRole("region", { name: /^Bid history \(6 bids\) · times in [A-Z]+[+\-\d:]*$/ });
  await expect(history.getByRole("row")).toHaveCount(7); // header + six bids
  await expect(history.locator(".avatar__crown")).toHaveCount(1);
  const top = history.getByRole("row").nth(1);
  await expect(top.getByRole("rowheader", { name: "Priya Natarajan (top bidder)", exact: true })).toBeVisible(); // the initials are aria-hidden
  await expect(top).toContainText("$240");
  await expect(top.locator(".avatar__crown")).toHaveCount(1);
  expect(await page.locator("main").innerText()).not.toMatch(/\b(pay|paid|payment|checkout)\b/i);
});

test("A cancelled item keeps its page with a banner, and offers nothing", async ({ page }) => {
  await page.goto("/items/10");
  await pageLoaded(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Board game night, hosted");
  await expect(content(page).locator(".banner--danger")).toContainText("This item has been cancelled");
  await expect(content(page).locator(".item-panel__status")).toHaveText("Cancelled");
  await expect(content(page).locator(".item-panel__note")).toHaveCount(0);
  // No winner, so no crown, though the bids still show.
  await expect(content(page).locator(".bid-history tbody tr").first()).toBeVisible();
  await expect(content(page).locator(".avatar__crown")).toHaveCount(0);
  await expect(content(page).getByText("(top bidder)")).toHaveCount(0);
});

test("On a phone: five thumbnails on one row, and the bid history in two columns with the time under the name", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/items/1");
  await pageLoaded(page);
  const thumbs = page.locator(".carousel__thumb");
  await expect(thumbs).toHaveCount(5);
  const boxes = await thumbs.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: r.top, width: r.width, height: r.height })));
  expect(new Set(boxes.map((b) => b.top)).size).toBe(1);
  for (const b of boxes) expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);

  const table = page.locator("table.bid-history");
  await expect(table.getByRole("columnheader")).toHaveText(["Bidder", "Amount"]);
  const row = table.locator("tbody tr").first();
  await expect(row.locator(".bid-history__when")).toBeVisible();
  await expect(row.locator(".bid-history__when")).not.toHaveText(/[A-Z]{3}$/); // the zone is beside the heading
  await expect(row.locator("td.bid-history__time")).toBeHidden();
  // Every row is one line of name plus one caption line: no three-line wraps.
  const heights = await table.locator("tbody th").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  const line = await row.locator(".bid-history__when").evaluate((e) => e.getBoundingClientRect().height);
  for (const h of heights) expect(h).toBeLessThan(line * 4);
});

test("Instant sale: price, stock, no bid history; an unknown item says so", async ({ page }) => {
  await page.goto("/items/13"); // lemon squares, sold out in every phase
  await pageLoaded(page);
  await expect(content(page).locator(".item-panel__amount")).toHaveText("$15");
  await expect(content(page).locator(".item-panel__detail")).toHaveText("None left");
  await expect(page.getByRole("region", { name: /Bid history/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Instant Sale" }).first()).toHaveAttribute("href", "/instant-sale");

  await page.goto("/items/99999");
  await pageLoaded(page);
  await expect(page.getByRole("heading", { level: 1, name: "We couldn't find that item" })).toBeVisible();
  await expect(page).toHaveTitle("Item not found · Kestrel Gives");
});

type Mode = "real" | "viewer-top" | "viewer-outbid" | "watching" | "watching-new-bid";

/** Rewrites the item API's answer in the browser, as the test sets `mode` (no writes to dev). */
async function controlAnswers(page: Page): Promise<{ set(mode: Mode): void }> {
  let mode: Mode = "real";
  await page.route(/\/api\/items\?id=\d+$/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const item = body.item;
    if (mode === "viewer-top") Object.assign(item, { viewerIsTopBidder: true, viewerHasBid: true, highBidCents: 24_000 });
    if (mode === "viewer-outbid") Object.assign(item, { viewerIsTopBidder: false, viewerHasBid: true, highBidCents: 30_000 });
    if (mode === "watching") Object.assign(item, { viewerIsTopBidder: false, viewerHasBid: false, highBidCents: 24_000 });
    if (mode === "watching-new-bid") Object.assign(item, { viewerIsTopBidder: false, viewerHasBid: false, highBidCents: 30_000 });
    await route.fulfill({ response, json: body });
  });
  return { set: (m) => { mode = m; } };
}

test("The 30-second refresh announces being outbid and keeps the photo the visitor is on", async ({ page }) => {
  await page.clock.install();
  const answers = await controlAnswers(page);
  answers.set("viewer-top");
  await page.goto("/items/1");
  await pageLoaded(page);
  const carousel = page.getByRole("region", { name: "Photos of Lakeside Cabin Weekend" });
  await carousel.getByRole("button", { name: "Photo 3 of 5" }).click();
  await expect(page.locator("[data-item-status]")).toHaveText("");

  answers.set("viewer-outbid");
  await page.clock.fastForward("00:31");
  await expect(page.locator("[data-item-status]")).toHaveText("You've been outbid. The top bid is now $300.");
  await expect(carousel.getByRole("img", { name: "Lakeside Cabin Weekend, photo 3 of 5" })).toBeVisible();
  await expect(carousel.getByRole("button", { name: "Photo 3 of 5" })).toHaveAttribute("aria-current", "true");
});

test("The refresh says nothing when someone else's bid changes and the viewer hasn't bid", async ({ page }) => {
  await page.clock.install();
  const answers = await controlAnswers(page);
  answers.set("watching");
  await page.goto("/items/1");
  await pageLoaded(page);
  let requests = 0;
  page.on("request", (r) => { if (/\/api\/items\?id=1$/.test(r.url())) requests++; });
  answers.set("watching-new-bid");
  await page.clock.fastForward("00:31");
  await expect.poll(() => requests).toBeGreaterThan(0); // it did refresh...
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-item-status]")).toHaveText(""); // ...and announced nothing
});
