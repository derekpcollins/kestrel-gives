// The seed data follows the app's own rules (SPEC §7, §10), so the demo never shows a state
// the app couldn't produce. Pure data; no database.
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { describe, test } from "node:test";
import { TEMPLATE_DEFAULTS, TEMPLATE_KEYS } from "../../lib/email-templates.ts";
import { CHARITIES, EVENT, ITEMS, PLACEHOLDER_LOGO, PLACEHOLDER_PROOF, PROOFS, USERS, photoPath, type AuctionItem, type InstantItem } from "../../lib/seed/data.ts";

const PUBLIC = new URL("../../public/", import.meta.url);
const auctions = ITEMS.filter((i): i is AuctionItem => i.type === "auction");
const instants = ITEMS.filter((i): i is InstantItem => i.type === "instant");
const MIN_START = 10;
const INCREMENT = 5;

describe("seed data", () => {
  test("SPEC §10 counts: 7 users (2 admins), 16 items (10 + 6), three charities", () => {
    assert.equal(USERS.length, 7);
    assert.equal(USERS.filter((u) => u.role === "admin").length, 2);
    assert.equal(auctions.length, 10);
    assert.equal(instants.length, 6);
    assert.deepEqual(CHARITIES.map((c) => c.name), ["Lantern Paws", "Lunchbox Brigade", "Saplingworks"]);
    assert.equal(new Set(ITEMS.map((i) => i.slug)).size, ITEMS.length);
  });

  test("photos: 26 in all; most items one, three items three, one item five", () => {
    const counts = ITEMS.map((i) => i.photos).sort();
    assert.equal(counts.reduce((a, b) => a + b, 0), 26);
    assert.deepEqual([counts.filter((n) => n === 1).length, counts.filter((n) => n === 3).length, counts.filter((n) => n === 5).length], [12, 3, 1]);
  });

  test("every image path the seed writes exists under public/", async () => {
    const paths = new Set([PLACEHOLDER_LOGO, PLACEHOLDER_PROOF, ...ITEMS.flatMap((i) => Array.from({ length: i.photos }, (_, n) => photoPath(i.slug, n + 1)))]);
    for (const path of paths) await access(new URL(path.slice(1), PUBLIC));
  });

  test("bids follow §7.4: first at least the start, then up by the increment, never the high bidder again, never the submitter", () => {
    for (const item of auctions) {
      assert.ok(item.startingBid >= MIN_START, item.slug);
      let previous: (typeof item.bids)[number] | undefined;
      for (const bid of item.bids) {
        const [bidder, dollars, ago] = bid;
        assert.notEqual(bidder, item.submitter, `${item.slug}: submitter bid`);
        if (!previous) assert.ok(dollars >= item.startingBid, `${item.slug}: first bid below start`);
        else {
          assert.ok(dollars >= previous[1] + INCREMENT, `${item.slug}: ${dollars} doesn't beat ${previous[1]} by ${INCREMENT}`);
          assert.notEqual(bidder, previous[0], `${item.slug}: high bidder bid again`);
          assert.ok(ago < previous[2], `${item.slug}: bids out of order`);
        }
        assert.ok(ago < EVENT.biddingOpenedHoursAgo, `${item.slug}: bid before bidding opened`);
        previous = bid;
      }
    }
  });

  test("purchases stay within stock and inside the live phase; no one buys their own item", () => {
    for (const item of instants) {
      assert.ok(item.purchases.length <= item.quantity, item.slug);
      for (const [buyer, ago] of item.purchases) {
        assert.notEqual(buyer, item.submitter, item.slug);
        assert.ok(ago < EVENT.biddingOpenedHoursAgo, item.slug);
      }
    }
  });

  test("people with proofs hold no top bid, so finalizing winners never changes their totals", () => {
    const topBidders = new Set(auctions.filter((i) => !i.cancelledHoursAgo && i.bids.length).map((i) => i.bids.at(-1)![0]));
    for (const p of PROOFS) assert.ok(!topBidders.has(p.person), `${p.person} holds a top bid`);
    assert.deepEqual(PROOFS.map((p) => p.status).sort(), ["approved", "pending", "rejected"]);
    for (const p of PROOFS) assert.equal(p.status === "rejected", Boolean(p.rejectionReason?.trim()));
  });

  test("email templates: six, and each body uses only its own variables, with no payment words", () => {
    assert.deepEqual(Object.keys(TEMPLATE_DEFAULTS).sort(), [...TEMPLATE_KEYS].sort());
    for (const key of TEMPLATE_KEYS) {
      const t = TEMPLATE_DEFAULTS[key];
      for (const [, name] of `${t.subject}\n${t.body}`.matchAll(/\{\{(\w+)\}\}/g)) {
        assert.ok((t.variables as readonly string[]).includes(name!), `${key} uses {{${name}}}`);
      }
      assert.doesNotMatch(`${t.subject} ${t.body}`, /\b(pay|paid|payment|checkout)\b/i, key);
    }
  });
});
