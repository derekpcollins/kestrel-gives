// Your Items' words (SPEC §8, §7.6; DECISIONS #101).
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import type { ProofView } from "../../src/me-api.ts";
import {
  bidText, cancelledText, donatedText, groupCancelled, groupWins, PROOF_LINK, proofSummary, showsEdit, totalChangedBanner, winText,
} from "../../src/pages/your-items-rules.ts";

const NOW = new Date("2026-11-20T15:00:00Z");
const live = { phase: "live" as const, now: NOW, biddingOpens: new Date("2026-11-17T14:00:00Z"), biddingCloses: new Date("2026-11-27T18:00:00Z"), timeZone: "America/New_York" };
const proof = (over: Partial<ProofView>): ProofView => ({ totalCents: 0, latest: null, deadline: null, totalChanged: false, blocked: null, ...over });
const latest = (over: Partial<NonNullable<ProofView["latest"]>>): NonNullable<ProofView["latest"]> => ({
  status: "pending", amountCents: 12_500, owedCents: 12_500, rejectionReason: null, createdAt: NOW.toISOString(), imageUrl: "/x.png", ...over,
});

describe("Your Items tiles", () => {
  test("my bids use the browse tiles' labels for where a bid stands", () => {
    assert.deepEqual(bidText({ myTopCents: 4_500, highBidCents: 4_500, standing: "winning" }),
      { amount: "$45", detail: "Your bid · the high bid", status: { label: "You're winning", tone: "success" }, muted: false });
    assert.deepEqual(bidText({ myTopCents: 4_000, highBidCents: 6_000, standing: "outbid" }),
      { amount: "$40", detail: "Your bid · High bid $60", status: { label: "Outbid", tone: "danger" }, muted: false });
    assert.equal(bidText({ myTopCents: 9_000, highBidCents: 9_000, standing: "won" }).status?.label, "You won");
    const lost = bidText({ myTopCents: 3_000, highBidCents: 5_500, standing: "lost" });
    assert.deepEqual(lost.status, { label: "Didn't win", tone: "neutral" }, "Ended is for items with no stake");
    assert.equal(lost.detail, "Your bid · Winning bid $55");
    assert.equal(lost.muted, true);
  });

  test("won and bought say what they cost; a purchase gets its day in the event's zone", () => {
    assert.deepEqual(winText({ kind: "won", amountCents: 31_000, unitCents: 31_000, count: 1, at: NOW.toISOString() }, "America/New_York"), { amount: "$310", detail: "Won", status: undefined, muted: false });
    // 03:30 UTC on Nov 4 is still Nov 3 in New York.
    assert.equal(winText({ kind: "bought", amountCents: 2_000, unitCents: 2_000, count: 1, at: "2026-11-04T03:30:00Z" }, "America/New_York").detail, "Bought Nov 3");
  });

  test("repeat purchases fold into one tile: the count, the combined amount, the latest date", () => {
    const unit = (at: string, cents = 2_000) => ({ kind: "bought" as const, itemId: "12", title: "Hot sauce trio", coverUrl: "", amountCents: cents, at });
    const groups = groupWins([
      unit("2026-11-03T15:00:00Z"),
      { kind: "won", itemId: "2", title: "Guitar lessons", coverUrl: "", amountCents: 8_500, at: "2026-11-02T12:00:00Z" },
      unit("2026-11-01T15:00:00Z"),
    ]);
    assert.deepEqual(groups.map((g) => [g.itemId, g.count, g.amountCents, g.at]), [["12", 2, 4_000, "2026-11-03T15:00:00Z"], ["2", 1, 8_500, "2026-11-02T12:00:00Z"]]);
    assert.deepEqual(winText(groups[0]!, "America/New_York"), { amount: "$20", detail: "Bought 2 · $40 · Last on Nov 3", status: undefined, muted: false });
    const sum = (list: { amountCents: number }[]) => list.reduce((n, w) => n + w.amountCents, 0);
    assert.equal(sum(groups), 12_500, "folding never changes the total");
  });

  test("Edit shows on donated items until bidding ends", () => {
    assert.equal(showsEdit("submission"), true);
    assert.equal(showsEdit("live"), true);
    assert.equal(showsEdit("ended"), false);
  });

  test("a donated item says what its browse tile says", () => {
    const base = { bidCount: 0, highBidCents: null, startingBidCents: 4_000, priceCents: null, remaining: null };
    assert.deepEqual(donatedText({ type: "auction", ...base }, live), { amount: "$40", detail: "Starting bid · No bids yet", status: undefined, muted: false });
    assert.equal(donatedText({ type: "auction", ...base, bidCount: 3, highBidCents: 7_000 }, live).detail, "Top bid · 3 bids");
    const jam = donatedText({ type: "instant", bidCount: 0, highBidCents: null, startingBidCents: null, priceCents: 1_200, remaining: 2 }, live);
    assert.deepEqual([jam.amount, jam.detail, jam.status?.label], ["$12", "2 left", "2 left"]);
    assert.equal(donatedText({ type: "auction", ...base }, { ...live, phase: "ended" }).muted, true);
  });

  test("cancelled says why it no longer counts", () => {
    assert.deepEqual(cancelledText({ why: "bought", amountCents: 2_000 }),
      { amount: "$20", detail: "Purchase cancelled · Not in your total", status: { label: "Cancelled", tone: "danger" }, muted: true });
    assert.equal(cancelledText({ why: "bid", amountCents: null }).detail, "Your bid no longer counts");
    const twice = groupCancelled([
      { itemId: "9", title: "Jam", coverUrl: "", why: "bought", amountCents: 1_200 },
      { itemId: "9", title: "Jam", coverUrl: "", why: "bought", amountCents: 1_200 },
    ]);
    assert.equal(twice.length, 1);
    assert.deepEqual([cancelledText(twice[0]!).amount, cancelledText(twice[0]!).detail], ["$24", "2 purchases cancelled · Not in your total"]);
    assert.equal(cancelledText({ why: "donated", amountCents: null }).detail, "You donated this item");
  });
});

