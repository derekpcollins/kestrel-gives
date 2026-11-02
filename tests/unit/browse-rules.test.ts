// Browse pages (SPEC §8, DECISIONS #88): sorts per page, the sort in the URL, and the words.
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { countWords, emptyWords, searchForSort, sortFromSearch, sortedMessage, sortsFor, tileContext, tileView } from "../../src/pages/browse-rules.ts";
import type { AppState } from "../../src/app-state.ts";
import type { ItemSummary } from "../../src/items-api.ts";

describe("browse sorts", () => {
  test("most bids is offered on the silent auction only", () => {
    assert.deepEqual(sortsFor("auction"), ["newest", "price", "bids"]);
    assert.deepEqual(sortsFor("instant"), ["newest", "price"]);
  });
  test("the sort comes from ?sort=, falling back to newest when the page doesn't offer it", () => {
    assert.equal(sortFromSearch("?sort=price", "auction"), "price");
    assert.equal(sortFromSearch("?sort=bids", "auction"), "bids");
    assert.equal(sortFromSearch("?sort=bids", "instant"), "newest");
    assert.equal(sortFromSearch("?sort=price-desc", "auction"), "newest");
    assert.equal(sortFromSearch("", "instant"), "newest");
  });
  test("newest is the default, so it leaves the URL clean; other parameters are kept", () => {
    assert.equal(searchForSort("?sort=price", "newest"), "");
    assert.equal(searchForSort("", "bids"), "?sort=bids");
    assert.equal(searchForSort("?demo=off", "price"), "?demo=off&sort=price");
  });
});

describe("browse words", () => {
  test("count, the sort announcement and the empty state", () => {
    assert.equal(countWords(1), "1 item");
    assert.equal(countWords(9), "9 items");
    assert.equal(sortedMessage("price", 6), "Sorted by price: low to high. 6 items.");
    assert.equal(sortedMessage("bids", 1), "Sorted by most bids. 1 item.");
    assert.equal(emptyWords("instant").title, "No instant sale items yet");
  });
});

describe("tiles from the API", () => {
  const summary: ItemSummary = {
    id: "7", type: "auction", title: "Pasta night", coverUrl: "/seed/pasta-night-1.jpg",
    startingBidCents: 5_000, topBidCents: 5_500, bidCount: 2, priceCents: null, remaining: null,
    viewerIsTopBidder: false, viewerHasBid: true,
  };
  test("cents become dollars and the tile links to /items/<id> (DECISIONS #86)", () => {
    assert.deepEqual(tileView(summary), {
      type: "auction", title: "Pasta night", href: "/items/7", photo: "/seed/pasta-night-1.jpg",
      startingBid: 50, topBid: 55, bidCount: 2, viewerIsTopBidder: false, viewerHasBid: true,
    });
    const instant = tileView({ ...summary, type: "instant", startingBidCents: null, topBidCents: null, priceCents: 1_200, remaining: 0, coverUrl: "" });
    assert.equal(instant.price, 12);
    assert.equal(instant.remaining, 0);
    assert.equal("photo" in instant, false);
  });
  test("the tile context comes from the app state; missing dates fall far ahead", () => {
    const state = { now: "2026-11-02T20:00:00.000Z", event: { phase: "live", biddingOpensAt: "2026-10-31T20:00:00.000Z", biddingClosesAt: null } } as unknown as AppState;
    const ctx = tileContext(state);
    assert.equal(ctx.phase, "live");
    assert.equal(ctx.biddingOpens.toISOString(), "2026-10-31T20:00:00.000Z");
    assert.ok(ctx.biddingCloses.getTime() > ctx.now.getTime() + 300 * 86_400_000);
  });
});
