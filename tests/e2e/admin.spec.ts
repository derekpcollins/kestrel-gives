// The Admin Dashboard: section nav, Totals and People, and the not-admin state (SPEC §8;
// DECISIONS #107, #112; Stage 6B). Other specs jump phases on dev meanwhile, so Totals use a
// fixed answer (tests/db/admin.test.ts checks the real figures) and nothing here writes.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(({}, info) => test.skip(info.project.name !== "light-1280" && info.project.name !== "light-390", "content is the same in every project; 390 checks the phone"));
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });

const WCAG_22_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function viewAs(page: Page, id: string): Promise<void> {
  await page.context().addCookies([{ name: "kg_viewer", value: id, url: "http://localhost:3000" }]);
}

function summary(phase: "live" | "ended") {
  return {
    ok: true, now: "2026-11-03T20:00:00.000Z",
    event: { id: "1", name: "Kestrel Gives 2026", timeZone: "America/New_York", phase, submissionsOpenAt: null, biddingOpensAt: null, biddingClosesAt: null, proofDeadline: null },
    totals: {
      pledged: { auctionCents: phase === "live" ? 0 : 57_500, instantCents: 51_500, grandCents: phase === "live" ? 51_500 : 109_000 },
      confirmed: { auctionCents: 0, instantCents: 17_000, grandCents: 16_500 },
      approvedOwedCents: 17_000, approvedPeople: 2,
      gapLine: "Approved proofs: $165 against $170 owed by those people, $5 short.",
      leadingBidsCents: phase === "live" ? 57_500 : null,
    },
    pendingProofs: 1, activeItems: 15, reset: { unlocksAt: null, unlocked: false }, demoReset: false,
  };
}

async function stubSummary(page: Page, phase: "live" | "ended"): Promise<void> {
  await page.route(/\/api\/admin\?view=summary$/, (route) => route.fulfill({ json: summary(phase) }));
}

