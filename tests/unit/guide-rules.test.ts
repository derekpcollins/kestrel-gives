// The 5-minute tour's rules (owner, guide plan; DECISIONS entries 127 and 128): every scenario
// is set up with real demo targets, says what it changes before the click, and checks that
// the state it needs is still there, by title and name, never by numeric id.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ITEMS, USERS } from "../../lib/seed/data.ts";
import type { AdminProof } from "../../src/admin-api.ts";
import type { ItemSummary } from "../../src/items-api.ts";
import type { MeAnswer } from "../../src/me-api.ts";
import { JUMPS } from "../../src/components/shell-rules.ts";
import {
  LAST_ONE_ITEM, OUTBID_ITEM, SCENARIOS, checkChange, checkLastOne, checkOutbid, checkReview, checkSubmit, checkWin,
  listWords, phaseMatches, setupEffect,
} from "../../src/pages/guide-rules.ts";

const item = (over: Partial<ItemSummary>): ItemSummary => ({
  id: "41", type: "auction", title: "Something else", coverUrl: "", startingBidCents: 1000, topBidCents: null, bidCount: 0,
  priceCents: null, remaining: null, viewerIsTopBidder: false, viewerHasBid: false, ...over,
});
const me = (wins: Array<{ kind: "won" | "bought"; title: string }>, status: "pending" | "approved" | "rejected" | null = null): MeAnswer => ({
  proof: { totalCents: 0, latest: status ? { status, amountCents: 0, owedCents: 0, rejectionReason: null, createdAt: "", imageUrl: "" } : null },
  wins: wins.map((w) => ({ ...w, itemId: "9", coverUrl: "", amountCents: 100, at: "" })),
}) as unknown as MeAnswer;
const proof = (first: string, status: "pending" | "approved" | "rejected"): AdminProof =>
  ({ status, person: { id: "77", firstName: first, lastName: "X" } }) as unknown as AdminProof;

test("every scenario uses a seeded person and a real Jump to target, in the owner's order", () => {
  assert.deepEqual(SCENARIOS.map((s) => s.id), ["outbid", "last-one", "win", "review", "change", "submit"]);
  const firsts = USERS.map((u) => u.first);
  const jumps = JUMPS.map((j) => j.value);
  for (const s of SCENARIOS) {
    assert.ok(firsts.includes(s.viewer), s.id);
    if (s.checkAs) assert.ok(firsts.includes(s.checkAs), s.id);
    assert.ok(jumps.includes(s.phase), s.id);
  }
  // Submit an item is last: it clears activity (DECISIONS entry 124).
  assert.equal(SCENARIOS.at(-1)?.phase, "submission");
});

test("the items the scenarios name are seeded, so the steps match the demo", () => {
  const titles = ITEMS.map((i) => i.title);
  assert.ok(titles.includes(OUTBID_ITEM));
  assert.ok(titles.includes(LAST_ONE_ITEM));
});

test("ending soon still counts as bidding live; other phases must match", () => {
  assert.equal(phaseMatches("live", "live"), true);
  assert.equal(phaseMatches("live", "ending-soon"), true);
  assert.equal(phaseMatches("live", "ended"), false);
  assert.equal(phaseMatches("ended", "after"), false);
  assert.equal(phaseMatches("submission", null), false);
});

test("Set me up says who it changes before the click", () => {
  const win = SCENARIOS.find((s) => s.id === "win")!;
  assert.deepEqual(setupEffect(win, "ended"), { you: "Just you: viewing as Jules.", everyone: null });
  assert.equal(setupEffect(win, "live").everyone, "Everyone: moves the demo to Bidding ended.");
  const submit = SCENARIOS.find((s) => s.id === "submit")!;
  assert.match(setupEffect(submit, "live").everyone ?? "", /clears bids, purchases and proofs \(it asks first\)/);
});

test("Get outbid finds its item by title and links to whatever id it has now", () => {
  const ok = checkOutbid([item({}), item({ id: "123", title: OUTBID_ITEM })]);
  assert.deepEqual(ok, { ok: true, start: { href: "/items/123", label: `Go to ${OUTBID_ITEM}` } });
  const gone = checkOutbid([item({})]);
  assert.equal(gone.ok, false);
  assert.match(!gone.ok ? gone.text : "", /Restore demo data/);
});

test("Buy the last one needs stock, and says when someone bought it out", () => {
  const two = checkLastOne([item({ id: "5", type: "instant", title: LAST_ONE_ITEM, remaining: 2 })]);
  assert.equal(two.ok && two.note, "2 left.");
  const one = checkLastOne([item({ id: "5", type: "instant", title: LAST_ONE_ITEM, remaining: 1 })]);
  assert.equal(one.ok && one.note, "1 left, so one purchase sells it out.");
  const none = checkLastOne([item({ id: "5", type: "instant", title: LAST_ONE_ITEM, remaining: 0 })]);
  assert.equal(!none.ok && none.title, `${LAST_ONE_ITEM} is sold out`);
  assert.equal(checkLastOne([]).ok, false);
});

test("Win and donate needs a win; an earlier proof is mentioned, not hidden", () => {
  assert.equal(checkWin(me([{ kind: "bought", title: "Scarf" }])).ok, false);
  const fresh = checkWin(me([{ kind: "won", title: "Guitar lessons, four weeks" }, { kind: "won", title: "Weekend dog-sitting" }]));
  assert.equal(fresh.ok && fresh.note, "Jules won “Guitar lessons, four weeks” and “Weekend dog-sitting”.");
  const again = checkWin(me([{ kind: "won", title: "A" }], "pending"));
  assert.match(again.ok ? again.note ?? "" : "", /already uploaded proof \(pending\)/);
});

test("Review as admin prefers Jules's waiting proof (the story), then anyone's, else says none wait", () => {
  const story = checkReview([proof("Rosa", "pending"), proof("Jules", "pending")]);
  assert.equal(story.ok && story.note, "Jules's proof from scenario 3 is waiting.");
  const alone = checkReview([proof("Jules", "approved"), proof("Rosa", "pending")]);
  assert.match(alone.ok ? alone.note ?? "" : "", /Rosa X's proof is waiting\. Jules's isn't/);
  const none = checkReview([proof("Rosa", "approved")]);
  assert.equal(!none.ok && none.title, "No proofs are waiting for review");
});

test("Change the outcome needs Jules's win and says what the proof part will show", () => {
  assert.equal(checkChange(me([])).ok, false);
  const approved = checkChange(me([{ kind: "won", title: "A" }], "approved"));
  assert.match(approved.ok ? approved.note ?? "" : "", /go back to pending/);
  const pending = checkChange(me([{ kind: "won", title: "A" }], "pending"));
  assert.match(pending.ok ? pending.note ?? "" : "", /still waiting for review\. Approve it in scenario 4 first/);
  const none = checkChange(me([{ kind: "won", title: "A" }]));
  assert.match(none.ok ? none.note ?? "" : "", /no approved proof/);
  assert.equal(checkSubmit().ok, true);
});

test("lists read as words", () => {
  assert.equal(listWords([]), "");
  assert.equal(listWords(["A"]), "A");
  assert.equal(listWords(["A", "B"]), "A and B");
  assert.equal(listWords(["A", "B", "C"]), "A, B and C");
});
