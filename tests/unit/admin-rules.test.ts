// Milestone 6A's pure rules: templates (SPEC §7.7), event settings and reset (§7.1, §7.8), the
// totals and gap line (§8, v1.17; DECISIONS #107), the admin API's input checks, and the two
// new phases (v1.17; DECISIONS #108).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseAdminAction, parseAdminView } from "../../lib/api/admin-requests.ts";
import { totalsFrom } from "../../lib/data/admin.ts";
import { TEMPLATE_DEFAULTS, TEMPLATE_KEYS } from "../../lib/email-templates.ts";
import { gapLine, reasonProblem, REASON_MAX } from "../../src/components/admin-rules.ts";
import { submitBlock } from "../../src/components/item-form-rules.ts";
import { tileStatus } from "../../src/components/item-tile-rules.ts";
import { phaseBanner, type BannerEvent } from "../../src/components/phase-banner-rules.ts";
import { bidBlock, buyBlock } from "../../src/components/sale-rules.ts";
import {
  checkSettings, fromZonedLocal, givingUrlProblem, nextEventName, resetNameMatches, resetUnlocksAt, toZonedLocal, type SettingsInput,
} from "../../src/components/settings-rules.ts";
import { currentJump, navLinks } from "../../src/components/shell-rules.ts";
import { fillTemplate, insertAt, SAMPLE_VALUES, templateProblems, tokenProblems } from "../../src/components/template-rules.ts";

const NY = "America/New_York";

describe("email template rules (SPEC §7.7)", () => {
  test("each default uses only its own variables, so it saves as is", () => {
    for (const key of TEMPLATE_KEYS) {
      const d = TEMPLATE_DEFAULTS[key];
      assert.deepEqual(templateProblems(d, d.variables), [], key);
    }
  });
  test("unknown tokens, near misses and variables this template doesn't offer are errors", () => {
    const allowed = TEMPLATE_DEFAULTS.outbid.variables;
    assert.deepEqual(tokenProblems("Hi {{fist_name}}", allowed), ["{{fist_name}} isn't a variable. Did you mean {{first_name}}?"]);
    assert.deepEqual(tokenProblems("{{banana}}", allowed), ["{{banana}} isn't a variable."]);
    assert.deepEqual(tokenProblems("{{rejection_reason}}", allowed), ["{{rejection_reason}} can't be used in this template."]);
    assert.deepEqual(tokenProblems("{{ first_name }}", allowed), ["{{ first_name }} isn't a variable. Did you mean {{first_name}}?"]);
    assert.deepEqual(tokenProblems("Hi {{first_name}", allowed), ["Check the braces: each variable is written like {{first_name}}."]);
    assert.deepEqual(tokenProblems("Hi {first_name}, {{amount}}", allowed), [], "single braces are plain text");
    assert.deepEqual(tokenProblems("{{x}} {{x}}", allowed), ["{{x}} isn't a variable."], "said once");
  });
  test("subject and body: required, capped, the subject on one line; problems by field", () => {
    const allowed = TEMPLATE_DEFAULTS.winner.variables;
    assert.deepEqual(templateProblems({ subject: " ", body: "" }, allowed).map((p) => p.field), ["subject", "body"]);
    assert.equal(templateProblems({ subject: "a\nb", body: "x" }, allowed)[0]?.message, "Keep the subject on one line.");
    assert.equal(templateProblems({ subject: "x".repeat(151), body: "x" }, allowed)[0]?.message, "Keep the subject to 150 characters.");
    assert.equal(templateProblems({ subject: "x", body: "x".repeat(5001) }, allowed)[0]?.message, "Keep the body to 5,000 characters.");
    assert.deepEqual(templateProblems({ subject: "{{nope}}", body: "ok" }, allowed), [{ field: "subject", message: "{{nope}} isn't a variable." }]);
  });
  test("the preview fills known variables with sample seed data and leaves the rest as typed", () => {
    assert.equal(fillTemplate("Hi {{first_name}}, {{amount}} on {{item_name}}. {{oops}}"), `Hi ${SAMPLE_VALUES.first_name}, $245 on Lakeside Cabin Weekend. {{oops}}`);
    assert.ok(!/pay|checkout/i.test(Object.values(SAMPLE_VALUES).join(" ")));
  });
  test("Insert variable goes in at the cursor, over any selection, and the cursor follows it", () => {
    assert.deepEqual(insertAt("Hi !", 3, 3, "first_name"), { text: "Hi {{first_name}}!", cursor: 17 });
    assert.deepEqual(insertAt("Hi NAME!", 3, 7, "first_name"), { text: "Hi {{first_name}}!", cursor: 17 });
  });
});