async function axe(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test("Totals while live: three cards, the gap line, and leading bids kept apart and labeled not final", async ({ page }) => {
  await viewAs(page, "1");
  await stubSummary(page, "live");
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Admin sections" });
  await expect(nav.getByRole("link", { name: "Totals" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "People" })).not.toHaveAttribute("aria-current", /.*/);
  await expect(page).toHaveTitle("Totals · Admin Dashboard · Kestrel Gives");
  await expect(page.getByRole("heading", { level: 2, name: "Totals" })).toBeVisible();
  const cards = page.locator(".total-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("Silent auction");
  await expect(cards.nth(1)).toContainText("Pledged$515");
  await expect(cards.nth(2)).toContainText("Grand total");
  await expect(cards.nth(2)).toContainText("Confirmed$165");
  await expect(page.locator(".admin-gap")).toHaveText("Approved proofs: $165 against $170 owed by those people, $5 short.");
  const leading = page.getByRole("region", { name: "Leading bids so far, not final until bidding closes" });
  await expect(leading).toContainText("$575");
  await expect(leading).toContainText("not in the totals above");
  await expect(page.locator(".total-cards .leading-note")).toHaveCount(0);
  await axe(page);
});

test("Totals after the close: winning bids pledged, no leading bids", async ({ page }) => {
  await viewAs(page, "1");
  await stubSummary(page, "ended");
  await page.goto("/admin");
  await expect(page.locator(".total-card").nth(0)).toContainText("Pledged$575");
  await expect(page.locator(".total-card").nth(2)).toContainText("Pledged$1,090");
  await expect(page.locator(".leading-note")).toHaveCount(0);
});

test("People: everyone in a table, admins marked, proof status with the amount against the total", async ({ page }) => {
  await viewAs(page, "1");
  await page.goto("/admin/people");
  await expect(page).toHaveTitle("People · Admin Dashboard · Kestrel Gives");
  await expect(page.getByRole("navigation", { name: "Admin sections" }).getByRole("link", { name: "People" })).toHaveAttribute("aria-current", "page");
  const table = page.getByRole("region", { name: "People" }).getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText(["Person", "Bids", "Wins", "Purchases", "Donation total", "Proof"]);
  await expect(table.locator("tbody tr")).toHaveCount(7);
  await expect(table.getByRole("rowheader", { name: /Maya Okafor/ })).toContainText("Admin");
  await expect(table.getByRole("row", { name: /Dev Kapoor/ })).toContainText("Approved");
  await expect(table.getByRole("row", { name: /Owen Achterberg/ })).toContainText("Rejected");
  await axe(page);
});

test("employees see For admins only, with no section nav, and the API isn't asked", async ({ page }) => {
  await viewAs(page, "3");
  const asked: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/admin")) asked.push(r.url()); });
  await page.goto("/admin/people");
  await expect(page.getByRole("heading", { name: "For admins only" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin sections" })).toBeHidden();
  await expect(page).toHaveTitle("Admin Dashboard · Kestrel Gives");
  await expect(page.getByRole("main")).toContainText("choose Maya Okafor or Theo Lindqvist");
  expect(asked).toEqual([]);
  await axe(page);
});

test("the demo bar switches between the dashboard and For admins only", async ({ page }, info) => {
  await viewAs(page, "1");
  await stubSummary(page, "live");
  await page.goto("/admin");
  await expect(page.locator(".total-card")).toHaveCount(3);
  if (info.project.name === "light-390") await page.locator("[data-shell-demo] details summary").click();
  await page.getByLabel("Viewing as").selectOption({ label: "Jules Ferreira (employee)" });
  await expect(page.getByRole("heading", { name: "For admins only" })).toBeVisible();
  await expect(page.locator("[data-admin-body]")).toBeHidden();
  await page.getByLabel("Viewing as").selectOption({ label: "Theo Lindqvist (admin)" });
  await expect(page.locator(".total-card")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "For admins only" })).toBeHidden();
});

test("a 403 from the API shows For admins only", async ({ page }) => {
  await viewAs(page, "1");
  await page.route(/\/api\/admin\?view=summary$/, (route) => route.fulfill({ status: 403, json: { ok: false, code: "admins-only", error: "Only admins can use the Admin Dashboard." } }));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "For admins only" })).toBeVisible();
});

test("a failed load says so and Try again recovers", async ({ page }) => {
  await viewAs(page, "1");
  let fail = true;
  await page.route(/\/api\/admin\?view=summary$/, (route) => (fail ? route.fulfill({ status: 500, json: { ok: false } }) : route.fulfill({ json: summary("live") })));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "We couldn't load this section" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".total-card")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "We couldn't load this section" })).toBeHidden();
});

// ---------------------------------------------------------------------------------------------
// Proof review (SPEC §7.6; DECISIONS #113; Stage 6C). The answers and every POST are stubbed, so
// nothing writes; tests/db/admin.test.ts covers approve and reject against the database.

const person = (id: string, firstName: string, lastName: string) => ({ id, firstName, lastName });
const maya = person("1", "Maya", "Okafor");
const shot = "/seed/proofs/placeholder-proof.png";

function proof(over: Record<string, unknown>) {
  return { id: "1", status: "pending", amountCents: 6_000, owedCents: 6_500, totalCents: 6_500, short: true, totalChanged: false,
    createdAt: "2026-11-03T21:00:00.000Z", person: person("6", "Rosa", "Delgado"), rejectionReason: null, imageUrl: shot, reviewedAt: null, reviewer: null, ...over };
}

const rosaApproved = proof({ status: "approved", reviewedAt: "2026-11-03T22:00:00.000Z", reviewer: maya });
const rosaRejected = proof({ status: "rejected", reviewedAt: "2026-11-03T22:00:00.000Z", reviewer: maya, rejectionReason: "The amount is cut off." });
const dev = proof({ id: "2", status: "approved", amountCents: 10_500, owedCents: 10_500, totalCents: 10_500, short: false, createdAt: "2026-11-03T19:00:00.000Z", person: person("4", "Dev", "Kapoor"), reviewedAt: "2026-11-03T20:00:00.000Z", reviewer: maya });
const owen = proof({ id: "3", status: "rejected", amountCents: 3_500, owedCents: 3_500, totalCents: 3_500, short: false, createdAt: "2026-11-03T16:00:00.000Z", person: person("7", "Owen", "Achterberg"), reviewedAt: "2026-11-03T17:00:00.000Z", reviewer: maya, rejectionReason: "The screenshot doesn't show the donation amount." });

