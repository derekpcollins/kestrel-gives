// Bidding and buying rules (SPEC §7.4, §7.5, DECISIONS #88) and the endpoints' input checks.
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { bidBlock, bidHint, buyBlock, checkBid, minimumBidCents, raceMessage, refusalStatus, type BidState, type BuyState } from "../../src/components/sale-rules.ts";
import { parseBidRequest, parseBuyRequest, parseItemsQuery } from "../../lib/api/sale-requests.ts";

const bid = (over: Partial<BidState> = {}): BidState => ({
  phase: "live", cancelled: false, viewerIsSubmitter: false,
  startingBidCents: 5_000, incrementCents: 500, highBidCents: null, viewerIsHighBidder: false, ...over,
});
const buy = (over: Partial<BuyState> = {}): BuyState => ({ phase: "live", cancelled: false, viewerIsSubmitter: false, remaining: 4, ...over });
const code = (r: { code: string } | null) => r?.code ?? null;

describe("minimum bid and its copy come from the settings and the high bid (§7.4)", () => {
  test("first bid: at least the starting bid", () => {
    assert.equal(minimumBidCents(bid()), 5_000);
    assert.equal(bidHint(bid()), "At least $50. Bids go up by $5.");
  });
  test("later bids: the high bid plus the increment, whatever the settings", () => {
    assert.equal(minimumBidCents(bid({ highBidCents: 5_500 })), 6_000);
    assert.equal(bidHint(bid({ highBidCents: 120_000, incrementCents: 2_500 })), "At least $1,225. Bids go up by $25.");
  });
  test("the race message names the new high bid and minimum", () => {
    assert.equal(raceMessage(5_500, 6_000), "Someone just bid $55. The minimum is now $60.");
  });
});

describe("checkBid", () => {
  test("accepts the exact minimum and anything above it, in whole dollars", () => {
    assert.equal(checkBid(bid(), 5_000), null);
    assert.equal(checkBid(bid({ highBidCents: 5_000 }), 5_500), null);
    assert.equal(checkBid(bid({ highBidCents: 5_000 }), 9_900), null);
  });
  test("refuses below the starting bid or below high bid + increment", () => {
    assert.equal(checkBid(bid(), 4_900)?.message, "Bids must be at least $50.");
    assert.equal(checkBid(bid({ highBidCents: 5_000 }), 5_400)?.message, "Bids must be at least $55.");
  });
  test("refuses cents and nonsense amounts", () => {
    for (const amount of [5_050, 0, -500, 1.5, Number.NaN]) assert.equal(code(checkBid(bid(), amount)), "not-whole-dollars", String(amount));
  });
  test("the current high bidder can't bid again (§7.4)", () => {
    const r = checkBid(bid({ highBidCents: 5_000, viewerIsHighBidder: true }), 9_000);
    assert.deepEqual(r, { code: "high-bidder", message: "You're already the high bidder." });
  });
  test("no bidding on your own item (v1.12)", () => {
    assert.deepEqual(checkBid(bid({ viewerIsSubmitter: true }), 9_000), { code: "own-item", message: "This is your item." });
  });
  test("blocked outside the live phase and on cancelled items (§7.1, §7.3)", () => {
    assert.equal(code(checkBid(bid({ phase: "submission" }), 9_000)), "not-open");
    assert.equal(code(checkBid(bid({ phase: "ended" }), 9_000)), "ended");
    assert.equal(code(checkBid(bid({ cancelled: true }), 9_000)), "cancelled");
    // Cancelled wins over phase and ownership: it's the thing the page shows.
    assert.equal(code(bidBlock(bid({ cancelled: true, phase: "ended", viewerIsSubmitter: true }))), "cancelled");
  });
  test("a lost race gets the new minimum; a stale page that still clears the minimum is fine", () => {
    const now = bid({ highBidCents: 5_500 });
    assert.deepEqual(checkBid(now, 5_500, 5_000), { code: "outbid-race", message: "Someone just bid $55. The minimum is now $60." });
    assert.deepEqual(checkBid(now, 5_500, null), { code: "outbid-race", message: "Someone just bid $55. The minimum is now $60." });
    assert.equal(checkBid(now, 6_000, 5_000), null);
    // The page saw the current high bid, so it's simply too low.
    assert.equal(code(checkBid(now, 5_500, 5_500)), "too-low");
  });
});

describe("buyBlock (§7.5)", () => {
  test("open while stock lasts, one unit at a time", () => {
    assert.equal(buyBlock(buy({ remaining: 1 })), null);
    assert.deepEqual(buyBlock(buy({ remaining: 0 })), { code: "sold-out", message: "Sold out." });
  });
  test("blocked outside live, when cancelled, and on your own item", () => {
    assert.equal(code(buyBlock(buy({ phase: "submission" }))), "not-open");
    assert.equal(buyBlock(buy({ phase: "ended" }))?.message, "Buying has ended.");
    assert.equal(code(buyBlock(buy({ cancelled: true }))), "cancelled");
    assert.equal(buyBlock(buy({ viewerIsSubmitter: true }))?.message, "This is your item.");
  });
  test("statuses: 422 for amounts, 403 for your own item, 409 for state", () => {
    assert.deepEqual(["too-low", "not-whole-dollars", "own-item", "outbid-race", "sold-out", "ended"].map((c) => refusalStatus(c as never)), [422, 422, 403, 409, 409, 409]);
  });
});

describe("request parsing (SPEC §11)", () => {
  test("items query: one item by id, or a list by type and sort", () => {
    assert.deepEqual(parseItemsQuery(new URLSearchParams("id=12")), { kind: "one", id: "12" });
    assert.deepEqual(parseItemsQuery(new URLSearchParams("type=auction")), { kind: "list", type: "auction", sort: "newest" });
    assert.deepEqual(parseItemsQuery(new URLSearchParams("type=auction&sort=bids")), { kind: "list", type: "auction", sort: "bids" });
    assert.ok("error" in parseItemsQuery(new URLSearchParams("type=instant&sort=bids")));
    assert.ok("error" in parseItemsQuery(new URLSearchParams("type=auction&sort=price-desc")));
    assert.ok("error" in parseItemsQuery(new URLSearchParams("id=0")));
    assert.ok("error" in parseItemsQuery(new URLSearchParams("")));
  });
  test("bid body: an item id and whole-dollar cents", () => {
    assert.deepEqual(parseBidRequest({ itemId: "3", amountCents: 6_000 }), { itemId: "3", amountCents: 6_000 });
    assert.deepEqual(parseBidRequest({ itemId: 3, amountCents: 6_000, seenHighBidCents: null }), { itemId: "3", amountCents: 6_000, seenHighBidCents: null });
    assert.deepEqual(parseBidRequest({ itemId: "3", amountCents: 6_050 }), { error: "Whole dollars only." });
    assert.deepEqual(parseBidRequest({ itemId: "3", amountCents: "6000" }), { error: "Whole dollars only." });
    assert.ok("error" in parseBidRequest({ itemId: "x", amountCents: 6_000 }));
    assert.ok("error" in parseBidRequest([]));
  });
  test("buy body: just an item id; no quantity (one unit per purchase)", () => {
    assert.deepEqual(parseBuyRequest({ itemId: "11", quantity: 5 }), { itemId: "11" });
    assert.ok("error" in parseBuyRequest({}));
  });
});