describe("event dates in the event's zone (SPEC §7.1)", () => {
  test("wall time to UTC and back, across standard and daylight time", () => {
    assert.equal(fromZonedLocal("2026-11-14T09:00", NY)?.toISOString(), "2026-11-14T14:00:00.000Z");
    assert.equal(fromZonedLocal("2026-07-01T09:00", NY)?.toISOString(), "2026-07-01T13:00:00.000Z");
    assert.equal(fromZonedLocal("2026-11-14T09:00", "America/Los_Angeles")?.toISOString(), "2026-11-14T17:00:00.000Z");
    assert.equal(toZonedLocal(new Date("2026-11-14T14:00:00Z"), NY), "2026-11-14T09:00");
    assert.equal(toZonedLocal(new Date("2026-11-14T14:00:00Z"), "UTC"), "2026-11-14T14:00");
  });
  test("the skipped hour doesn't exist; the repeated hour means the first one", () => {
    assert.equal(fromZonedLocal("2026-03-08T02:30", NY), null);
    assert.equal(fromZonedLocal("2026-11-01T01:30", NY)?.toISOString(), "2026-11-01T05:30:00.000Z");
  });
  test("anything that isn't a real date-time is refused", () => {
    for (const bad of ["", "2026-02-30T09:00", "2026-11-14 09:00", "2026-11-14T24:00", "2026-11-14T09:00:00"]) assert.equal(fromZonedLocal(bad, NY), null, bad);
  });
});