describe("the proof summary (SPEC §7.6)", () => {
  const deadline = "2026-11-25T15:00:00Z"; // 5 days after NOW

  test("nothing owed: no status, no link", () => {
    const s = proofSummary(proof({ blocked: { code: "nothing-owed", message: "…" } }), NOW);
    assert.deepEqual([s.total, s.status, s.due, s.action], ["$0", null, null, null]);
  });

  test("owed with no proof: Proof due, days left, and the upload link", () => {
    const s = proofSummary(proof({ totalCents: 12_500, deadline }), NOW);
    assert.deepEqual(s.status, { label: "Proof due", tone: "warning" });
    assert.equal(s.due, "5 days left");
    assert.deepEqual(s.action, { href: PROOF_LINK, label: "Donate and upload proof" });
    assert.equal(proofSummary(proof({ totalCents: 12_500, deadline: "2026-11-18T15:00:00Z" }), NOW).due, "2 days late");
  });

  test("pending, rejected and approved", () => {
    const pending = proofSummary(proof({ totalCents: 12_500, deadline, latest: latest({}) }), NOW);
    assert.deepEqual([pending.status?.label, pending.due, pending.action?.label], ["Pending review", null, "Upload a new proof"]);
    const rejected = proofSummary(proof({ totalCents: 12_500, deadline, latest: latest({ status: "rejected", rejectionReason: "The screenshot is blurry." }) }), NOW);
    assert.deepEqual([rejected.status?.tone, rejected.due], ["danger", "5 days left"]);
    assert.equal(rejected.note, "Reason: The screenshot is blurry.");
    const approved = proofSummary(proof({ totalCents: 12_500, deadline, latest: latest({ status: "approved" }), blocked: { code: "approved", message: "…" } }), NOW);
    assert.deepEqual([approved.status?.label, approved.due, approved.action], ["Approved", null, null]);
  });

  test("the total-changed banner, worded for the latest proof's status", () => {
    assert.equal(totalChangedBanner(proof({ totalCents: 12_500, latest: latest({}) })), null);
    const back = totalChangedBanner(proof({ totalCents: 9_000, totalChanged: true, latest: latest({ status: "pending", owedCents: 12_500 }) }));
    assert.deepEqual(back, { title: "Your donation total changed", text: "It was $125 when you uploaded proof and is now $90. Please check that your proof still covers it." });
    const rejected = totalChangedBanner(proof({ totalCents: 9_000, totalChanged: true, latest: latest({ status: "rejected", owedCents: 12_500 }) }));
    assert.match(rejected!.text, /Please upload a new proof for the new total\.$/);
  });
});
