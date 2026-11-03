// The item page's words (SPEC §7.3–§7.5, DECISIONS #88): what the panel says in each state,
// bid times, and what the 30-second refresh announces.
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import type { TileContext } from "../../src/components/item-tile-rules.ts";
import type { BidView, ItemAnswer, ItemDetail } from "../../src/items-api.ts";
import { auctionResult, backLink, bidTime, itemIdFromPath, panelText, refreshAnnouncement, standingOf } from "../../src/pages/item-rules.ts";

const tz = "America/New_York";
const now = new Date("2026-11-02T20:00:00Z"); // 3:00 PM EST
const ctx = (phase: TileContext["phase"]): TileContext => ({
  phase, now, timeZone: tz, biddingOpens: new Date("2026-11-03T14:00:00Z"), biddingCloses: new Date("2026-11-04T22:00:00Z"),
});
const bid = (first: string, cents: number, isTop = false, bidderId = first): BidView => ({
  id: `${first}${cents}`, bidderId, firstName: first, lastName: "Test", amountCents: cents, createdAt: now.toISOString(), isTop,
});
const auction = (over: Partial<ItemDetail> = {}): ItemDetail => ({
  id: "1", type: "auction", title: "Lakeside Cabin Weekend", description: "", submitter: { id: "2", firstName: "Theo", lastName: "Lindqvist" },
  photos: [], cancelled: false, startingBidCents: 15_000, priceCents: null, quantity: null, remaining: null,
  bids: [bid("Priya", 24_000, true), bid("Jules", 20_000)], highBidCents: 24_000, viewerIsTopBidder: false, viewerHasBid: true, viewerPurchases: 0, ...over,
});
const instant = (over: Partial<ItemDetail> = {}): ItemDetail => ({
  ...auction(), type: "instant", title: "Hand-knit scarf", startingBidCents: null, priceCents: 4_500, quantity: 8, remaining: 6, bids: [], highBidCents: null,
  viewerHasBid: false, ...over,
});
const answer = (item: ItemDetail, over: Partial<ItemAnswer> = {}): ItemAnswer => ({
  ok: true, now: now.toISOString(), phase: "live", incrementCents: 500, item,
  minimumBidCents: item.type === "auction" ? (item.highBidCents ?? item.startingBidCents!) + 500 : null,
  bidHint: item.type === "auction" ? "At least $245. Bids go up by $5." : null, blocked: null, ...over,
});

describe("item panel words", () => {
  test("live auction, outbid: amount, detail and pill as on the tile, then the computed minimum", () => {
    const t = panelText(answer(auction()), ctx("live"));
    assert.deepEqual([t.amount, t.detail, t.status?.label, t.note], ["$240", "Top bid · 2 bids", "Outbid", "At least $245. Bids go up by $5."]);
  });
  test("why the viewer can't act: high bidder, own item, sold out", () => {
    assert.equal(panelText(answer(auction({ viewerIsTopBidder: true }), { blocked: { code: "high-bidder", message: "" } }), ctx("live")).note, "You're the high bidder.");
    assert.equal(panelText(answer(auction(), { blocked: { code: "own-item", message: "" } }), ctx("live")).note, "This is your item.");
    assert.equal(panelText(answer(instant({ remaining: 0 }), { blocked: { code: "sold-out", message: "" } }), ctx("live")).note, "Sold out.");
  });
  test("before bidding opens, the note says when, in the viewer's zone", () => {
    assert.equal(panelText(answer(auction()), ctx("submission")).note, "Bidding opens tomorrow at 9:00 AM EST.");
    assert.equal(panelText(answer(instant()), ctx("submission")).note, "Buying opens tomorrow at 9:00 AM EST.");
  });
  test("after the close: who won, or that the sale ended", () => {
    assert.equal(auctionResult(auction()), "Won by Priya Test for $240.");
    assert.equal(auctionResult(auction({ viewerIsTopBidder: true })), "You won this item for $240.");
    assert.equal(auctionResult(auction({ bids: [], highBidCents: null })), "Bidding has ended. No one bid on this item.");
    const ended = panelText(answer(instant()), ctx("ended"));
    assert.deepEqual([ended.detail, ended.note], ["Sale ended", "The sale has ended."]);
  });
  test("cancelled: the banner says it, so no note; instant sale counts what the viewer bought", () => {
    assert.equal(panelText(answer(auction({ cancelled: true })), ctx("live")).note, null);
    assert.equal(panelText(answer(instant({ viewerPurchases: 2 })), ctx("live")).bought, "You've bought 2.");
    assert.equal(panelText(answer(instant({ viewerPurchases: 1 })), ctx("live")).bought, "You've bought 1.");
    assert.equal(panelText(answer(instant()), ctx("live")).bought, null);
  });
});

describe("item page helpers", () => {
  test("the id comes from /items/<id> (DECISIONS #86)", () => {
    assert.equal(itemIdFromPath("/items/12"), "12");
    assert.equal(itemIdFromPath("/items/12/"), "12");
    for (const bad of ["/items/", "/items/0", "/items/abc", "/item", "/items/12/edit"]) assert.equal(itemIdFromPath(bad), null, bad);
  });
  test("back link goes to the item's own browse page", () => {
    assert.deepEqual(backLink({ type: "instant" }), { href: "/instant-sale", label: "Instant Sale" });
  });
  test("bid times: today, yesterday, then a short date, zone labeled", () => {
    assert.equal(bidTime("2026-11-02T19:14:00Z", now, tz), "today at 2:14 PM EST");
    assert.equal(bidTime("2026-11-02T02:00:00Z", now, tz), "yesterday at 9:00 PM EST");
    assert.equal(bidTime("2026-10-31T23:00:00Z", now, tz), "Oct 31 at 7:00 PM EDT");
    assert.equal(bidTime("2025-12-24T15:00:00Z", now, tz), "Dec 24, 2025 at 10:00 AM EST");
  });
});

describe("the 30-second refresh announces only the viewer's own standing (DECISIONS #88)", () => {
  const winning = auction({ viewerIsTopBidder: true, highBidCents: 20_000 });
  test("winning, then outbid: announced with the new top bid", () => {
    assert.equal(refreshAnnouncement(winning, auction()), "You've been outbid. The top bid is now $240.");
  });
  test("someone else's bid while the viewer stays outbid, or hasn't bid: silent", () => {
    assert.equal(refreshAnnouncement(auction({ highBidCents: 22_000 }), auction()), null);
    const watching = auction({ viewerHasBid: false });
    assert.equal(refreshAnnouncement(watching, { ...watching, highBidCents: 30_000 }), null);
  });
  test("back on top (an admin removed a higher bid): announced", () => {
    assert.equal(refreshAnnouncement(auction(), auction({ viewerIsTopBidder: true, highBidCents: 20_000 })), "You're the high bidder at $200.");
  });
  test("instant sale has no standing", () => {
    assert.equal(standingOf(instant()), "none");
    assert.equal(refreshAnnouncement(instant(), instant({ remaining: 1 })), null);
  });
});