describe("event settings (SPEC §7.1)", () => {
  const good: SettingsInput = {
    name: "Kestrel Gives 2027", timeZone: NY, submissionsOpen: "2027-10-01T09:00", biddingOpens: "2027-10-15T09:00", biddingCloses: "2027-10-19T16:00",
    minStartingBidCents: 1000, bidIncrementCents: 500, proofDeadlineDays: 7, givingPlatformUrl: "/giving",
  };
  const problems = (over: Partial<SettingsInput>) => {
    const r = checkSettings({ ...good, ...over });
    return "problems" in r ? r.problems : [];
  };
  test("good settings come back cleaned, dates in UTC", () => {
    const r = checkSettings({ ...good, name: "  Kestrel Gives 2027 ", givingPlatformUrl: "" });
    assert.ok("settings" in r);
    assert.equal(r.settings.name, "Kestrel Gives 2027");
    assert.equal(r.settings.givingPlatformUrl, null);
    assert.equal(r.settings.dates?.biddingClosesAt.toISOString(), "2027-10-19T20:00:00.000Z");
  });
  test("all three dates, or none (Not scheduled yet)", () => {
    const r = checkSettings({ ...good, submissionsOpen: "", biddingOpens: "", biddingCloses: "" });
    assert.ok("settings" in r && r.settings.dates === null);
    assert.deepEqual(problems({ biddingCloses: "" }).map((p) => p.field), ["biddingCloses"]);
    assert.equal(problems({ biddingCloses: "" })[0]?.message, "Set all three dates, or leave all three empty.");
  });
  test("dates in order; a skipped hour is explained", () => {
    assert.deepEqual(problems({ biddingOpens: "2027-09-30T09:00" }).map((p) => p.message), ["Bidding can't open before submissions open."]);
    assert.deepEqual(problems({ biddingCloses: "2027-10-15T09:00" }).map((p) => p.message), ["Bidding has to close after it opens."]);
    assert.match(problems({ submissionsOpen: "2027-03-14T02:30" })[0]!.message, /doesn't exist in America\/New_York/);
  });
  test("name, zone, money, days and the giving address", () => {
    assert.equal(problems({ name: " " })[0]?.message, "Enter the event's name.");
    assert.equal(problems({ timeZone: "Mars/Olympus" })[0]?.field, "timeZone");
    assert.equal(problems({ minStartingBidCents: 1050 })[0]?.message, "Whole dollars only.");
    assert.equal(problems({ bidIncrementCents: 0 })[0]?.message, "Enter a bid increment of at least $1.");
    assert.equal(problems({ proofDeadlineDays: 61 })[0]?.message, "Enter a whole number of days from 1 to 60.");
    assert.equal(problems({ proofDeadlineDays: 1.5 })[0]?.field, "proofDeadlineDays");
    assert.equal(givingUrlProblem("https://give.example.org/kestrel"), null);
    assert.equal(givingUrlProblem("/giving"), null);
    assert.match(givingUrlProblem("http://give.example.org")!, /https:\/\//);
    assert.match(givingUrlProblem("javascript:alert(1)")!, /https:\/\//);
  });
});

describe("Reset for next year (SPEC §7.8)", () => {
  test("next year's name, the unlock date and the typed name", () => {
    assert.equal(nextEventName("Kestrel Gives 2026"), "Kestrel Gives 2027");
    assert.equal(nextEventName("Kestrel Gives 2026 (spring)"), "Kestrel Gives 2027 (spring)");
    assert.equal(nextEventName("Kestrel Gives"), "Kestrel Gives (next year)");
    assert.equal(resetUnlocksAt(new Date("2026-11-05T21:00:00Z"))?.toISOString(), "2026-12-05T21:00:00.000Z");
    assert.equal(resetUnlocksAt(null), null);
    assert.ok(resetNameMatches(" Kestrel Gives 2026 ", "Kestrel Gives 2026"));
    assert.ok(!resetNameMatches("kestrel gives 2026", "Kestrel Gives 2026"));
  });
});

describe("totals and the gap line (SPEC v1.17 §8, DECISIONS #107)", () => {
  const person = (auction: number, instant: number, status: "approved" | "pending" | "rejected" | null, amount: number | null = null) => ({
    id: "1", first_name: "A", last_name: "B", role: "employee" as const, auction: String(auction), instant: String(instant),
    bid_count: 0, wins: 0, purchases: 0, proof_id: status ? "9" : null, proof_status: status, proof_amount: amount, proof_owed: null, proof_at: null,
  });
  test("pledged is everyone's totals; confirmed covers approved people; grand confirmed is their approved amounts", () => {
    const t = totalsFrom([person(24500, 10000, "approved", 30000), person(0, 3500, "pending", 3500), person(15000, 0, null), person(0, 2000, "approved", 2500)], null);
    assert.deepEqual(t.pledged, { auctionCents: 39500, instantCents: 15500, grandCents: 55000 });
    assert.deepEqual(t.confirmed, { auctionCents: 24500, instantCents: 12000, grandCents: 32500 });
    assert.equal(t.approvedOwedCents, 36500);
    assert.equal(t.approvedPeople, 2);
    assert.equal(t.gapLine, "Approved proofs: $325 against $365 owed by those people, $40 short.");
  });
  test("the gap line: short, over, an exact match, one person, or nothing approved", () => {
    assert.equal(gapLine(140000, 130000, 3), "Approved proofs: $1,400 against $1,300 owed by those people, $100 over.");
    assert.equal(gapLine(3500, 3500, 1), "Approved proofs: $35 against $35 owed by that person, an exact match.");
    assert.equal(gapLine(0, 0, 0), null);
  });
  test("a rejection needs a reason, capped", () => {
    assert.equal(reasonProblem("  "), "Enter a reason. The person will see it.");
    assert.equal(reasonProblem("x".repeat(REASON_MAX + 1)), `Keep the reason to ${REASON_MAX} characters.`);
    assert.equal(reasonProblem("Blurry screenshot"), null);
  });
});

describe("/api/admin input checks", () => {
  test("views", () => {
    assert.equal(parseAdminView(new URLSearchParams("")), "summary");
    assert.equal(parseAdminView(new URLSearchParams("view=proofs")), "proofs");
    assert.ok("error" in (parseAdminView(new URLSearchParams("view=secrets")) as object));
  });
  test("actions need their fields, in their types", () => {
    assert.deepEqual(parseAdminAction({ action: "approve-proof", proofId: "4", totalCents: 3500, fromStatus: "rejected" }), { action: "approve-proof", proofId: "4", totalCents: 3500, fromStatus: "rejected" });
    assert.deepEqual(parseAdminAction({ action: "reject-proof", proofId: "4", reason: "r", fromStatus: "approved" }), { action: "reject-proof", proofId: "4", reason: "r", fromStatus: "approved" });
    assert.ok("error" in parseAdminAction({ action: "approve-proof", proofId: "4", fromStatus: "pending" }));
    assert.ok("error" in parseAdminAction({ action: "approve-proof", proofId: "4", totalCents: 3500 }), "the status seen is required");
    assert.ok("error" in parseAdminAction({ action: "reject-proof", proofId: "4", reason: "r", fromStatus: "done" }));
    assert.ok("error" in parseAdminAction({ action: "reject-proof", proofId: "x", reason: "r", fromStatus: "pending" }));
    assert.deepEqual(parseAdminAction({ action: "remove-bid", bidId: 12 }), { action: "remove-bid", bidId: "12" });
    assert.ok("error" in parseAdminAction({ action: "cancel-item" }));
    assert.ok("error" in parseAdminAction({ action: "save-settings", settings: { name: "x" } }));
    assert.ok("error" in parseAdminAction({ action: "drop-tables" }));
    assert.ok("error" in parseAdminAction([]));
    assert.deepEqual(parseAdminAction({ action: "reset-year", confirmName: "Kestrel Gives 2026" }), { action: "reset-year", confirmName: "Kestrel Gives 2026" });
  });
});

describe("Not scheduled yet and before submissions open (SPEC v1.17 §7.1, DECISIONS #108)", () => {
  const now = new Date("2026-11-02T18:30:00Z");
  const banner = (e: Partial<BannerEvent>) => phaseBanner({ phase: "unscheduled", endingSoon: false, biddingOpensAt: null, biddingClosesAt: null, proofDeadline: null, ...e }, now, NY);
  test("employees can't submit, bid or buy; admins can still add items", () => {
    for (const phase of ["unscheduled", "upcoming"] as const) {
      assert.equal(submitBlock("employee", phase)?.code, "submissions-closed");
      assert.equal(submitBlock("admin", phase), null);
      const sale = { phase, cancelled: false, viewerIsSubmitter: false };
      assert.equal(bidBlock({ ...sale, startingBidCents: 1000, incrementCents: 500, highBidCents: null, viewerIsHighBidder: false })?.code, "not-open");
      assert.equal(buyBlock({ ...sale, remaining: 3 })?.code, "not-open");
    }
    assert.match(submitBlock("employee", "unscheduled")!.message, /dates aren't set yet/);
  });
  test("the banner says the dates aren't set, or when submissions open", () => {
    assert.deepEqual(banner({ name: "Kestrel Gives 2027" }), { title: "Not scheduled yet", text: "Dates for Kestrel Gives 2027 aren't set yet. Check back soon.", icon: "clock" });
    const up = banner({ phase: "upcoming", submissionsOpenAt: new Date(now.getTime() + 3 * 86_400_000).toISOString() })!;
    assert.equal(up.title, "Submissions open soon");
    assert.match(up.text, /^Submissions open on Thursday, November 5 at 1:30 PM EST\.$/);
  });
  test("no Submit link, no Event phase button pressed, and tiles say why", () => {
    assert.ok(!navLinks("unscheduled").some((l) => l.key === "submit"));
    assert.ok(!navLinks("upcoming").some((l) => l.key === "submit"));
    assert.equal(currentJump({ phase: "unscheduled", endingSoon: false, proofDeadline: null }, now), null);
    const ctx = { now, biddingOpens: new Date(now.getTime() + 86_400_000), biddingCloses: new Date(now.getTime() + 5 * 86_400_000) };
    assert.deepEqual(tileStatus({ type: "auction", startingBid: 10 }, { ...ctx, phase: "unscheduled" }), { label: "Dates not set", tone: "neutral" });
    assert.equal(tileStatus({ type: "auction", startingBid: 10 }, { ...ctx, phase: "upcoming" })?.label, "Opens Nov 3");
  });
});
