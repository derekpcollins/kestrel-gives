// Bidding and buying on the item page (SPEC §7.4, §7.5; DECISIONS #88; Stage 4D). Other specs
// jump phases and read the seeded bids meanwhile, so these never write to dev. The browser sees
// a live event, and each test answers the bid or purchase itself, the way the API does.
// tests/db/sales.test.ts covers the real saves, the rules and the races.
import { expect, test, type Page, type Route } from "@playwright/test";
import { pageLoaded } from "./page-load.ts";
import { runAxe } from "./axe.ts";

test.beforeEach(({}, info) => test.skip(info.project.name !== "light-1280" && info.project.name !== "light-390", "content is the same in every project; 390 checks the phone"));

// A refresh can still be in flight when a test ends; let its rewrite go quietly.
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });

const status = (page: Page) => page.locator("[data-item-status]");
const panel = (page: Page) => page.locator("[data-item-panel]");
const field = (page: Page) => page.getByRole("textbox", { name: "Your bid" });

type Json = Record<string, any>;

/** The event is live, whatever phase another spec jumped to. */
async function liveEvent(page: Page): Promise<void> {
  await page.route(/\/api\/app(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.event) body.event.phase = "live";
    await route.fulfill({ response, json: body });
  });
}

/** Rewrites the item API's GET answer with `edit` (the real item, as the viewer can act on it). */
async function itemAnswers(page: Page, edit: (body: Json) => void): Promise<{ set(next: (body: Json) => void): void }> {
  let current = edit;
  await page.route(/\/api\/items\?id=\d+$/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.phase = "live";
    body.blocked = null;
    current(body);
    await route.fulfill({ response, json: body });
  });
  return { set: (next) => { current = next; } };
}

/** An outbid viewer on the cabin: top bid $240, so the minimum is $245. */
const outbid = (body: Json) => {
  Object.assign(body.item, { viewerIsTopBidder: false, viewerHasBid: true, highBidCents: 24_000 });
  Object.assign(body, { minimumBidCents: 24_500, bidHint: "At least $245. Bids go up by $5." });
};

async function openCabin(page: Page): Promise<{ set(next: (body: Json) => void): void }> {
  await liveEvent(page);
  const answers = await itemAnswers(page, outbid);
  await page.goto("/items/1");
  await pageLoaded(page);
  return answers;
}

test("The bid field starts at the minimum, opens the number pad, and carries the minimum as its help", async ({ page }) => {
  await openCabin(page);
  await expect(field(page)).toHaveValue("245");
  await expect(field(page)).toHaveAttribute("inputmode", "numeric");
  await expect(field(page)).toHaveAccessibleDescription("At least $245. Bids go up by $5.");
  await expect(panel(page).locator(".item-panel__note")).toHaveCount(0); // the help says it; no repeat
  const { violations } = await runAxe(page, "[data-item-panel]");
  expect(violations.map((v) => v.id)).toEqual([]);
});

