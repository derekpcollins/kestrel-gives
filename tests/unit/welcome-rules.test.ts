// The welcome dialog's rules (SPEC v1.24 §3.1; DECISIONS entry 138): when it shows, and that its
// words match the seed and the demo bar.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { USERS } from "../../lib/seed/data.ts";
import { JUMPS, SHARED_NOTE } from "../../src/components/shell-rules.ts";
import { WELCOME, welcomeDecision, type WelcomeContext } from "../../src/components/welcome-rules.ts";

const FIRST_VISIT: WelcomeContext = { page: "home", demoOff: false, seen: false, storageWorks: true, shownThisLoad: false, dialogOpen: false };
const decide = (change: Partial<WelcomeContext>) => welcomeDecision({ ...FIRST_VISIT, ...change });

describe("welcome dialog: when it shows", () => {
  test("a first visit to any page but the tour shows it", () => {
    for (const page of ["home", "silent-auction", "instant-sale", "your-items", "submit", "admin", "item", "proof", "giving"] as const) {
      assert.equal(decide({ page }), "show", page);
    }
  });
  test("the tour doesn't show it, but counts as seen", () => {
    assert.equal(decide({ page: "guide" }), "mark-seen");
  });
  test("once seen, never again on its own", () => {
    assert.equal(decide({ seen: true }), "skip");
    assert.equal(decide({ seen: true, page: "guide" }), "skip");
  });
  test("never on top of another dialog, and left for a later load", () => {
    assert.equal(decide({ dialogOpen: true }), "skip");
    assert.equal(decide({ dialogOpen: true, page: "guide" }), "skip");
  });
  test("?demo=off: no demo content, nothing remembered", () => {
    assert.equal(decide({ demoOff: true }), "skip");
    assert.equal(decide({ demoOff: true, page: "guide" }), "skip");
  });
  test("without storage: Home only, at most once per page load", () => {
    assert.equal(decide({ storageWorks: false }), "show");
    assert.equal(decide({ storageWorks: false, shownThisLoad: true }), "skip");
    assert.equal(decide({ storageWorks: false, page: "silent-auction" }), "skip");
    assert.equal(decide({ storageWorks: false, page: "guide" }), "skip");
    assert.equal(decide({ storageWorks: false, dialogOpen: true }), "skip");
  });
});

describe("welcome dialog: its words", () => {
  test("the people counts match the seed (SPEC §10)", () => {
    const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
    const admins = USERS.filter((u) => u.role === "admin").length;
    assert.match(WELCOME.steps[0], new RegExp(`\\b${words[USERS.length]} people\\b`));
    assert.match(WELCOME.steps[0], new RegExp(`\\b${words[admins]} admins\\b`));
  });
  test("it names the demo bar's real controls", () => {
    assert.match(WELCOME.steps[0], /Viewing as/);
    assert.match(WELCOME.steps[1], /Jump to/);
    const ended = JUMPS.find((j) => j.value === "ended")?.label;
    assert.ok(ended && WELCOME.steps[3].includes(ended));
    assert.match(WELCOME.closing, /^Restore demo data /);
  });
  test("it says what the bar says about sharing and resets", () => {
    assert.match(SHARED_NOTE, /resets daily/);
    assert.match(WELCOME.body, /resets daily/);
  });
});
