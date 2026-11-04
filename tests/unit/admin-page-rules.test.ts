// The Admin Dashboard page's words (SPEC §8, v1.17; DECISIONS #107, #112; Stage 6B).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { gapText, glanceLine, initials, leadingBids, pageTitle, proofCell, SECTIONS, sectionFor, totalCards } from "../../src/pages/admin-rules.ts";

const totals = (over: Record<string, unknown> = {}) => ({
  totals: {
    pledged: { auctionCents: 57_500, instantCents: 51_500, grandCents: 109_000 },
    confirmed: { auctionCents: 0, instantCents: 17_000, grandCents: 16_500 },
    approvedOwedCents: 17_000, approvedPeople: 2, gapLine: "Approved proofs: $165 against $170 owed by those people, $5 short.", leadingBidsCents: null,
    ...over,
  },
});

describe("admin sections", () => {
  test("each path shows its section; /admin is Totals; others aren't sections", () => {
    assert.equal(sectionFor("/admin")?.key, "totals");
    assert.equal(sectionFor("/admin/")?.key, "totals");
    assert.equal(sectionFor("/admin.html")?.key, "totals");
    assert.equal(sectionFor("/admin/people")?.key, "people");
    assert.equal(sectionFor("/admin/nope"), null);
    assert.deepEqual(SECTIONS.map((s) => s.label), ["Totals", "People"]);
    assert.equal(pageTitle(SECTIONS[1]!), "People · Admin Dashboard · Kestrel Gives");
  });
});

describe("Totals (DECISIONS #107)", () => {
  test("three cards in order, whole dollars", () => {
    assert.deepEqual(totalCards(totals()), [
      { key: "auction", title: "Silent auction", pledged: "$575", confirmed: "$0" },
      { key: "instant", title: "Instant sale", pledged: "$515", confirmed: "$170" },
      { key: "grand", title: "Grand total", pledged: "$1,090", confirmed: "$165" },
    ]);
  });
  test("the gap line, or a note that nothing is approved", () => {
    assert.match(gapText(totals()), /\$5 short\.$/);
    assert.equal(gapText(totals({ gapLine: null })), "No proofs are approved yet, so nothing is confirmed.");
  });
  test("leading bids only while live, labeled not final (owner, 6A review)", () => {
    assert.equal(leadingBids(totals()), null);
    const live = leadingBids(totals({ leadingBidsCents: 57_500 }))!;
    assert.equal(live.title, "Leading bids so far, not final until bidding closes");
    assert.equal(live.amount, "$575");
    assert.match(live.text, /not in the totals above/);
  });
  test("the glance line counts proofs and items", () => {
    assert.equal(glanceLine({ pendingProofs: 1, activeItems: 15 }), "1 proof waiting for review · 15 active items");
    assert.equal(glanceLine({ pendingProofs: 0, activeItems: 1 }), "No proofs waiting for review · 1 active item");
    assert.equal(glanceLine({ pendingProofs: 3, activeItems: 0 }), "3 proofs waiting for review · 0 active items");
  });
});

describe("People", () => {
  const brief = (status: "approved" | "pending" | "rejected", amountCents: number) => ({ id: "1", status, amountCents, owedCents: amountCents, createdAt: "" });
  test("the proof column: status, tone and the amount against the total", () => {
    assert.deepEqual(proofCell({ totalCents: 0, proof: null }), { label: "Nothing owed", tone: "neutral", detail: null });
    assert.deepEqual(proofCell({ totalCents: 3_500, proof: null }), { label: "Not uploaded", tone: "warning", detail: null });
    assert.deepEqual(proofCell({ totalCents: 10_500, proof: brief("approved", 10_500) }), { label: "Approved", tone: "success", detail: "$105" });
    assert.deepEqual(proofCell({ totalCents: 6_500, proof: brief("pending", 6_000) }), { label: "Waiting for review", tone: "warning", detail: "$60 of $65" });
    assert.deepEqual(proofCell({ totalCents: 3_500, proof: brief("rejected", 3_500) }), { label: "Rejected", tone: "danger", detail: "$35" });
    assert.equal(initials("maya", "Okafor"), "MO");
  });
});
