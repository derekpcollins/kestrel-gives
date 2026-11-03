// The shell's rules (SPEC §3.1, §8): nav links per phase and the pressed Jump to button.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { JUMP_TARGETS } from "../../lib/demo/jump.ts";
import { JUMPS, SHARED_NOTE, currentJump, navLinks, pageKeyFor } from "../../src/components/shell-rules.ts";

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

describe("which nav link is current", () => {
  test("Edit item shares the submit page's HTML but marks no nav link", () => {
    assert.equal(pageKeyFor("submit", "/submit"), "submit");
    assert.equal(pageKeyFor("submit", "/items/12/edit"), "item");
    assert.equal(pageKeyFor("submit", "/items/12/edit/"), "item");
    assert.ok(!navLinks("submission").some((l) => l.key === "item"), "no link is ever marked on an item's page");
    assert.equal(pageKeyFor("your-items", "/your-items"), "your-items");
    assert.equal(pageKeyFor(undefined, "/"), "home");
    assert.equal(pageKeyFor("proof", "/your-items/proof"), "your-items", "the proof page is part of Your Items");
    assert.ok(!navLinks("ended").some((l) => l.key === "giving"), "the giving stub marks nothing");
  });
});