const proofsAnswer = (list: unknown[]) => ({ ok: true, now: "2026-11-03T23:00:00.000Z", proofDeadline: "2026-11-13T00:00:00.000Z", proofs: list });

async function stubProofs(page: Page, list: unknown[]): Promise<void> {
  await page.route(/\/api\/admin\?view=proofs$/, (route) => route.fulfill({ json: proofsAnswer(list) }));
}

test("Proof review: waiting first with the short warning, then reviewed with who and why", async ({ page }) => {
  await viewAs(page, "1");
  await stubProofs(page, [proof({}), dev, owen]);
  await page.goto("/admin/proofs");
  await expect(page).toHaveTitle("Proof review · Admin Dashboard · Kestrel Gives");
  await expect(page.getByRole("navigation", { name: "Admin sections" }).getByRole("link", { name: "Proof review" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".proof-queue__title")).toHaveText(["Waiting for review (1)", "Reviewed (2)"]);
  await expect(page.locator(".proof-review__name")).toHaveText(["Rosa Delgado", "Dev Kapoor", "Owen Achterberg"]);
  const rosa = page.getByRole("listitem", { name: "Rosa Delgado" });
  await expect(rosa.locator(".proof-review__note--warning")).toHaveText("$5 short of their $65 donation total. You can still approve it.");
  await expect(rosa.getByRole("button", { name: "Approve Rosa Delgado's proof" })).toBeVisible();
  const owenCard = page.getByRole("listitem", { name: "Owen Achterberg" });
  await expect(owenCard).toContainText("Rejected by Maya Okafor");
  await expect(owenCard).toContainText("Reason: The screenshot doesn't show the donation amount.");
  await expect(owenCard.getByRole("button", { name: /Approve/ })).toHaveCount(0);
  await axe(page);
});

test("View larger opens the screenshot in place and says so", async ({ page }) => {
  await viewAs(page, "1");
  await stubProofs(page, [proof({}), dev]);
  await page.goto("/admin/proofs");
  const rosa = page.getByRole("listitem", { name: "Rosa Delgado" });
  const toggle = rosa.getByRole("button", { name: "View larger screenshot from Rosa Delgado" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(rosa.getByRole("img", { name: "Donation screenshot from Rosa Delgado, larger" })).toBeHidden();
  await toggle.click();
  await expect(rosa.getByRole("button", { name: /View smaller/ })).toHaveAttribute("aria-expanded", "true");
  await expect(rosa.getByRole("img", { name: "Donation screenshot from Rosa Delgado, larger" })).toBeVisible();
  await axe(page);
  await rosa.getByRole("button", { name: /View smaller/ }).click();
  await expect(rosa.getByRole("img", { name: "Donation screenshot from Rosa Delgado, larger" })).toBeHidden();
});

test("Approve sends the total seen, then redraws with a toast; the short note drops its nudge", async ({ page }) => {
  await viewAs(page, "1");
  await stubProofs(page, [proof({}), dev]);
  let sent: unknown = null;
  await page.route(/\/api\/admin$/, (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, message: "Proof approved.", view: "proofs", answer: proofsAnswer([rosaApproved, dev]) } });
  });
  await page.goto("/admin/proofs");
  await page.getByRole("button", { name: "Approve Rosa Delgado's proof" }).click();
  await expect(page.getByText("Proof approved.")).toBeVisible();
  expect(sent).toEqual({ action: "approve-proof", proofId: "1", totalCents: 6_500 });
  await expect(page.locator(".proof-queue__title")).toHaveText(["Waiting for review (0)", "Reviewed (2)"]);
  await expect(page.locator("#queue-waiting")).toBeFocused();
  const rosa = page.getByRole("listitem", { name: "Rosa Delgado" });
  await expect(rosa).toContainText("Approved by Maya Okafor");
  await expect(rosa.locator(".proof-review__note--warning")).toHaveText("$5 short of their $65 donation total.");
});

