// Reset for next year: the section's and the offer's words (SPEC §7.8; DECISIONS entries 109 and 118).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resetDeletes, resetDialog, resetKeeps, resetStatus } from "../../src/pages/admin-reset-rules.ts";
import { RESET_OFFER_TITLE, resetOfferText } from "../../src/components/reset-offer-rules.ts";

const event = { id: "1", name: "Kestrel Gives 2026", timeZone: "America/New_York", phase: "ended" as const, submissionsOpenAt: null, biddingOpensAt: null, biddingClosesAt: null, proofDeadline: null };
const counts = { items: 16, photos: 40, bids: 42, purchases: 9, proofs: 4 };
const reset = (over: Partial<{ unlocksAt: string | null; unlocked: boolean }> = {}) => ({ unlocksAt: "2026-12-31T02:00:00.000Z", unlocked: false, nextName: "Kestrel Gives 2027", counts, ...over });

describe("reset status", () => {
  test("locked: when it unlocks, in the event's zone", () => {
    const s = resetStatus({ now: "2026-11-03T12:00:00.000Z", event, reset: reset() });
    assert.deepEqual(s.pill, { label: "Locked", tone: "neutral" });
    assert.equal(s.text, "Reset for next year unlocks on Wednesday, December 30 at 9:00 PM EST, 30 days after bidding closes.");
  });
  test("locked with no close date (as right after a Reset)", () => {
    assert.match(resetStatus({ now: "2026-11-03T12:00:00.000Z", event, reset: reset({ unlocksAt: null }) }).text, /no close date yet\.$/);
  });
  test("ready", () => {
    const s = resetStatus({ now: "2027-01-03T12:00:00.000Z", event, reset: reset({ unlocked: true }) });
    assert.deepEqual(s.pill, { label: "Ready", tone: "warning" });
  });
});

describe("what goes and what stays", () => {
  test("counts, singular and plural, and nothing for an empty event", () => {
    assert.deepEqual(resetDeletes(counts), ["16 items with their 40 photos", "42 bids", "9 purchases", "4 proofs"]);
    assert.deepEqual(resetDeletes({ items: 1, photos: 1, bids: 0, purchases: 1, proofs: 0 }), ["1 item with its 1 photo", "1 purchase"]);
    assert.deepEqual(resetDeletes({ items: 0, photos: 0, bids: 0, purchases: 0, proofs: 0 }), ["Nothing yet: this event has no items, bids, purchases or proofs."]);
  });
  test("keeps SPEC's list, naming next year's event", () => {
    const keeps = resetKeeps("Kestrel Gives 2026", "Kestrel Gives 2027");
    assert.ok(keeps.includes("Event settings, copied to Kestrel Gives 2027 with the dates cleared"));
    assert.equal(keeps.length, 5);
  });
  test("the dialog: what's deleted, what stays, that the demo is shared; type the event's name", () => {
    const d = resetDialog({ event, reset: reset({ unlocked: true }) });
    assert.equal(d.confirmText, "Kestrel Gives 2026");
    assert.equal(d.body, "This deletes 16 items with their 40 photos, 42 bids, 9 purchases and 4 proofs from Kestrel Gives 2026. People, charities, email templates and settings stay, and Kestrel Gives 2027 starts with no dates. The demo is shared, so this empties it for everyone until someone restores the demo data. This can't be undone.");
    assert.match(resetDialog({ event, reset: { ...reset(), counts: { items: 0, photos: 0, bids: 0, purchases: 0, proofs: 0 } } }).body, /^Kestrel Gives 2026 has no items, bids, purchases or proofs to delete\./);
  });
});

describe("the demo was reset offer", () => {
  test("everyone hears what Restore does; admins also hear how to start the year instead", () => {
    assert.equal(RESET_OFFER_TITLE, "The demo was reset for next year");
    const plain = resetOfferText("Kestrel Gives 2027", false);
    assert.match(plain, /^Someone reset this shared demo, so Kestrel Gives 2027 has no items or dates yet\./);
    assert.doesNotMatch(plain, /Event settings/);
    assert.match(resetOfferText("Kestrel Gives 2027", true), /set its dates in Event settings and add items\.$/);
  });
});
