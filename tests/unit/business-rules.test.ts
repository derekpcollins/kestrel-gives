// Conformance check 5 (SPEC §12): the business rules in SPEC §7. Each todo becomes a
// real test (against Postgres on the dev branch where noted) in the milestone that
// builds the rule, so the gaps stay visible in every run until then.
import { describe, test } from "node:test";

describe("business rules (SPEC §7)", () => {
  test.todo("first bid is at least the starting bid; later bids beat the high bid by the increment (§7.4)");
  test.todo("the current high bidder can't bid again (§7.4)");
  test.todo("bidding and buying are blocked outside the live phase; submissions follow the phase windows (§7.1, §7.4, §7.5)");
  test.todo("simultaneous bids: the first saved wins, the other gets the new minimum (Postgres, dev) (§7.4)");
  test.todo("simultaneous purchases never take inventory below zero (Postgres, dev) (§7.5)");
  test.todo("sale type, starting bid, price, and quantity lock once a bid or purchase exists (§7.3)");
  test.todo("delete only with no bids or purchases; cancel is admin-only (§7.3)");
  test.todo("the yearly reset is locked until 30 days after bidding closes (§7.8)");
  test.todo("email templates reject unknown or misspelled variables (§7.7)");
});