test("Reject needs a reason: an inline error first, then it sends the reason", async ({ page }) => {
  await viewAs(page, "1");
  await stubProofs(page, [proof({}), dev]);
  let sent: unknown = null;
  await page.route(/\/api\/admin$/, (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, message: "Proof rejected. Rosa can upload a new one.", view: "proofs", answer: proofsAnswer([rosaRejected, dev]) } });
  });
  await page.goto("/admin/proofs");
  await page.getByRole("button", { name: "Reject Rosa Delgado's proof" }).click();
  const dialog = page.getByRole("dialog", { name: "Reject Rosa Delgado's proof?" });
  const reason = dialog.getByLabel("Reason (shown to Rosa)");
  await expect(reason).toBeFocused();
  await dialog.getByRole("button", { name: "Reject proof" }).click();
  await expect(dialog.getByText("Enter a reason. The person will see it.")).toBeVisible();
  await expect(reason).toHaveAttribute("aria-invalid", "true");
  await expect(reason).toBeFocused();
  expect(sent).toBeNull();
  await axe(page);
  await reason.fill("The amount is cut off.");
  await expect(reason).not.toHaveAttribute("aria-invalid", /.*/);
  await dialog.getByRole("button", { name: "Reject proof" }).click();
  await expect(dialog).toBeHidden();
  expect(sent).toEqual({ action: "reject-proof", proofId: "1", reason: "The amount is cut off." });
  await expect(page.getByText("Proof rejected. Rosa can upload a new one.")).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Rosa Delgado" })).toContainText("Reason: The amount is cut off.");
});

test("a refused approve (the total moved) reloads the queue and says why", async ({ page }) => {
  await viewAs(page, "1");
  let loads = 0;
  await page.route(/\/api\/admin\?view=proofs$/, (route) => { loads++; return route.fulfill({ json: proofsAnswer([proof({}), dev]) }); });
  await page.route(/\/api\/admin$/, (route) => route.fulfill({ status: 409, json: { ok: false, code: "total-changed", error: "Their donation total is now $40. Check the proof again." } }));
  await page.goto("/admin/proofs");
  await page.getByRole("button", { name: "Approve Rosa Delgado's proof" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Their donation total is now $40" })).toHaveText("Their donation total is now $40. Check the proof again. The queue has been updated.");
  expect(loads).toBe(2);
});

test("no proofs yet: both groups say so", async ({ page }) => {
  await viewAs(page, "1");
  await stubProofs(page, []);
  await page.goto("/admin/proofs");
  await expect(page.getByText("Nothing is waiting for review.")).toBeVisible();
  await expect(page.getByText("No one has uploaded proof yet.")).toBeVisible();
});

test("6B fixes: zero totals are muted, and People's Not uploaded is neutral while live", async ({ page }) => {
  await viewAs(page, "1");
  await stubSummary(page, "live");
  await page.goto("/admin");
  await expect(page.locator(".total-card").nth(0).locator(".total-card__amount--zero")).toHaveCount(2);
  await expect(page.locator(".total-card").nth(1).locator(".total-card__amount--zero")).toHaveCount(0);
  await page.route(/\/api\/admin\?view=people$/, (route) => route.fulfill({ json: {
    ok: true, now: "2026-11-03T23:00:00.000Z", phase: "live", proofDeadline: null,
    people: [{ ...person("3", "Jules", "Ferreira"), role: "employee", bidCount: 2, wins: 0, purchases: 1, totalCents: 4_000, proof: null }],
  } }));
  await page.goto("/admin/people");
  await expect(page.getByRole("row", { name: /Jules Ferreira/ }).locator(".pill")).toHaveText("Not uploaded");
  await expect(page.getByRole("row", { name: /Jules Ferreira/ }).locator(".pill")).toHaveAttribute("class", "pill");
});
