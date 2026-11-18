// Home's computed proof window (SPEC §7.6): from the event's dates, never hard-coded.
import assert from "node:assert/strict";
import { test } from "node:test";
import { needsProof, proofDaysWords, stepDate, stepLines, type StepLines, type StepProofState } from "../../src/pages/home-rules.ts";

test("proof days come from the close and the deadline", () => {
  const closes = "2026-11-04T19:00:00.000Z";
  assert.equal(proofDaysWords({ biddingClosesAt: closes, proofDeadline: "2026-11-11T19:00:00.000Z" }), "7 days");
  assert.equal(proofDaysWords({ biddingClosesAt: closes, proofDeadline: "2026-11-05T19:00:00.000Z" }), "1 day");
  // Across the end of daylight saving time the gap is still whole days in UTC.
  assert.equal(proofDaysWords({ biddingClosesAt: "2026-10-30T19:00:00.000Z", proofDeadline: "2026-11-13T19:00:00.000Z" }), "14 days");
  assert.equal(proofDaysWords({ biddingClosesAt: null, proofDeadline: null }), null);
  assert.equal(proofDaysWords(null), null);
});

// How to participate's card lines (owner, visible changes B3; SPEC v1.27 §8). One event, its
// dates fixed; "now" moves through the phases the demo bar's Event phase sets.
const ZONE = "America/New_York";
const DATES = {
  submissionsOpenAt: "2026-11-02T14:00:00.000Z", // Monday, November 2
  biddingOpensAt: "2026-11-09T14:00:00.000Z",    // Monday, November 9
  biddingClosesAt: "2026-11-13T21:00:00.000Z",   // Friday, November 13
};
const DEADLINE = "2026-11-20T21:00:00.000Z";     // Friday, November 20
type P = "unscheduled" | "upcoming" | "submission" | "live" | "ended";
const ev = (phase: P, dates: Partial<typeof DATES> = DATES) => ({ phase, submissionsOpenAt: null, biddingOpensAt: null, biddingClosesAt: null, ...dates });
const at = (iso: string) => new Date(iso);
const owes = (approved = false, pending = false): StepProofState => ({ totalCents: 12_500, approved, pending, deadline: DEADLINE });
const nothing: StepProofState = { totalCents: 0, approved: false, pending: false, deadline: DEADLINE };
/** Each line as words: a link is [text](href), muted text is plain, parts joined by " · ". */
const words = (lines: StepLines) => lines.map((parts) => parts.map((p) => ("link" in p ? `[${p.link}](${p.href})` : p.text)).join(" · "));
const lines = (phase: P, role: "admin" | "employee", proof: StepProofState, now: string, dates?: Partial<typeof DATES>) =>
  words(stepLines(ev(phase, dates), role, proof, at(now), ZONE));

const SUBMIT = "[Submit an item](/submit)";
const SALES = "[Silent auction](/silent-auction) · [Instant sale](/instant-sale)";
const LATER = "Opens when bidding ends on Friday, November\u00a013";

test("Submissions open: employees and admins can submit; bidding and donating wait", () => {
  for (const role of ["employee", "admin"] as const) {
    assert.deepEqual(lines("submission", role, null, "2026-11-04T15:00:00Z"), [SUBMIT, "Opens when bidding starts on Monday, November\u00a09", LATER, LATER]);
  }
});

test("Bidding live and Ending soon: both sales are links; only admins can still submit", () => {
  for (const now of ["2026-11-10T15:00:00Z", "2026-11-13T15:00:00Z"]) { // live, then within 24 hours of the close
    assert.deepEqual(lines("live", "employee", null, now), ["Submissions closed on Monday, November\u00a09", SALES, LATER, LATER]);
    assert.deepEqual(lines("live", "admin", null, now), [SUBMIT, SALES, LATER, LATER]);
  }
});