test("A bid: confirm dialog with the amount and item, then the result is announced once and the form gives way", async ({ page }) => {
  const answers = await openCabin(page);
  let sent: Json | null = null;
  await page.route("**/api/bids", async (route: Route) => {
    sent = route.request().postDataJSON();
    const response = await page.request.get("/api/items?id=1");
    const body = await response.json();
    body.item.highBidCents = 25_000;
    Object.assign(body.item, { viewerIsTopBidder: true, viewerHasBid: true });
    Object.assign(body, { phase: "live", blocked: { code: "high-bidder", message: "You're already the high bidder." }, message: "Your bid of $250 is in. You're the high bidder." });
    answers.set((b) => { Object.assign(b.item, body.item); b.blocked = body.blocked; });
    await route.fulfill({ status: 201, json: body });
  });

  await field(page).fill("250");
  await page.getByRole("button", { name: "Place bid" }).click();
  const dialog = page.getByRole("dialog", { name: "Place a $250 bid?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Lakeside Cabin Weekend");
  await expect(dialog).toContainText("Top bid $240 · 6 bids");
  await expect(dialog).toContainText("Your bid: $250");
  await expect(dialog).toContainText("Bids can't be taken back.");
  await expect(dialog.getByRole("button", { name: "Place bid" })).toBeFocused();
  // Check contrast once the dialog has finished fading in.
  await expect(dialog).toHaveCSS("opacity", "1");
  const { violations } = await runAxe(page, "dialog");
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ") + " " + n.failureSummary).join("; ")}`)).toEqual([]);

  await dialog.getByRole("button", { name: "Place bid" }).click();
  await expect(dialog).toBeHidden();
  expect(sent).toEqual({ itemId: "1", amountCents: 25_000, seenHighBidCents: 24_000 });
  // Announced through the page's live region; the toast shows the same words without repeating them.
  await expect(status(page)).toHaveText("Your bid of $250 is in. You're the high bidder.");
  await expect(page.locator(".toast-region__stack--quiet .toast")).toContainText("Your bid of $250 is in.");
  await expect(page.locator(".toast-region__stack--live .toast")).toHaveCount(0);
  await expect(field(page)).toHaveCount(0);
  await expect(panel(page).locator(".item-panel__note")).toHaveText("You're the high bidder.");
  await expect(panel(page)).toBeFocused();
});

test("A lost race: the dialog closes, the field shows the new minimum with the reason, and it's announced", async ({ page }) => {
  const answers = await openCabin(page);
  await page.route("**/api/bids", async (route) => {
    answers.set((b) => {
      Object.assign(b.item, { highBidCents: 25_000, viewerIsTopBidder: false, viewerHasBid: true });
      Object.assign(b, { minimumBidCents: 25_500, bidHint: "At least $255. Bids go up by $5." });
    });
    await route.fulfill({ status: 409, json: { ok: false, code: "outbid-race", error: "Someone just bid $250. The minimum is now $255.", minimumBidCents: 25_500, highBidCents: 25_000 } });
  });
  await page.getByRole("button", { name: "Place bid" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Place bid" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(field(page)).toHaveValue("255");
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveAttribute("aria-invalid", "true");
  await expect(field(page)).toHaveAccessibleDescription("At least $255. Bids go up by $5. Someone just bid $250. The minimum is now $255.");
  await expect(status(page)).toHaveText("Someone just bid $250. The minimum is now $255.");
  // The reason is under the field only: no toast (owner, 4E).
  await expect(page.locator(".toast")).toHaveCount(0);
  // Typing clears the message.
  await field(page).fill("260");
  await expect(field(page)).not.toHaveAttribute("aria-invalid");
});

test("Each result replaces the form's earlier toast", async ({ page }) => {
  const answers = await openCabin(page);
  let placed = 0;
  await page.route("**/api/bids", async (route) => {
    placed++;
    const body = await (await page.request.get("/api/items?id=1")).json();
    Object.assign(body.item, { viewerIsTopBidder: false, viewerHasBid: true, highBidCents: 24_000 });
    Object.assign(body, { phase: "live", blocked: null, minimumBidCents: 24_500, bidHint: "At least $245. Bids go up by $5.", message: `Your bid of $${240 + placed * 5} is in. You're the high bidder.` });
    answers.set(outbid);
    await route.fulfill({ status: 201, json: body });
  });
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Place bid" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Place bid" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await expect(page.locator(".toast")).toHaveCount(1);
  await expect(page.locator(".toast")).toContainText("Your bid of $250 is in.");
});

test("While live, Instant Sale pages talk about the sale; the silent auction about bidding", async ({ page }) => {
  await liveEvent(page);
  const banner = page.locator(".banner--phase .banner__title");
  await page.goto("/instant-sale");
  await pageLoaded(page);
  await expect(banner).toHaveText("The instant sale is open");
  await expect(page.locator(".banner--phase .banner__text")).toHaveText(/^It ends in /);
  await itemAnswers(page, () => {});
  await page.goto("/items/12");
  await pageLoaded(page);
  await expect(banner).toHaveText("The instant sale is open");
  await page.goto("/items/1");
  await pageLoaded(page);
  await expect(banner).toHaveText("Bidding is open");
  await page.goto("/silent-auction");
  await pageLoaded(page);
  await expect(banner).toHaveText("Bidding is open");
});

test("The dialog title balances its lines on a phone", async ({ page }) => {
  await liveEvent(page);
  await itemAnswers(page, (b) => { b.item.remaining = 6; });
  await page.goto("/items/12");
  await pageLoaded(page);
  await page.getByRole("button", { name: "Buy one" }).click();
  const title = page.getByRole("dialog").locator(".dialog__title");
  await expect(title).toHaveCSS("text-wrap", /balance/);
  await expect(title).toHaveText("Buy the Hand-knit scarf for $45?");
  // "Hand-knit" stays on one line.
  const word = title.locator(".dialog__word");
  await expect(word).toHaveText("Hand-knit");
  const lines = await word.evaluate((e) => e.getClientRects().length);
  expect(lines).toBe(1);
});

test("The field checks whole dollars and the minimum before any dialog opens", async ({ page }) => {
  await openCabin(page);
  for (const [typed, message] of [["12.50", "Whole dollars only."], ["100", "Enter at least $245."], ["", "Enter your bid."]] as const) {
    await field(page).fill(typed);
    await page.getByRole("button", { name: "Place bid" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(field(page)).toBeFocused();
    await expect(page.locator(".bid-form .field__message--error")).toHaveText(message);
  }
});

test("No answer from the server: the dialog stays open with the reason, to try again or cancel", async ({ page }) => {
  await openCabin(page);
  await page.route("**/api/bids", (route) => route.abort());
  await page.getByRole("button", { name: "Place bid" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Place bid" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("We couldn't place your bid. Check your connection and try again.");
  await expect(dialog.getByRole("button", { name: "Place bid" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Place bid" })).toBeFocused();
});

test("What the bidder typed survives the 30-second refresh; an untouched field follows the minimum", async ({ page }) => {
  await page.clock.install();
  const answers = await openCabin(page);
  answers.set((b) => { outbid(b); Object.assign(b, { minimumBidCents: 26_000, bidHint: "At least $260. Bids go up by $5." }); b.item.highBidCents = 25_500; });
  await page.clock.fastForward("00:31");
  await expect(field(page)).toHaveValue("260");
  await field(page).fill("400");
  await page.clock.fastForward("00:31");
  await expect(field(page)).toHaveAccessibleDescription(/At least \$260/);
  await expect(field(page)).toHaveValue("400");
  await expect(status(page)).toHaveText(""); // someone else's bid while still outbid: silent
});

test("Buying: one unit behind a dialog; the button stays for another, and the result is announced", async ({ page }) => {
  await liveEvent(page);
  await itemAnswers(page, (b) => { b.item.remaining = 6; });
  await page.route("**/api/purchases", async (route) => {
    const response = await page.request.get("/api/items?id=12");
    const body = await response.json();
    Object.assign(body, { phase: "live", blocked: null, message: `You bought the ${body.item.title} for $45.` });
    Object.assign(body.item, { remaining: 5, viewerPurchases: body.item.viewerPurchases + 1 });
    await route.fulfill({ status: 201, json: body });
  });
  await page.goto("/items/12"); // the scarf, not Jules's own
  await pageLoaded(page);
  await page.getByRole("button", { name: "Buy one" }).click();
  const dialog = page.getByRole("dialog", { name: "Buy the Hand-knit scarf for $45?" });
  await expect(dialog).toContainText("Price: $45");
  await expect(dialog).toContainText("6 left");
  await expect(dialog).toContainText("One per purchase.");
  await dialog.getByRole("button", { name: "Buy", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(status(page)).toHaveText("You bought the Hand-knit scarf for $45.");
  await expect(page.getByRole("button", { name: "Buy one" })).toBeFocused();
  await expect(panel(page).locator(".item-panel__detail")).toHaveText("5 left");
  expect(await page.locator("main").innerText()).not.toMatch(/\b(pay|paid|payment|checkout)\b/i);
});

test("Sold out while deciding: the dialog closes, the panel says so, and it's announced", async ({ page }) => {
  await liveEvent(page);
  const answers = await itemAnswers(page, (b) => { b.item.remaining = 1; });
  await page.route("**/api/purchases", async (route) => {
    answers.set((b) => { b.item.remaining = 0; b.blocked = { code: "sold-out", message: "Sold out." }; });
    await route.fulfill({ status: 409, json: { ok: false, code: "sold-out", error: "Sold out." } });
  });
  await page.goto("/items/12");
  await pageLoaded(page);
  await page.getByRole("button", { name: "Buy one" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Buy", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Buy one" })).toHaveCount(0);
  await expect(panel(page).locator(".item-panel__note").first()).toHaveText("Sold out.");
  await expect(status(page)).toHaveText("Sold out.");
  await expect(panel(page)).toBeFocused();
});

test("Your own item: no form, just \"This is your item.\"", async ({ page }) => {
  await liveEvent(page);
  await itemAnswers(page, (b) => { b.blocked = { code: "own-item", message: "This is your item." }; });
  await page.goto("/items/1");
  await pageLoaded(page);
  await expect(panel(page).locator(".item-panel__note")).toHaveText("This is your item.");
  await expect(field(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Place bid|Buy one/ })).toHaveCount(0);
});
