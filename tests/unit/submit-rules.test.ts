// The Submit an Item and Edit item page's decisions (SPEC §7.3; DECISIONS #94, #98).
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { moneyProblem } from "../../src/components/form-rules.ts";
import { itemProblems, startingBidTooLow } from "../../src/components/item-form-rules.ts";
import { canEdit, dollarsField, editIdFromPath, editState, itemBody, pageCopy, requestFailure, startingBidHelp, submitPageBlock } from "../../src/pages/submit-rules.ts";

describe("submit and edit page", () => {
  test("the edit page is /items/<id>/edit", () => {
    assert.equal(editIdFromPath("/items/12/edit"), "12");
    assert.equal(editIdFromPath("/items/12/edit/"), "12");
    assert.equal(editIdFromPath("/submit"), null);
    assert.equal(editIdFromPath("/items/12"), null);
    assert.equal(editIdFromPath("/items/0/edit"), null);
    assert.equal(pageCopy("edit").submitLabel, "Save changes");
    assert.equal(pageCopy("submit").busyLabel, "Submitting…");
  });

  test("who may submit now", () => {
    assert.equal(submitPageBlock({ role: "employee" }, "submission"), null);
    assert.equal(submitPageBlock({ role: "employee" }, "live"), "Submissions are closed. Only admins can add items now.");
    assert.equal(submitPageBlock({ role: "admin" }, "ended"), null);
    assert.match(submitPageBlock(null, null)!, /Restore demo data/);
  });

  test("editing: who, what's locked, and whether delete is offered", () => {
    const item = { submitter: { id: "3", firstName: "Jules", lastName: "Ferreira" }, cancelled: false, hasActivity: false };
    const jules = { id: "3", role: "employee" as const };
    assert.deepEqual(editState(jules, item), { blocked: null, locked: [], canDelete: true });
    assert.deepEqual(editState(jules, { ...item, hasActivity: true }), { blocked: null, locked: ["type", "startingBid", "price", "quantity"], canDelete: false });
    assert.equal(editState({ id: "4", role: "employee" }, item).blocked?.code, "not-yours");
    assert.equal(canEdit({ id: "1", role: "admin" }, item), true);
    assert.equal(canEdit(jules, { ...item, cancelled: true }), false);
    assert.equal(canEdit(null, item), false);
  });

  test("the request body sends cents, and only the chosen sale type's money", () => {
    const values = { type: "instant" as const, title: "  Lemon squares ", description: "A dozen.", startingBid: "10", price: "12", quantity: " 6 " };
    assert.deepEqual(itemBody(values, [{ photoId: "2" }, { uploadId: "9" }]), {
      type: "instant", title: "Lemon squares", description: "A dozen.", startingBidCents: null, priceCents: 1_200, quantity: 6,
      photos: [{ photoId: "2" }, { uploadId: "9" }],
    });
    assert.deepEqual(itemBody({ ...values, type: "auction", startingBid: "25" }, []).startingBidCents, 2_500);
    assert.equal(itemBody({ ...values, price: "12.50" }, []).priceCents, null, "the server says why");
  });

  test("small helpers", () => {
    assert.equal(startingBidHelp(1_500), "At least $15, the event minimum. Whole dollars.");
    assert.equal(dollarsField(4_000), "40");
    assert.equal(dollarsField(null), "");
    assert.match(requestFailure(null, undefined), /couldn't reach the server/);
    assert.equal(requestFailure(429, "Try again tomorrow."), "Try again tomorrow.");
  });
});

describe("the starting bid minimum reads the same everywhere", () => {
  const amount = (text: string) => /\$\d{1,3}(?:,\d{3})*/.exec(text)?.[0];
  for (const minCents of [200, 1_000, 3_500, 25_000, 1_000_000]) {
    test(`minimum ${minCents / 100} dollars: hint, server and browser agree`, () => {
      const hint = startingBidHelp(minCents);
      const server = itemProblems(
        { type: "auction", title: "T", description: "D", startingBidCents: minCents - 100, priceCents: null, quantity: null, photoCount: 1 },
        { minStartingBidCents: minCents },
      ).startingBid;
      const browser = moneyProblem(String(minCents / 100 - 1), { label: "Starting bid", min: minCents / 100, required: true });
      assert.equal(server, startingBidTooLow(minCents));
      assert.equal(browser, server);
      assert.ok(amount(hint));
      assert.equal(amount(hint), amount(server!));
    });
  }
});