test("Bidding ended, in the proof window: what you owe and Upload proof for someone who owes", () => {
  const now = "2026-11-15T15:00:00Z";
  const ended = ["Submissions closed on Monday, November\u00a09", "Bidding ended on Friday, November\u00a013"];
  assert.deepEqual(lines("ended", "employee", owes(), now), [...ended, "[See what you owe](/your-items)", "[Upload proof](/your-items/proof)"]);
  assert.deepEqual(lines("ended", "employee", nothing, now), [...ended, "Nothing to donate", "Nothing to donate"]);
  assert.deepEqual(lines("ended", "admin", owes(), now), [SUBMIT, ended[1], "[See what you owe](/your-items)", "[Upload proof](/your-items/proof)"]);
  assert.deepEqual(lines("ended", "admin", nothing, now), [SUBMIT, ended[1], "Nothing to donate", "Nothing to donate"]);
  assert.deepEqual(lines("ended", "employee", owes(true), now).slice(2), ["[See what you owe](/your-items)", "Proof approved"]);
  // Proof waiting for review: a new upload is still allowed, as on Your Items (owner, B3 review).
  assert.deepEqual(lines("ended", "employee", owes(false, true), now).slice(2), ["[See what you owe](/your-items)", "[Upload proof](/your-items/proof) · Waiting for review"]);
});

test("30+ days after: late uploads still work, so the link stays with when it was due", () => {
  const now = "2026-12-15T15:00:00Z";
  assert.deepEqual(lines("ended", "employee", owes(), now).slice(2), ["[See what you owe](/your-items)", "[Upload proof](/your-items/proof) · Was due Friday, November\u00a020"]);
  assert.deepEqual(lines("ended", "employee", owes(true), now).slice(2), ["[See what you owe](/your-items)", "Proof approved"]);
  // Waiting for review says so instead of the due date: the person has acted.
  assert.deepEqual(lines("ended", "employee", owes(false, true), now)[3], "[Upload proof](/your-items/proof) · Waiting for review");
  assert.deepEqual(lines("ended", "employee", nothing, now).slice(2), ["Nothing to donate", "Nothing to donate"]);
  assert.deepEqual(lines("ended", "admin", owes(), now)[0], SUBMIT);
});

test("before the totals arrive, cards 3 and 4 are empty; if they can't load, both point to Your Items", () => {
  const now = "2026-11-15T15:00:00Z";
  assert.deepEqual(lines("ended", "employee", null, now).slice(2), ["", ""]);
  assert.deepEqual(lines("ended", "employee", "failed", now).slice(2), ["[See Your Items](/your-items)", "[See Your Items](/your-items)"]);
});

test("before submissions open, and with no dates set (after Reset for next year)", () => {
  assert.deepEqual(lines("upcoming", "employee", null, "2026-10-30T15:00:00Z"), ["Submissions open on Monday, November\u00a02", "Opens when bidding starts on Monday, November\u00a09", LATER, LATER]);
  const none = {};
  assert.deepEqual(lines("unscheduled", "employee", null, "2026-10-30T15:00:00Z", none), Array(4).fill("Dates aren't set yet"));
  assert.deepEqual(lines("unscheduled", "admin", null, "2026-10-30T15:00:00Z", none), [SUBMIT, ...Array(3).fill("Dates aren't set yet")]);
});

test("card dates keep the month and day together with a non-breaking space", () => {
  const now = at("2026-11-04T15:00:00Z");
  assert.equal(stepDate(at("2026-11-15T15:00:00Z"), now, ZONE), "Sunday, November\u00a015");
  // Another year: only the month and day are joined; the year may still wrap after its comma.
  assert.equal(stepDate(at("2027-01-04T15:00:00Z"), now, ZONE), "Monday, January\u00a04, 2027");
  assert.ok(lines("live", "employee", null, "2026-11-10T15:00:00Z").every((line) => !/November \d/.test(line)));
});

test("Home reads the viewer's totals only once bidding has ended", () => {
  for (const phase of ["unscheduled", "upcoming", "submission", "live"] as const) assert.equal(needsProof({ phase }), false);
  assert.equal(needsProof({ phase: "ended" }), true);
  assert.equal(needsProof(null), false);
});
