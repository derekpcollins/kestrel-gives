// Conformance check 5 (SPEC §12): the business rules in SPEC §7. Each rule is tested where it
// lives: bidding and buying (Milestone 4) in tests/unit/sale-rules.test.ts and
// tests/db/sales.test.ts; submitting, editing and deleting items (Milestone 5) in
// tests/unit/employee-rules.test.ts and tests/db/employee-flows.test.ts; the admin rules
// (Milestone 6) in tests/unit/admin-*.test.ts and tests/db/admin.test.ts. The three below were
// todos until Milestone 7A (DECISIONS entry 121); each now checks the shared rule here, and
// the database test it names checks the server end to end.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseAdminAction } from "../../lib/api/admin-requests.ts";
import { parseItemWrite } from "../../lib/api/item-requests.ts";
import { TEMPLATE_DEFAULTS, TEMPLATE_KEYS } from "../../lib/email-templates.ts";
import { RESET_AFTER_DAYS, resetNameMatches, resetUnlocksAt } from "../../src/components/settings-rules.ts";
import { templateProblems, tokenProblems } from "../../src/components/template-rules.ts";

const DAY = 86_400_000;

describe("business rules (SPEC §7)", () => {
  test("cancel is admin-only (§7.3): only /api/admin takes a cancel; employees get 403 there (tests/db/admin.test.ts)", () => {
    assert.deepEqual(parseAdminAction({ action: "cancel-item", itemId: "7" }), { action: "cancel-item", itemId: "7" });
    assert.deepEqual(parseAdminAction({ action: "cancel-purchase", purchaseId: "3" }), { action: "cancel-purchase", purchaseId: "3" });
    // The employees' item write (submit and edit) has no cancel or status to set.
    const write = parseItemWrite({
      type: "auction", title: "Pottery class", description: "Two hours at the wheel.", startingBidCents: 5000,
      photos: [{ photoId: "1" }], status: "cancelled", cancelled: true,
    });
    assert.ok(!("error" in write), JSON.stringify(write));
    assert.ok(!("status" in write) && !("cancelled" in write));
  });

  test("the yearly reset is locked until 30 days after bidding closes (§7.8; the server's lock in tests/db/admin.test.ts)", () => {
    assert.equal(RESET_AFTER_DAYS, 30);
    const closes = new Date("2026-11-06T02:00:00Z");
    const unlocks = resetUnlocksAt(closes)!;
    assert.equal(unlocks.getTime() - closes.getTime(), 30 * DAY);
    const unlocked = (now: Date) => now >= unlocks; // as the summary (lib/data/admin.ts) and resetYearIn (lib/data/admin-settings.ts) decide it
    assert.equal(unlocked(new Date(unlocks.getTime() - 1)), false);
    assert.equal(unlocked(unlocks), true);
    assert.equal(resetUnlocksAt(null), null, "an event with no close date never unlocks");
    assert.equal(resetNameMatches("Kestrel Gives 2026", "Kestrel Gives 2026"), true);
    assert.equal(resetNameMatches("kestrel gives 2026", "Kestrel Gives 2026"), false, "the name must match exactly");
  });

  test("email templates reject unknown or misspelled variables (§7.7; saving refused in tests/db/admin.test.ts)", () => {
    const outbid = TEMPLATE_DEFAULTS.outbid.variables;
    assert.deepEqual(tokenProblems("Hi {{frist_name}}", outbid), ["{{frist_name}} isn't a variable. Did you mean {{first_name}}?"]);
    assert.deepEqual(tokenProblems("{{nonsense}}", outbid), ["{{nonsense}} isn't a variable."]);
    assert.deepEqual(tokenProblems("Hi {{first_name", outbid), ["Check the braces: each variable is written like {{first_name}}."]);
    const problems = templateProblems({ subject: "Outbid on {{item_nmae}}", body: "Hi {{first_name}}." }, outbid);
    assert.deepEqual(problems.map((p) => p.field), ["subject"]);
    // Every default passes its own check, so Restore to default always saves.
    for (const key of TEMPLATE_KEYS) {
      const d = TEMPLATE_DEFAULTS[key];
      assert.deepEqual(templateProblems(d, d.variables), [], key);
    }
  });
});
