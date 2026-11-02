// The shell's rules (SPEC §3.1, §8): nav links per phase and the pressed Jump to button.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { JUMP_TARGETS } from "../../lib/demo/jump.ts";
import { JUMPS, SHARED_NOTE, currentJump, navLinks } from "../../src/components/shell-rules.ts";

const NOW = new Date("2026-11-02T18:30:00Z");

describe("shell rules", () => {
  test("SPEC §8's nav, with Submit an Item only in the submission window", () => {
    const labels = (phase?: string) => navLinks(phase).map((l) => l.label);
    assert.deepEqual(labels("live"), ["Home", "Silent Auction", "Instant Sale", "Your Items"]);
    assert.deepEqual(labels("ended"), labels("live"));
    assert.deepEqual(labels(undefined), labels("live"));
    assert.deepEqual(labels("submission"), [...labels("live"), "Submit an Item"]);
    assert.ok(navLinks("submission").every((l) => !/admin/i.test(l.label + l.href)), "admin links live only in the profile menu");
  });
  test("the bar's jump buttons are the API's targets, in order", () => {
    assert.deepEqual(JUMPS.map((j) => j.value), [...JUMP_TARGETS]);
  });
  test("the pressed button follows the data", () => {
    const later = new Date(NOW.getTime() + 3_600_000).toISOString();
    const earlier = new Date(NOW.getTime() - 3_600_000).toISOString();
    assert.equal(currentJump(null, NOW), null);
    assert.equal(currentJump({ phase: "submission", endingSoon: false, proofDeadline: later }, NOW), "submission");
    assert.equal(currentJump({ phase: "live", endingSoon: false, proofDeadline: later }, NOW), "live");
    assert.equal(currentJump({ phase: "live", endingSoon: true, proofDeadline: later }, NOW), "ending-soon");
    assert.equal(currentJump({ phase: "ended", endingSoon: false, proofDeadline: later }, NOW), "ended");
    assert.equal(currentJump({ phase: "ended", endingSoon: false, proofDeadline: earlier }, NOW), "after");
  });
  test("the shared-demo note", () => {
    assert.equal(SHARED_NOTE, "Shared demo · resets daily");
  });
});
