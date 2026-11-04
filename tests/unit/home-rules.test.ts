// Home's computed proof window (SPEC §7.6): from the event's dates, never hard-coded.
import assert from "node:assert/strict";
import { test } from "node:test";
import { proofDaysWords } from "../../src/pages/home-rules.ts";

test("proof days come from the close and the deadline", () => {
  const closes = "2026-11-04T19:00:00.000Z";
  assert.equal(proofDaysWords({ biddingClosesAt: closes, proofDeadline: "2026-11-11T19:00:00.000Z" }), "7 days");
  assert.equal(proofDaysWords({ biddingClosesAt: closes, proofDeadline: "2026-11-05T19:00:00.000Z" }), "1 day");
  // Across the end of daylight saving time the gap is still whole days in UTC.
  assert.equal(proofDaysWords({ biddingClosesAt: "2026-10-30T19:00:00.000Z", proofDeadline: "2026-11-13T19:00:00.000Z" }), "14 days");
  assert.equal(proofDaysWords({ biddingClosesAt: null, proofDeadline: null }), null);
  assert.equal(proofDaysWords(null), null);
});
