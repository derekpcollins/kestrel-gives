// The proof page's words (SPEC §7.6; DECISIONS #95, #103) and the uploader's single-file words.
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { uploaderWords } from "../../src/components/upload-rules.ts";
import type { ProofView } from "../../src/me-api.ts";
import { amountCents, amountNote, blockedIcon, givingView, OWES_NOTHING, PROOF_PAGE_LINK, proofNotes, startingAmount, totalLine } from "../../src/pages/proof-rules.ts";
import { PROOF_LINK } from "../../src/pages/your-items-rules.ts";

const NOW = new Date("2026-11-28T15:00:00Z");
const proof = (over: Partial<ProofView>): ProofView => ({ totalCents: 12_500, latest: null, deadline: null, totalChanged: false, blocked: null, ...over });
const latest = (over: Partial<NonNullable<ProofView["latest"]>>): NonNullable<ProofView["latest"]> => ({
  status: "pending", amountCents: 12_500, owedCents: 12_500, rejectionReason: null, createdAt: NOW.toISOString(), imageUrl: "/x.png", ...over,
});

describe("proof page notes", () => {
  test("nothing above the form before a first proof", () => {
    assert.deepEqual(proofNotes(proof({})), []);
  });
  test("a rejected proof shows its reason, and a new upload is offered by the form itself", () => {
    assert.deepEqual(proofNotes(proof({ latest: latest({ status: "rejected", rejectionReason: "The amount is cut off." }) })),
      [{ tone: "danger", title: "Your last proof was rejected", text: "Reason: The amount is cut off." }]);
    assert.equal(proofNotes(proof({ latest: latest({ status: "rejected" }) }))[0]!.text, "Please upload a new one.");
  });
  test("waiting and approved proofs say what a new upload does", () => {
    assert.match(proofNotes(proof({ latest: latest({}) }))[0]!.text, /\$125\. A new upload replaces it\.$/);
    assert.equal(proofNotes(proof({ latest: latest({ status: "approved" }) }))[0]!.title, "Your last proof was approved");
  });
  test("a changed total comes first, with both amounts", () => {
    const notes = proofNotes(proof({ totalCents: 9_000, totalChanged: true, latest: latest({}) }));
    assert.equal(notes[0]!.tone, "warning");
    assert.equal(notes[0]!.text, "It was $125 when you uploaded proof and is now $90.");
    assert.equal(notes.length, 2);
  });
});

describe("proof page total and amount", () => {
  test("the total line says how long is left, or how late", () => {
    assert.equal(totalLine(proof({}), NOW), "Your donation total is $125.");
    assert.equal(totalLine(proof({ deadline: "2026-12-04T18:00:00Z" }), NOW), "Your donation total is $125. 6 days left to upload proof.");
    assert.equal(totalLine(proof({ deadline: "2026-11-28T18:00:00Z" }), NOW), "Your donation total is $125. It's due today.");
    assert.equal(totalLine(proof({ deadline: "2026-11-26T18:00:00Z" }), NOW), "Your donation total is $125. It's 2 days late.");
  });
  test("the amount starts at the total in whole dollars", () => {
    assert.equal(startingAmount(proof({})), "125");
    assert.equal(startingAmount(proof({ totalCents: 0 })), "");
  });
  test("below the total warns but isn't an error; at or above, or not a number yet, says nothing", () => {
    assert.match(amountNote("100", 12_500)!, /less than your \$125 donation total\. You can still submit/);
    assert.equal(amountNote("125", 12_500), null);
    assert.equal(amountNote("200", 12_500), null);
    assert.equal(amountNote("", 12_500), null);
    assert.equal(amountNote("12.50", 12_500), null);
  });
  test("amounts are whole dollars in cents", () => {
    assert.equal(amountCents("125"), 12_500);
    assert.equal(amountCents("1,250"), null);
    assert.equal(amountCents("abc"), null);
  });
  test("Your Items and the page agree on the address", () => {
    assert.equal(PROOF_PAGE_LINK, PROOF_LINK);
  });
});

describe("uploader words", () => {
  test("one screenshot: no counts out of a maximum", () => {
    const w = uploaderWords("screenshot", 1);
    assert.equal(w.required, "Add a screenshot.");
    assert.equal(w.count(0), "No screenshot yet");
    assert.equal(w.count(1), "Screenshot added. Remove it to choose a different one.");
    assert.equal(w.added(1, 1), "Screenshot added.");
    assert.equal(w.removed(0), "Screenshot removed.");
    assert.equal(w.full, "You've added a screenshot. Remove it to choose a different one.");
  });
  test("photos keep their counts", () => {
    const w = uploaderWords("photo", 5);
    assert.equal(w.count(2), "2 of 5 photos");
    assert.equal(w.added(1, 3), "1 photo added. 3 of 5.");
    assert.equal(w.required, "Add at least one photo.");
  });
});

describe("blocked states and the giving stub (5D review)", () => {
  test("a check mark only for an approved proof; nothing owed is information", () => {
    assert.equal(blockedIcon("approved"), "check");
    assert.equal(blockedIcon("nothing-owed"), "info");
  });
  test("the giving stub shows the total, and hides Upload proof when nothing is owed", () => {
    assert.deepEqual(givingView(proof({ totalCents: 3_500 })), { total: "Your total: $35", owesNothing: false });
    assert.deepEqual(givingView(proof({ totalCents: 0, blocked: { code: "nothing-owed", message: "" } })), { total: "Your total: $0", owesNothing: true });
    assert.equal(givingView(proof({ totalCents: 3_500, blocked: { code: "approved", message: "" } })).owesNothing, false);
    assert.deepEqual(givingView(null), { total: null, owesNothing: false });
    assert.equal(OWES_NOTHING, "You don't owe anything yet. Bid or buy to have a total.");
  });
});
