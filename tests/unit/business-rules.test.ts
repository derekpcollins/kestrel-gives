// Conformance check 5 (SPEC §12): the business rules in SPEC §7. Each todo becomes a
// real test (against Postgres on the dev branch where noted) in the milestone that
// builds the rule, so the gaps stay visible in every run until then. Bidding and buying
// (Milestone 4) are covered in tests/unit/sale-rules.test.ts and tests/db/sales.test.ts;
// submitting, editing and deleting items (Milestone 5) in tests/unit/employee-rules.test.ts
// and tests/db/employee-flows.test.ts.
import { describe, test } from "node:test";

describe("business rules (SPEC §7)", () => {
  test.todo("cancel is admin-only (§7.3)");
  test.todo("the yearly reset is locked until 30 days after bidding closes (§7.8)");
  test.todo("email templates reject unknown or misspelled variables (§7.7)");
});
