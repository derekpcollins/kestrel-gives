import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { tileText, type TileContext, type TileItem } from "../../src/components/item-tile-rules.ts";

const tz = "America/New_York";
const opens = new Date("2026-11-17T14:00:00Z");
const closes = new Date("2026-11-21T01:00:00Z");
const ctx = (phase: TileContext["phase"], now = new Date("2026-11-18T15:00:00Z")): TileContext => ({ phase, now, biddingOpens: opens, biddingCloses: closes, timeZone: tz });
const auction = (over: Partial<TileItem> = {}): TileItem => ({ type: "auction", startingBid: 25, bidCount: 0, ...over });
const instant = (over: Partial<TileItem> = {}): TileItem => ({ type: "instant", price: 40, remaining: 8, ...over });

describe("item tile: amount line comes from the data", () => {
  test("auction with no bids shows its own starting bid", () => {
    assert.deepEqual(tileText(auction({ startingBid: 35 }), ctx("live")), { amount: "$35", detail: "Starting bid · No bids yet", status: undefined });
  });
  test("auction with bids shows the top bid and the count", () => {
    const t = tileText(auction({ topBid: 240, bidCount: 6 }), ctx("live"));
    assert.equal(t.amount, "$240");
    assert.equal(t.detail, "Top bid · 6 bids");
    assert.equal(tileText(auction({ topBid: 30, bidCount: 1 }), ctx("live")).detail, "Top bid · 1 bid");
  });
  test("ended auctions say winning bid, or no bids", () => {
    assert.deepEqual([tileText(auction({ topBid: 1200, bidCount: 9 }), ctx("ended")).amount, tileText(auction({ topBid: 1200, bidCount: 9 }), ctx("ended")).detail], ["$1,200", "Winning bid · 9 bids"]);
    assert.deepEqual([tileText(auction(), ctx("ended")).amount, tileText(auction(), ctx("ended")).detail], ["$25", "Starting bid · No bids"]);
  });
  test("instant sale shows price and stock", () => {
    assert.deepEqual([tileText(instant(), ctx("live")).amount, tileText(instant(), ctx("live")).detail], ["$40", "8 left"]);
    assert.equal(tileText(instant({ remaining: 10 }), ctx("submission")).detail, "10 available");
    assert.equal(tileText(instant({ remaining: 0 }), ctx("live")).detail, "None left");
  });
  test("ended instant sale: unsold stock says Sale ended, not N left; sold out stays sold out", () => {
    const unsold = tileText(instant({ remaining: 7 }), ctx("ended"));
    assert.deepEqual([unsold.amount, unsold.detail, unsold.status?.label], ["$40", "Sale ended", "Ended"]);
    const soldOut = tileText(instant({ remaining: 0 }), ctx("ended"));
    assert.deepEqual([soldOut.detail, soldOut.status?.label], ["None left", "Sold out"]);
  });
});

describe("item tile: one status, most important first", () => {
  const status = (item: TileItem, c: TileContext) => tileText(item, c).status;
  test("submission window: when bidding opens, in the viewer's zone", () => {
    assert.deepEqual(status(auction(), ctx("submission")), { label: "Opens Nov 17", tone: "neutral" });
  });
  test("live auction: winning, outbid, ending soon, or nothing", () => {
    assert.deepEqual(status(auction({ topBid: 60, bidCount: 3, viewerIsTopBidder: true }), ctx("live")), { label: "You're winning", tone: "success" });
    assert.deepEqual(status(auction({ topBid: 60, bidCount: 3, viewerHasBid: true }), ctx("live")), { label: "Outbid", tone: "danger" });
    assert.deepEqual(status(auction(), ctx("live", new Date("2026-11-20T12:00:00Z"))), { label: "Ending soon", tone: "warning" });
    assert.equal(status(auction(), ctx("live")), undefined);
  });
  test("outbid outranks ending soon", () => {
    assert.equal(status(auction({ topBid: 60, bidCount: 3, viewerHasBid: true }), ctx("live", new Date("2026-11-20T12:00:00Z")))?.label, "Outbid");
  });
  test("live instant sale: sold out, low stock, ending soon", () => {
    assert.deepEqual(status(instant({ remaining: 0 }), ctx("live")), { label: "Sold out", tone: "neutral" });
    assert.deepEqual(status(instant({ remaining: 2 }), ctx("live")), { label: "2 left", tone: "warning" });
    assert.equal(status(instant({ remaining: 4 }), ctx("live")), undefined);
    assert.equal(status(instant({ remaining: 4 }), ctx("live", new Date("2026-11-20T12:00:00Z")))?.label, "Ending soon");
  });
  test("ended: you won, ended, sold out", () => {
    assert.deepEqual(status(auction({ topBid: 60, bidCount: 3, viewerIsTopBidder: true }), ctx("ended")), { label: "You won", tone: "success" });
    assert.deepEqual(status(auction({ topBid: 60, bidCount: 3, viewerHasBid: true }), ctx("ended")), { label: "Ended", tone: "neutral" });
    assert.deepEqual(status(instant({ remaining: 0 }), ctx("ended")), { label: "Sold out", tone: "neutral" });
    assert.deepEqual(status(instant({ remaining: 3 }), ctx("ended")), { label: "Ended", tone: "neutral" });
  });
  test("cancelled outranks everything (shown only in Your Items)", () => {
    assert.deepEqual(status(auction({ cancelled: true, viewerIsTopBidder: true }), ctx("ended")), { label: "Cancelled", tone: "danger" });
  });
});
