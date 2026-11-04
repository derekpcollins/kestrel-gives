// The Admin Dashboard page's words (SPEC §8, v1.17; DECISIONS #107, #112; Stage 6B).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { deadlineLine, gapText, glanceLine, groupProofs, initials, leadingBids, pageTitle, proofCell, proofReview, queueLine, rejectDialog, SECTIONS, sectionFor, totalCards } from "../../src/pages/admin-rules.ts";
import type { AdminProof } from "../../src/admin-api.ts";

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
    assert.deepEqual(SECTIONS.map((s) => s.label), ["Totals", "People", "Proof review"]);
    assert.equal(sectionFor("/admin/proofs")?.key, "proofs");
    assert.equal(pageTitle(SECTIONS[1]!), "People · Admin Dashboard · Kestrel Gives");
  });
});

describe("Totals (DECISIONS #107)", () => {
  test("three cards in order, whole dollars", () => {
    assert.deepEqual(totalCards(totals()).map(({ key, title, pledged, confirmed }) => ({ key, title, pledged, confirmed })), [
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
  const now = new Date("2026-11-10T12:00:00Z");
  const live = { phase: "live" as const, deadline: "2026-11-12T23:00:00.000Z", now };
  const ended = { phase: "ended" as const, deadline: "2026-11-12T23:00:00.000Z", now };
  const past = { phase: "ended" as const, deadline: "2026-11-08T23:00:00.000Z", now };
  test("the proof column: status, tone and the amount against the total", () => {
    assert.deepEqual(proofCell({ totalCents: 0, proof: null }, ended), { label: "Nothing owed", tone: "neutral", detail: null });
    assert.deepEqual(proofCell({ totalCents: 10_500, proof: brief("approved", 10_500) }, ended), { label: "Approved", tone: "success", detail: "$105" });
    assert.deepEqual(proofCell({ totalCents: 6_500, proof: brief("pending", 6_000) }, ended), { label: "Waiting for review", tone: "warning", detail: "$60 of $65" });
    assert.deepEqual(proofCell({ totalCents: 3_500, proof: brief("rejected", 3_500) }, past), { label: "Rejected", tone: "danger", detail: "$35" });
  });
  test("no proof yet follows the phase, like Your Items (owner, 6B review)", () => {
    assert.deepEqual(proofCell({ totalCents: 3_500, proof: null }, live), { label: "Not uploaded", tone: "neutral", detail: null });
    assert.deepEqual(proofCell({ totalCents: 3_500, proof: null }, ended), { label: "Not uploaded", tone: "warning", detail: "2 days left" });
    assert.deepEqual(proofCell({ totalCents: 3_500, proof: null }, past), { label: "Late", tone: "danger", detail: "2 days late" });
  });
  test("zero amounts are flagged so they draw muted", () => {
    const cards = totalCards(totals());
    assert.deepEqual(cards.map((c) => [c.pledgedZero, c.confirmedZero]), [[false, true], [false, false], [false, false]]);
    assert.equal(initials("maya", "Okafor"), "MO");
  });
});

describe("proof review", () => {
  const maya = { id: "1", firstName: "Maya", lastName: "Okafor" };
  const rosa = { id: "6", firstName: "Rosa", lastName: "Delgado" };
  const now = new Date("2026-11-03T23:00:00.000Z");
  const deadline = "2026-11-13T00:00:00.000Z";
  const zone = "America/New_York";
  const p = (over: Partial<AdminProof> = {}): AdminProof => ({
    id: "1", status: "pending", amountCents: 6_000, owedCents: 6_500, totalCents: 6_500, short: true, totalChanged: false,
    createdAt: "2026-11-03T21:00:00.000Z", person: rosa, rejectionReason: null, imageUrl: "/x.png", reviewedAt: null, reviewer: null, ...over,
  });

  test("waiting first, in the order sent; the queue line counts both", () => {
    const list = [p({ id: "a", status: "approved" }), p({ id: "b" }), p({ id: "c", status: "rejected" }), p({ id: "d" })];
    const { waiting, reviewed } = groupProofs(list);
    assert.deepEqual(waiting.map((x) => x.id), ["b", "d"]);
    assert.deepEqual(reviewed.map((x) => x.id), ["a", "c"]);
    assert.equal(queueLine(list), "2 waiting for review · 2 reviewed");
  });
  test("the deadline line, before a close and after it passes", () => {
    assert.equal(deadlineLine(null, now, zone), "There's no proof deadline yet: it's set when bidding closes.");
    assert.equal(deadlineLine(deadline, now, zone), "Proof deadline: Thursday, November 12 at 7:00 PM EST.");
    assert.match(deadlineLine(deadline, new Date("2026-11-20T00:00:00.000Z"), zone), /\(passed\)\.$/);
  });
  test("short: a warning that still allows approving, while it waits", () => {
    const t = proofReview(p(), { now, deadline, timeZone: zone });
    assert.deepEqual(t.notes, [{ tone: "warning", text: "$5 short of their $65 donation total. You can still approve it." }]);
    assert.equal(t.canReview, true);
    assert.equal(t.reviewed, null);
    assert.equal(t.uploaded, "Uploaded today at 4:00 PM EST");
    assert.equal(t.shotAlt, "Donation screenshot from Rosa Delgado");
  });
  test("once reviewed, the short note drops the nudge and says who reviewed it", () => {
    const t = proofReview(p({ status: "approved", reviewedAt: "2026-11-03T22:00:00.000Z", reviewer: maya }), { now, deadline, timeZone: zone });
    assert.deepEqual(t.notes.map((n) => n.text), ["$5 short of their $65 donation total."]);
    assert.equal(t.reviewed, "Approved by Maya Okafor today at 5:00 PM EST.");
    assert.equal(t.canReview, false);
  });
  test("rejected shows the reason; over, a changed total and a late upload add notes", () => {
    const r = proofReview(p({ status: "rejected", rejectionReason: "Cut off.", reviewedAt: "2026-11-03T22:00:00.000Z", reviewer: maya }), { now, deadline, timeZone: zone });
    assert.equal(r.reason, "Reason: Cut off.");
    const t = proofReview(p({ amountCents: 7_000, owedCents: 4_000, totalChanged: true, short: false, createdAt: "2026-11-14T00:00:00.000Z" }), { now, deadline, timeZone: zone });
    assert.deepEqual(t.notes.map((n) => n.tone), ["info", "info", "info"]);
    assert.equal(t.notes[0]!.text, "$5 more than their $65 donation total.");
    assert.equal(t.notes[1]!.text, "Their total was $40 when they uploaded this proof. It's $65 now.");
    assert.match(t.notes[2]!.text, /^Uploaded after the proof deadline/);
  });
  test("reviewed proofs offer the other decision; waiting ones don't", () => {
    assert.equal(proofReview(p(), { now, deadline }).instead, null);
    assert.equal(proofReview(p({ status: "approved" }), { now, deadline }).instead, "reject");
    assert.equal(proofReview(p({ status: "rejected", rejectionReason: "x" }), { now, deadline }).instead, "approve");
  });
  test("rejecting an approved proof says it leaves the confirmed totals", () => {
    const d = rejectDialog(p({ status: "approved" }));
    assert.equal(d.title, "Reject Rosa Delgado's approved proof?");
    assert.equal(d.body, "It's approved now. Rejecting it takes its $60 out of the confirmed totals. Rosa will see your reason on Your Items and can upload a new proof.");
    assert.equal(d.confirmLabel, "Reject instead");
    assert.equal(rejectDialog(p()).confirmLabel, "Reject proof");
  });
  test("the reject dialog names the person and needs a reason", () => {
    const d = rejectDialog(p());
    assert.equal(d.title, "Reject Rosa Delgado's proof?");
    assert.equal(d.label, "Reason (shown to Rosa)");
    assert.equal(d.maxLength, 300);
    assert.equal(d.check("  "), "Enter a reason. The person will see it.");
    assert.equal(d.check("Cut off."), null);
  });
});
