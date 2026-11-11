// The Admin Dashboard: section nav, Totals and People, and the not-admin state (SPEC §8;
// DECISIONS #107, #112; Stage 6B). Other specs jump phases on dev meanwhile, so Totals use a
// fixed answer (tests/db/admin.test.ts checks the real figures) and nothing here writes.
import { expect, test, type Page } from "@playwright/test";
import { runAxe } from "./axe.ts";
import { pageLoaded } from "./page-load.ts";

test.beforeEach(({}, info) => test.skip(info.project.name !== "light-1280" && info.project.name !== "light-390", "content is the same in every project; 390 checks the phone"));
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });

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
  const { violations } = await runAxe(page);
  expect(violations.map((v) => `${v.id}: ${v.help} @ ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("Totals while live: three cards, the gap line, and leading bids kept apart and labeled not final", async ({ page }) => {
  await viewAs(page, "1");
  await stubSummary(page, "live");
  await page.goto("/admin");
  await pageLoaded(page);
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
  await pageLoaded(page);
  await expect(page.locator(".total-card").nth(0)).toContainText("Pledged$575");
  await expect(page.locator(".total-card").nth(2)).toContainText("Pledged$1,090");
  await expect(page.locator(".leading-note")).toHaveCount(0);
});

test("People: everyone in a table, admins marked, proof status with the amount against the total", async ({ page }) => {
  await viewAs(page, "1");
  await page.goto("/admin/people");
  await pageLoaded(page);
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
  await pageLoaded(page);
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
  await pageLoaded(page);
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
  await pageLoaded(page);
  await expect(page.getByRole("heading", { name: "For admins only" })).toBeVisible();
});

test("a failed load says so and Try again recovers", async ({ page }) => {
  await viewAs(page, "1");
  let fail = true;
  await page.route(/\/api\/admin\?view=summary$/, (route) => (fail ? route.fulfill({ status: 500, json: { ok: false } }) : route.fulfill({ json: summary("live") })));
  await page.goto("/admin");
  await pageLoaded(page);
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
  await pageLoaded(page);
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
  await expect(owenCard.getByRole("button")).toHaveText([/View larger/, "Approve instead (Owen Achterberg's proof)"]);
  await axe(page);
});

test("View larger opens the screenshot in place and says so", async ({ page }) => {
  await viewAs(page, "1");
  await stubProofs(page, [proof({}), dev]);
  await page.goto("/admin/proofs");
  await pageLoaded(page);
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
  await pageLoaded(page);
  await page.getByRole("button", { name: "Approve Rosa Delgado's proof" }).click();
  await expect(page.getByText("Proof approved.")).toBeVisible();
  expect(sent).toEqual({ action: "approve-proof", proofId: "1", totalCents: 6_500, fromStatus: "pending" });
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
  await pageLoaded(page);
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
  expect(sent).toEqual({ action: "reject-proof", proofId: "1", reason: "The amount is cut off.", fromStatus: "pending" });
  await expect(page.getByText("Proof rejected. Rosa can upload a new one.")).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Rosa Delgado" })).toContainText("Reason: The amount is cut off.");
});

test("a refused approve (the total moved) reloads the queue and says why", async ({ page }) => {
  await viewAs(page, "1");
  let loads = 0;
  await page.route(/\/api\/admin\?view=proofs$/, (route) => { loads++; return route.fulfill({ json: proofsAnswer([proof({}), dev]) }); });
  await page.route(/\/api\/admin$/, (route) => route.fulfill({ status: 409, json: { ok: false, code: "total-changed", error: "Their donation total is now $40. Check the proof again." } }));
  await page.goto("/admin/proofs");
  await pageLoaded(page);
  await page.getByRole("button", { name: "Approve Rosa Delgado's proof" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Their donation total is now $40" })).toHaveText("Their donation total is now $40. Check the proof again. The queue has been updated.");
  expect(loads).toBe(2);
});

test("reviewed cards offer the other decision; buttons are the regular 44px size", async ({ page }) => {
  await viewAs(page, "1");
  await stubProofs(page, [proof({}), dev, owen]);
  await page.goto("/admin/proofs");
  await pageLoaded(page);
  const rosa = page.getByRole("listitem", { name: "Rosa Delgado" });
  await expect(rosa.getByRole("button", { name: /instead/ })).toHaveCount(0);
  const reverse = [
    page.getByRole("listitem", { name: "Dev Kapoor" }).getByRole("button", { name: "Reject instead (Dev Kapoor's proof)" }),
    page.getByRole("listitem", { name: "Owen Achterberg" }).getByRole("button", { name: "Approve instead (Owen Achterberg's proof)" }),
  ];
  for (const b of reverse) await expect(b).toBeVisible();
  for (const b of [rosa.getByRole("button", { name: /^Approve/ }), rosa.getByRole("button", { name: /^Reject/ }), ...reverse]) {
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(reverse[0]!).toHaveText("Reject instead (Dev Kapoor's proof)"); // the hidden part follows the visible "Reject instead"
  await expect(reverse[0]!.locator(".visually-hidden")).toHaveText(" (Dev Kapoor's proof)");
});

test("Reject instead: the same dialog with a required reason, saying it leaves the confirmed totals", async ({ page }) => {
  await viewAs(page, "1");
  await stubProofs(page, [proof({}), dev, owen]);
  const devRejected = { ...dev, status: "rejected", rejectionReason: "Wrong screenshot.", reviewedAt: "2026-11-03T22:30:00.000Z" };
  let sent: unknown = null;
  await page.route(/\/api\/admin$/, (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, message: "Proof rejected instead. It's no longer confirmed, and they'll see your reason.", view: "proofs", answer: proofsAnswer([proof({}), devRejected, owen]) } });
  });
  await page.goto("/admin/proofs");
  await pageLoaded(page);
  await page.getByRole("button", { name: "Reject instead (Dev Kapoor's proof)" }).click();
  const dialog = page.getByRole("dialog", { name: "Reject Dev Kapoor's approved proof?" });
  await expect(dialog).toContainText("takes its $105 out of the confirmed totals");
  await dialog.getByRole("button", { name: "Reject instead" }).click();
  await expect(dialog.getByText("Enter a reason. The person will see it.")).toBeVisible();
  expect(sent).toBeNull();
  await axe(page);
  await dialog.getByLabel("Reason (shown to Dev)").fill("Wrong screenshot.");
  await dialog.getByRole("button", { name: "Reject instead" }).click();
  await expect(dialog).toBeHidden();
  expect(sent).toEqual({ action: "reject-proof", proofId: "2", reason: "Wrong screenshot.", fromStatus: "approved" });
  const card = page.getByRole("listitem", { name: "Dev Kapoor" });
  await expect(card).toContainText("Reason: Wrong screenshot.");
  await expect(card.getByRole("button", { name: "Approve instead (Dev Kapoor's proof)" })).toBeVisible();
  await expect(page.locator("#proof-2-name")).toBeFocused();
});

test("Approve instead: one click, with the total seen and the status it reverses", async ({ page }) => {
  await viewAs(page, "1");
  await stubProofs(page, [proof({}), dev, owen]);
  const owenApproved = { ...owen, status: "approved", rejectionReason: null, reviewedAt: "2026-11-03T22:30:00.000Z" };
  let sent: unknown = null;
  await page.route(/\/api\/admin$/, (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, message: "Proof approved instead. The rejection is cleared.", view: "proofs", answer: proofsAnswer([proof({}), dev, owenApproved]) } });
  });
  await page.goto("/admin/proofs");
  await pageLoaded(page);
  await page.getByRole("button", { name: "Approve instead (Owen Achterberg's proof)" }).click();
  await expect(page.getByText("Proof approved instead. The rejection is cleared.")).toBeVisible();
  expect(sent).toEqual({ action: "approve-proof", proofId: "3", totalCents: 3_500, fromStatus: "rejected" });
  const card = page.getByRole("listitem", { name: "Owen Achterberg" });
  await expect(card).not.toContainText("Reason:");
  await expect(card.getByRole("button", { name: "Reject instead (Owen Achterberg's proof)" })).toBeVisible();
  await expect(page.locator("#proof-3-name")).toBeFocused();
});

test("no proofs yet: both groups say so", async ({ page }) => {
  await viewAs(page, "1");
  await stubProofs(page, []);
  await page.goto("/admin/proofs");
  await pageLoaded(page);
  await expect(page.getByText("Nothing is waiting for review.")).toBeVisible();
  await expect(page.getByText("No one has uploaded proof yet.")).toBeVisible();
});

test("6B fixes: zero totals are muted, and People's Not uploaded is neutral while live", async ({ page }) => {
  await viewAs(page, "1");
  await stubSummary(page, "live");
  await page.goto("/admin");
  await pageLoaded(page);
  await expect(page.locator(".total-card").nth(0).locator(".total-card__amount--zero")).toHaveCount(2);
  await expect(page.locator(".total-card").nth(1).locator(".total-card__amount--zero")).toHaveCount(0);
  await page.route(/\/api\/admin\?view=people$/, (route) => route.fulfill({ json: {
    ok: true, now: "2026-11-03T23:00:00.000Z", phase: "live", proofDeadline: null,
    people: [{ ...person("3", "Jules", "Ferreira"), role: "employee", bidCount: 2, wins: 0, purchases: 1, totalCents: 4_000, proof: null }],
  } }));
  await page.goto("/admin/people");
  await pageLoaded(page);
  await expect(page.getByRole("row", { name: /Jules Ferreira/ }).locator(".pill")).toHaveText("Not uploaded");
  await expect(page.getByRole("row", { name: /Jules Ferreira/ }).locator(".pill")).toHaveAttribute("class", "pill");
});

// ---------------------------------------------------------------------------------------------
// Items (SPEC §7.3, §7.4, §8; DECISIONS #114; Stage 6D). Stubbed; tests/db/admin.test.ts covers
// remove bid and cancel item against the database, before and after the close.

const theo = person("2", "Theo", "Lindqvist");
const bidOf = (id: string, bidder: ReturnType<typeof person>, amountCents: number, createdAt: string, over: Record<string, unknown> = {}) =>
  ({ id, bidder, amountCents, createdAt, removedAt: null, removedBy: null, isTop: false, ...over });
const priya = person("5", "Priya", "Natarajan"), owenP = person("7", "Owen", "Achterberg"), jules = person("3", "Jules", "Ferreira");
const cabinBids = [
  bidOf("13", priya, 24_000, "2026-11-03T22:00:00.000Z", { isTop: true }),
  bidOf("12", owenP, 22_000, "2026-11-03T15:00:00.000Z"),
  bidOf("11", jules, 20_000, "2026-11-03T05:00:00.000Z", { removedAt: "2026-11-03T21:00:00.000Z", removedBy: maya }),
];
function itemOf(over: Record<string, unknown>) {
  return { id: "10", type: "auction", title: "Lakeside Cabin Weekend", coverUrl: "", cancelled: false, cancelledAt: null, submitter: theo,
    startingBidCents: 15_000, priceCents: null, quantity: null, remaining: null, purchases: 0, purchaseList: [] as unknown[], highBidCents: 24_000, bids: cabinBids, ...over };
}
const cabin = itemOf({});
const boardGame = itemOf({ id: "14", title: "Board game night, hosted", cancelled: true, cancelledAt: "2026-11-02T01:00:00.000Z", highBidCents: 2_500, bids: [bidOf("20", jules, 2_500, "2026-11-01T20:00:00.000Z", { isTop: false })] });
const buyOf = (id: string, buyer: ReturnType<typeof person>, createdAt: string, over: Record<string, unknown> = {}) =>
  ({ id, buyer, priceCents: 1_500, createdAt, cancelledAt: null, buyerProof: null, ...over });
const devP = person("4", "Dev", "Kapoor");
const lemonBuys = [
  buyOf("33", devP, "2026-11-03T21:00:00.000Z", { buyerProof: "approved" }),
  buyOf("32", jules, "2026-11-03T18:00:00.000Z"),
  buyOf("31", owenP, "2026-11-03T16:00:00.000Z"),
  buyOf("30", priya, "2026-11-03T15:00:00.000Z", { cancelledAt: "2026-11-03T20:00:00.000Z" }),
];
const lemon = itemOf({ id: "21", type: "instant", title: "Lemon squares, a dozen", startingBidCents: null, priceCents: 1_500, quantity: 10, remaining: 7, purchases: 3, highBidCents: null, bids: [], purchaseList: lemonBuys });
const itemsAnswer = (list: unknown[], phase = "live") => ({ ok: true, now: "2026-11-03T23:00:00.000Z", phase, items: list });

async function stubItems(page: Page, list: unknown[]): Promise<void> {
  await page.route(/\/api\/admin\?view=items$/, (route) => route.fulfill({ json: itemsAnswer(list) }));
}
const cardFor = (page: Page, title: string) => page.getByRole("listitem", { name: title });

test("Items: grouped by sale type, bid history opens in place, Remove only on standing bids of active items", async ({ page }) => {
  await viewAs(page, "1");
  await stubItems(page, [cabin, boardGame, lemon]);
  await page.goto("/admin/items");
  await pageLoaded(page);
  await expect(page).toHaveTitle("Items · Admin Dashboard · Kestrel Gives");
  await expect(page.getByRole("navigation", { name: "Admin sections" }).getByRole("link", { name: "Items" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".admin-glance")).toContainText("3 items · 1 cancelled");
  await expect(page.locator(".admin-items > h3")).toHaveText(["Silent auction (2)", "Instant sale (1)"]);
  const c = cardFor(page, "Lakeside Cabin Weekend");
  await expect(c).toContainText("Top bid $240 · 2 bids");
  await expect(c).toContainText("Donated by Theo Lindqvist");
  await expect(c.getByRole("link", { name: "Lakeside Cabin Weekend" })).toHaveAttribute("href", "/items/10");
  const toggle = c.getByRole("button", { name: "Show bid history (3 bids) for Lakeside Cabin Weekend" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(c.getByRole("table")).toBeHidden();
  await toggle.click();
  await expect(c.getByRole("button", { name: /^Hide bid history/ })).toHaveAttribute("aria-expanded", "true");
  const table = c.getByRole("table", { name: "Bid history for Lakeside Cabin Weekend, newest first" });
  await expect(table.getByRole("row", { name: /Priya Natarajan/ })).toContainText("Top bid");
  await expect(table.getByRole("button", { name: /^Remove/ })).toHaveCount(2);
  await expect(table.getByRole("button", { name: "Remove Priya Natarajan's $240 bid" })).toBeVisible();
  await expect(table.getByRole("row", { name: /Jules Ferreira/ })).toContainText("Removed by Maya Okafor today at 4:00 PM EST.");
  const gone = cardFor(page, "Board game night, hosted");
  await expect(gone).toContainText("Cancelled");
  await expect(gone.getByRole("button", { name: /Cancel item/ })).toHaveCount(0);
  await gone.getByRole("button", { name: /bid history/ }).click();
  await expect(gone.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  await expect(cardFor(page, "Lemon squares, a dozen")).toContainText("$15 each · 3 sold · 7 left");
  await expect(cardFor(page, "Lemon squares, a dozen").getByRole("button", { name: /bid history/ })).toHaveCount(0);
  await expect(cardFor(page, "Lemon squares, a dozen").getByRole("button", { name: "Show purchases (4) for Lemon squares, a dozen" })).toHaveAttribute("aria-expanded", "false");
  await axe(page);
});

test("Remove bid: Keep bid sends nothing; Remove bid posts, redraws with the history still open, and says so", async ({ page }) => {
  await viewAs(page, "1");
  await stubItems(page, [cabin, lemon]);
  const after = itemOf({ highBidCents: 22_000, bids: [{ ...cabinBids[0], isTop: false, removedAt: "2026-11-03T22:59:00.000Z", removedBy: maya }, { ...cabinBids[1], isTop: true }, cabinBids[2]] });
  const sent: unknown[] = [];
  await page.route(/\/api\/admin$/, (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, message: "Bid removed. The top bid has been updated.", view: "items", answer: itemsAnswer([after, lemon]) } });
  });
  await page.goto("/admin/items");
  await pageLoaded(page);
  const c = cardFor(page, "Lakeside Cabin Weekend");
  await c.getByRole("button", { name: /bid history/ }).click();
  await c.getByRole("button", { name: "Remove Priya Natarajan's $240 bid" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove Priya Natarajan's $240 bid?" });
  await expect(dialog).toContainText("The top bid goes back to $220 from Owen Achterberg.");
  await expect(dialog).toContainText("This can't be undone.");
  await expect(dialog.getByRole("button", { name: "Keep bid" })).toBeFocused();
  await axe(page);
  await dialog.getByRole("button", { name: "Keep bid" }).click();
  await expect(dialog).toBeHidden();
  expect(sent).toEqual([]);
  await c.getByRole("button", { name: "Remove Priya Natarajan's $240 bid" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove bid" }).click();
  await expect(page.getByText("Bid removed. The top bid has been updated.")).toBeVisible();
  expect(sent).toEqual([{ action: "remove-bid", bidId: "13" }]);
  const redrawn = cardFor(page, "Lakeside Cabin Weekend");
  await expect(redrawn).toContainText("Top bid $220 · 1 bid");
  await expect(redrawn.getByRole("table")).toBeVisible();
  await expect(redrawn.getByRole("row", { name: /Owen Achterberg/ })).toContainText("Top bid");
  await expect(page.locator("#item-10-title")).toBeFocused();
});

test("Cancel item: the dialog says whose totals change; the card then shows Cancelled", async ({ page }) => {
  await viewAs(page, "1");
  await stubItems(page, [cabin, lemon]);
  let sent: unknown = null;
  await page.route(/\/api\/admin$/, (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, message: "Item cancelled. Its bids and purchases no longer count.", view: "items", answer: itemsAnswer([cabin, { ...lemon, cancelled: true, cancelledAt: "2026-11-03T22:59:00.000Z", purchases: 0 }]) } });
  });
  await page.goto("/admin/items");
  await pageLoaded(page);
  await cardFor(page, "Lemon squares, a dozen").getByRole("button", { name: "Cancel item (Lemon squares, a dozen)" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel Lemon squares, a dozen?" });
  await expect(dialog).toContainText("Its 3 purchases are cancelled and come off those donation totals.");
  await expect(dialog).toContainText("An approved proof for a changed total goes back to review.");
  await dialog.getByRole("button", { name: "Cancel item" }).click();
  await expect(page.getByText("Item cancelled. Its bids and purchases no longer count.")).toBeVisible();
  expect(sent).toEqual({ action: "cancel-item", itemId: "21" });
  const card = cardFor(page, "Lemon squares, a dozen");
  await expect(card).toContainText("Cancelled today at 5:59 PM EST.");
  await expect(card.getByRole("button", { name: /Cancel item/ })).toHaveCount(0);
  await expect(page.locator("#item-21-title")).toBeFocused();
});

test("a refused removal reloads the list and says why", async ({ page }) => {
  await viewAs(page, "1");
  let loads = 0;
  await page.route(/\/api\/admin\?view=items$/, (route) => { loads++; return route.fulfill({ json: itemsAnswer([cabin]) }); });
  await page.route(/\/api\/admin$/, (route) => route.fulfill({ status: 409, json: { ok: false, code: "already-removed", error: "That bid was already removed." } }));
  await page.goto("/admin/items");
  await pageLoaded(page);
  const c = cardFor(page, "Lakeside Cabin Weekend");
  await c.getByRole("button", { name: /bid history/ }).click();
  await c.getByRole("button", { name: "Remove Owen Achterberg's $220 bid" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove bid" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already removed" })).toHaveText("That bid was already removed. The list has been updated.");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(loads).toBe(2);
  await expect(cardFor(page, "Lakeside Cabin Weekend").getByRole("table")).toBeVisible(); // still open after the reload
});

test("after the close: winning bids, and removing the winner says who wins instead", async ({ page }, info) => {
  await viewAs(page, "1");
  await page.route(/\/api\/admin\?view=items$/, (route) => route.fulfill({ json: itemsAnswer([cabin], "ended") }));
  await page.goto("/admin/items");
  await pageLoaded(page);
  const c = cardFor(page, "Lakeside Cabin Weekend");
  await expect(c).toContainText("Winning bid $240 · 2 bids");
  await c.getByRole("button", { name: /bid history/ }).click();
  await expect(c.getByRole("row", { name: /Priya Natarajan/ })).toContainText("Winning bid");
  if (info.project.name === "light-390") {
    const [scroll, client] = await c.locator(".table-wrap").evaluate((e) => [e.scrollWidth, e.clientWidth]);
    expect(scroll, "the bid table fits a phone, Remove included").toBeLessThanOrEqual(client!);
  }
  await c.getByRole("button", { name: "Remove Priya Natarajan's $240 bid" }).click();
  await expect(page.getByRole("dialog")).toContainText("Owen Achterberg becomes the winner at $220. Both donation totals change, and an approved proof for either goes back to review.");
});

test("Purchases: open in place with buyer and date; Cancel purchase only on standing ones", async ({ page }, info) => {
  await viewAs(page, "1");
  await stubItems(page, [cabin, lemon]);
  await page.goto("/admin/items");
  await pageLoaded(page);
  const c = cardFor(page, "Lemon squares, a dozen");
  await c.getByRole("button", { name: /^Show purchases \(4\)/ }).click();
  await expect(c.getByRole("button", { name: /^Hide purchases/ })).toHaveAttribute("aria-expanded", "true");
  const table = c.getByRole("table", { name: "Purchases of Lemon squares, a dozen, newest first" });
  // Below 40rem Price and Bought hide; both are a caption under the name.
  await expect(table.getByRole("columnheader")).toHaveText(info.project.name === "light-390" ? ["Buyer", "Actions"] : ["Buyer", "Price", "Bought", "Actions"]);
  await expect(table.locator("tbody tr")).toHaveCount(4);
  await expect(table.getByRole("button", { name: /^Cancel purchase/ })).toHaveCount(3);
  await expect(table.getByRole("button", { name: "Cancel purchase (Jules Ferreira's purchase, today at 1:00 PM)" })).toBeVisible();
  await expect(table.getByRole("row", { name: /Priya Natarajan/ })).toContainText("Cancelled today at 3:00 PM EST.");
  if (info.project.name === "light-390") {
    const [scroll, client] = await c.locator(".table-wrap").evaluate((e) => [e.scrollWidth, e.clientWidth]);
    expect(scroll, "the purchases table fits a phone, Cancel purchase included").toBeLessThanOrEqual(client!);
  }
  await axe(page);
});

test("Cancel purchase: the dialog says whose total, the proof and the stock; then the list redraws", async ({ page }) => {
  await viewAs(page, "1");
  await stubItems(page, [cabin, lemon]);
  const after = { ...lemon, remaining: 8, purchases: 2, purchaseList: [{ ...lemonBuys[0], cancelledAt: "2026-11-03T22:59:00.000Z" }, ...lemonBuys.slice(1)] };
  const sent: unknown[] = [];
  await page.route(/\/api\/admin$/, (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, message: "Purchase cancelled. The unit is back in stock. 1 approved proof went back to review.", view: "items", answer: itemsAnswer([cabin, after]) } });
  });
  await page.goto("/admin/items");
  await pageLoaded(page);
  const c = cardFor(page, "Lemon squares, a dozen");
  await c.getByRole("button", { name: /^Show purchases/ }).click();
  await c.getByRole("button", { name: /^Cancel purchase \(Dev Kapoor's/ }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel Dev Kapoor's purchase of Lemon squares, a dozen?" });
  await expect(dialog).toContainText("Dev Kapoor's donation total drops by $15");
  await expect(dialog).toContainText("Their approved proof goes back to review");
  await expect(dialog).toContainText("The unit goes back into stock (8 left).");
  await expect(dialog.getByRole("button", { name: "Keep purchase" })).toBeFocused();
  await axe(page);
  await dialog.getByRole("button", { name: "Cancel purchase" }).click();
  await expect(page.getByText("Purchase cancelled. The unit is back in stock. 1 approved proof went back to review.")).toBeVisible();
  expect(sent).toEqual([{ action: "cancel-purchase", purchaseId: "33" }]);
  const redrawn = cardFor(page, "Lemon squares, a dozen");
  await expect(redrawn).toContainText("$15 each · 2 sold · 8 left");
  await expect(redrawn.getByRole("table")).toBeVisible();
  await expect(redrawn.getByRole("button", { name: /^Cancel purchase/ })).toHaveCount(2);
  await expect(page.locator("#item-21-title")).toBeFocused();
});

test("after the close the dialog says the unit doesn't return to stock; a second admin's cancel is refused", async ({ page }) => {
  await viewAs(page, "1");
  let loads = 0;
  await page.route(/\/api\/admin\?view=items$/, (route) => { loads++; return route.fulfill({ json: itemsAnswer([lemon], "ended") }); });
  await page.route(/\/api\/admin$/, (route) => route.fulfill({ status: 409, json: { ok: false, code: "already-cancelled", error: "That purchase was already cancelled." } }));
  await page.goto("/admin/items");
  await pageLoaded(page);
  const c = cardFor(page, "Lemon squares, a dozen");
  await c.getByRole("button", { name: /^Show purchases/ }).click();
  await c.getByRole("button", { name: /^Cancel purchase \(Jules Ferreira's/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Bidding has closed, so the unit doesn't go back into stock.");
  await expect(dialog).not.toContainText("proof");
  await dialog.getByRole("button", { name: "Cancel purchase" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already cancelled" })).toHaveText("That purchase was already cancelled. The list has been updated.");
  expect(loads).toBe(2);
});


// ---------------------------------------------------------------------------------------------
// 6E: Event settings and Email templates (SPEC §7.1, §7.7; DECISIONS entry 116). Stubbed answers.

const settingsValues = {
  name: "Kestrel Gives 2026", timeZone: "America/New_York",
  submissionsOpen: "2026-10-20T22:00", biddingOpens: "2026-11-01T21:00", biddingCloses: "2026-11-05T21:00",
  minStartingBidCents: 1_000, bidIncrementCents: 500, proofDeadlineDays: 7, givingPlatformUrl: "/giving",
};
const settingsAnswer = (values = settingsValues) => ({ ok: true, now: "2026-11-03T20:00:00.000Z", values });

async function stubSettings(page: Page, values = settingsValues): Promise<void> {
  await page.route(/\/api\/admin\?view=settings$/, (route) => route.fulfill({ json: settingsAnswer(values) }));
}

test("Event settings: the form shows the saved values, the phase now and the zone", async ({ page }) => {
  await viewAs(page, "1");
  await stubSettings(page);
  await page.goto("/admin/settings");
  await pageLoaded(page);
  await expect(page).toHaveTitle("Event settings · Admin Dashboard · Kestrel Gives");
  const form = page.getByRole("form", { name: "Event settings" });
  await expect(form).toContainText("Phase now: Bidding is open.");
  await expect(form.getByLabel("Event name")).toHaveValue("Kestrel Gives 2026");
  await expect(form.getByLabel("Time zone")).toHaveValue("America/New_York");
  await expect(form.getByLabel("Bidding closes")).toHaveValue("2026-11-05T21:00");
  await expect(form.getByLabel("Bidding closes")).toHaveAccessibleDescription(/Times are in Eastern Time \(New York\), currently EST\./);
  await expect(form.getByLabel("Default minimum starting bid")).toHaveValue("10");
  await expect(form.getByLabel("Bid increment")).toHaveValue("5");
  await expect(form.getByLabel("Proof deadline")).toHaveValue("7");
  await expect(form.getByLabel(/Giving platform address/)).toHaveValue("/giving");
  await form.getByLabel("Time zone").selectOption("America/Los_Angeles");
  await expect(form.getByLabel("Bidding closes")).toHaveAccessibleDescription(/Times are in Pacific Time \(Los Angeles\), currently PST\./);
  await axe(page);
});

test("Event settings: problems show under their fields with a summary, and nothing is sent", async ({ page }) => {
  await viewAs(page, "1");
  await stubSettings(page);
  const sent: unknown[] = [];
  await page.route(/\/api\/admin$/, (route) => { sent.push(route.request().postDataJSON()); return route.fulfill({ status: 500, json: {} }); });
  await page.goto("/admin/settings");
  await pageLoaded(page);
  const form = page.getByRole("form", { name: "Event settings" });
  await form.getByLabel("Event name").fill("");
  await form.getByLabel("Bid increment").fill("2.50");
  await form.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator(".error-summary")).toBeFocused();
  await expect(form.getByLabel("Event name")).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByLabel("Bid increment")).toHaveAttribute("aria-invalid", "true");
  await form.getByLabel("Event name").fill("Kestrel Gives 2026");
  await form.getByLabel("Bid increment").fill("5");
  await form.getByLabel("Bidding opens").fill("");
  await form.getByLabel(/Giving platform address/).fill("http://example.test");
  await form.getByRole("button", { name: "Save settings" }).click();
  await expect(form).toContainText("Set all three dates, or leave all three empty.");
  await expect(form).toContainText("Enter an address that starts with https://");
  await axe(page);
  expect(sent).toEqual([]);
});

test("Event settings: a save that keeps the phase posts at once; the toast says so and focus stays on Save", async ({ page }) => {
  await viewAs(page, "1");
  await stubSettings(page);
  const sent: unknown[] = [];
  const saved = { ...settingsValues, name: "Kestrel Gives 2026 Fall", bidIncrementCents: 1_000 };
  await page.route(/\/api\/admin$/, (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, message: "Event settings saved.", view: "settings", answer: settingsAnswer(saved) } });
  });
  await page.goto("/admin/settings");
  await pageLoaded(page);
  const form = page.getByRole("form", { name: "Event settings" });
  await form.getByLabel("Event name").fill("Kestrel Gives 2026 Fall");
  await form.getByLabel("Bid increment").fill("10");
  await form.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Event settings saved.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(sent).toEqual([{ action: "save-settings", settings: { ...settingsValues, name: "Kestrel Gives 2026 Fall", bidIncrementCents: 1_000 } }]);
  await expect(page.getByRole("button", { name: "Save settings" })).toBeFocused();
});

test("Event settings: a close time already past asks first (danger), and Keep editing sends nothing", async ({ page }) => {
  await viewAs(page, "1");
  await stubSettings(page);
  const sent: unknown[] = [];
  await page.route(/\/api\/admin$/, (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, message: "Event settings saved.", view: "settings", answer: settingsAnswer({ ...settingsValues, biddingCloses: "2026-11-02T21:00" }) } });
  });
  await page.goto("/admin/settings");
  await pageLoaded(page);
  const form = page.getByRole("form", { name: "Event settings" });
  await form.getByLabel("Bidding closes").fill("2026-11-02T21:00");
  await form.getByRole("button", { name: "Save settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Save and end bidding now?" });
  await expect(dialog).toContainText('This moves the event from "Bidding is open" to "Bidding has ended" as soon as you save.');
  await expect(dialog).toContainText("winners are chosen");
  await axe(page);
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  expect(sent).toEqual([]);
  await form.getByRole("button", { name: "Save settings" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save and end bidding" }).click();
  await expect(page.getByText("Event settings saved.")).toBeVisible();
  expect(sent).toHaveLength(1);
  expect((sent[0] as { settings: { biddingCloses: string } }).settings.biddingCloses).toBe("2026-11-02T21:00");
});

test("Event settings: the server's problems show under their fields", async ({ page }) => {
  await viewAs(page, "1");
  await stubSettings(page);
  await page.route(/\/api\/admin$/, (route) => route.fulfill({ status: 422, json: { ok: false, code: "invalid", error: "Check the highlighted fields.", problems: [{ field: "name", message: "Keep the name to 80 characters." }] } }));
  await page.goto("/admin/settings");
  await pageLoaded(page);
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator(".error-summary")).toBeFocused();
  await expect(page.getByLabel("Event name")).toHaveAccessibleDescription(/Keep the name to 80 characters\./);
});

const templateOf = (key: string, label: string, subject: string, body: string, variables: string[], isDefault = true) =>
  ({ key, label, subject, body, variables, isDefault, updatedAt: "2026-11-01T12:00:00.000Z" });
const outbid = templateOf("outbid", "Outbid", "You've been outbid on {{item_name}}", "Hi {{first_name}},\n\nSomeone bid {{amount}} on {{item_name}}.", ["first_name", "item_name", "amount"]);
const winner = templateOf("winner", "Winner", "You won {{item_name}}", "Hi {{first_name}}, you won.", ["first_name", "item_name", "amount", "proof_deadline"], false);
const templatesAnswer = (list = [outbid, winner]) => ({ ok: true, templates: list });

async function stubTemplates(page: Page, list = [outbid, winner]): Promise<void> {
  await page.route(/\/api\/admin\?view=templates$/, (route) => route.fulfill({ json: templatesAnswer(list) }));
}

test("Email templates: a card each, Default or Edited; Restore default only on edited ones", async ({ page }) => {
  await viewAs(page, "1");
  await stubTemplates(page);
  await page.goto("/admin/templates");
  await pageLoaded(page);
  await expect(page.locator(".admin-glance").first()).toHaveText("2 templates, 1 edited. This demo never sends email; the preview shows sample data in place of each variable.");
  const outbidCard = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Outbid" }) });
  await expect(outbidCard).toContainText("Default");
  await expect(outbidCard).toContainText("When someone's bid is beaten.");
  await expect(outbidCard).toContainText("Subject: You've been outbid on {{item_name}}");
  await expect(outbidCard.getByRole("button", { name: /Restore default/ })).toHaveCount(0);
  const winnerCard = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Winner" }) });
  await expect(winnerCard).toContainText("Edited");
  await expect(winnerCard.getByRole("button", { name: "Restore default (Winner)" })).toBeVisible();
  await axe(page);
});

test("Template editor: live preview, variable errors as you type block saving, Insert variable at the cursor", async ({ page }) => {
  await viewAs(page, "1");
  await stubTemplates(page);
  const sent: unknown[] = [];
  await page.route(/\/api\/admin$/, (route) => {
    const body = route.request().postDataJSON() as { subject: string; body: string };
    sent.push(body);
    return route.fulfill({ json: { ok: true, message: "Template saved.", view: "templates", answer: templatesAnswer([{ ...outbid, subject: body.subject, body: body.body, isDefault: false }, winner]) } });
  });
  await page.goto("/admin/templates");
  await pageLoaded(page);
  await page.getByRole("button", { name: "Edit template (Outbid)" }).click();
  const editor = page.getByRole("form", { name: "Edit the Outbid template" });
  const subject = editor.getByLabel("Subject");
  await expect(subject).toBeFocused();
  const preview = editor.getByRole("region", { name: "Preview with sample data" });
  await expect(preview).toContainText("You've been outbid on Lakeside Cabin Weekend");
  await expect(preview).toContainText("Someone bid $245 on Lakeside Cabin Weekend.");

  await subject.fill("Outbid on {{item_nme}}");
  await expect(subject).toHaveAccessibleDescription("{{item_nme}} isn't a variable. Did you mean {{item_name}}?");
  await expect(preview).toContainText("Outbid on {{item_nme}}");
  await subject.fill("{{rejection_reason}}");
  await expect(subject).toHaveAccessibleDescription("{{rejection_reason}} can't be used in this template.");
  await editor.getByRole("button", { name: "Save template" }).click();
  await expect(page.locator(".error-summary")).toBeFocused();
  expect(sent).toEqual([]);
  await axe(page);

  // Insert variable: only this template's variables; goes in at the cursor and focus returns there.
  await subject.fill("Outbid on ");
  await subject.press("End");
  await editor.getByRole("button", { name: "Insert variable" }).click();
  const options = editor.locator(".admin-template__variables button");
  await expect(options).toHaveText(["{{first_name}} first name", "{{item_name}} item name", "{{amount}} the bid or price"]);
  await expect(options.first()).toBeFocused();
  await editor.getByRole("button", { name: /\{\{item_name\}\}/ }).click();
  await expect(subject).toHaveValue("Outbid on {{item_name}}");
  await expect(subject).toBeFocused();
  await expect(subject).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(editor.locator(".admin-template__variables")).toBeHidden();

  await editor.getByRole("button", { name: "Save template" }).click();
  await expect(page.getByText("Template saved.")).toBeVisible();
  expect(sent).toEqual([{ action: "save-template", key: "outbid", subject: "Outbid on {{item_name}}", body: outbid.body }]);
  await expect(page.locator("#template-outbid-title")).toBeFocused();
  await expect(page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Outbid" }) })).toContainText("Edited");
});

test("Template editor: Escape closes the variable menu; Discard changes puts focus back on Edit", async ({ page }) => {
  await viewAs(page, "1");
  await stubTemplates(page);
  await page.goto("/admin/templates");
  await pageLoaded(page);
  await page.getByRole("button", { name: "Edit template (Outbid)" }).click();
  const editor = page.getByRole("form", { name: "Edit the Outbid template" });
  await editor.getByLabel("Body").fill("Changed");
  const toggle = editor.getByRole("button", { name: "Insert variable" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
  await editor.getByRole("button", { name: "Discard changes (Outbid)" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit template (Outbid)" })).toBeFocused();
});

test("Restore default asks first, then posts and redraws", async ({ page }) => {
  await viewAs(page, "1");
  await stubTemplates(page);
  const sent: unknown[] = [];
  await page.route(/\/api\/admin$/, (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, message: "Template restored to its default.", view: "templates", answer: templatesAnswer([outbid, { ...winner, isDefault: true }]) } });
  });
  await page.goto("/admin/templates");
  await pageLoaded(page);
  await page.getByRole("button", { name: "Restore default (Winner)" }).click();
  const dialog = page.getByRole("dialog", { name: "Restore the default Winner template?" });
  await expect(dialog).toContainText("This can't be undone.");
  await dialog.getByRole("button", { name: "Keep my version" }).click();
  expect(sent).toEqual([]);
  await page.getByRole("button", { name: "Restore default (Winner)" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Restore default" }).click();
  await expect(page.getByText("Template restored to its default.")).toBeVisible();
  expect(sent).toEqual([{ action: "restore-template", key: "winner" }]);
  await expect(page.locator("#template-winner-title")).toBeFocused();
  await expect(page.getByRole("button", { name: /Restore default/ })).toHaveCount(0);
});


// ---------------------------------------------------------------------------------------------
// 6E review and 6F: zone names and the zone change line; Reset for next year and the offer to
// restore after it (SPEC §7.8; DECISIONS entries 109, 116, 117 and 118). Stubbed answers; nothing writes.

test("Event settings: zones by friendly name (IANA id stored); a changed zone says what the close becomes", async ({ page }) => {
  await viewAs(page, "1");
  await stubSettings(page);
  await page.goto("/admin/settings");
  await pageLoaded(page);
  const form = page.getByRole("form", { name: "Event settings" });
  const zone = form.getByLabel("Time zone");
  await expect(zone.locator("option:checked")).toHaveText("Eastern Time (New York)");
  await expect(zone.locator('option[value="America/Los_Angeles"]')).toHaveText("Pacific Time (Los Angeles)");
  const effect = page.locator("[data-settings-effect]");
  await expect(effect).toBeHidden();
  await zone.selectOption("America/Los_Angeles");
  await expect(effect).toHaveText("Bidding now closes at 9:00 PM PST (Nov 6 at midnight Eastern).");
  await expect(form.getByLabel("Bidding closes")).toHaveAccessibleDescription(/Bidding now closes at 9:00 PM PST/);
  await form.getByLabel("Bidding closes").fill("2026-11-05T18:00");
  await expect(effect).toHaveText("Bidding now closes at 6:00 PM PST (9:00 PM Eastern).");
  await form.getByLabel("Submissions open").fill("");
  await expect(effect).toBeHidden();
  await form.getByLabel("Submissions open").fill("2026-10-20T22:00");
  await zone.selectOption("America/New_York");
  await expect(effect).toBeHidden();
  await axe(page);
});

const resetCounts = { items: 16, photos: 40, bids: 42, purchases: 9, proofs: 4 };
function resetSummary(over: { unlocked?: boolean; unlocksAt?: string | null; demoReset?: boolean; name?: string; empty?: boolean } = {}) {
  const base = summary("ended");
  const name = over.name ?? "Kestrel Gives 2026";
  return {
    ...base,
    event: { ...base.event, name, phase: over.demoReset ? "unscheduled" : "ended" },
    activeItems: over.empty ? 0 : 15,
    reset: {
      unlocksAt: over.unlocksAt === undefined ? "2026-12-06T02:00:00.000Z" : over.unlocksAt, unlocked: over.unlocked ?? false,
      nextName: name.replace(/\d{4}/, (y) => String(Number(y) + 1)), counts: over.empty ? { items: 0, photos: 0, bids: 0, purchases: 0, proofs: 0 } : resetCounts,
    },
    demoReset: over.demoReset ?? false,
  };
}

test("Reset for next year, locked: when it unlocks, what goes and what stays, and no button", async ({ page }) => {
  await viewAs(page, "1");
  await page.route(/\/api\/admin\?view=summary$/, (route) => route.fulfill({ json: resetSummary() }));
  await page.goto("/admin/reset");
  await pageLoaded(page);
  await expect(page).toHaveTitle("Reset for next year · Admin Dashboard · Kestrel Gives");
  await expect(page.getByRole("navigation", { name: "Admin sections" }).getByRole("link", { name: "Reset for next year" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".admin-reset .pill")).toHaveText("Locked");
  await expect(page.locator("[data-reset-status]")).toHaveText("Reset for next year unlocks on Saturday, December 5 at 9:00 PM EST, 30 days after bidding closes.");
  const deletes = page.getByRole("region", { name: "Reset deletes" });
  await expect(deletes.getByRole("listitem")).toHaveText(["16 items with their 40 photos", "42 bids", "9 purchases", "4 proofs"]);
  await expect(page.getByRole("region", { name: "Reset keeps" })).toContainText("Event settings, copied to Kestrel Gives 2027 with the dates cleared");
  await expect(page.getByRole("button", { name: "Reset for next year" })).toHaveCount(0);
  await expect(page.locator("[data-reset-offer]")).toHaveCount(0);
  await axe(page);
});

test("Reset for next year, ready: the name must be typed; then the section shows the offer to restore, with focus on it", async ({ page }) => {
  await viewAs(page, "1");
  let done = false;
  await page.route(/\/api\/admin\?view=summary$/, (route) => route.fulfill({ json: done ? resetSummary({ demoReset: true, empty: true, name: "Kestrel Gives 2027", unlocksAt: null }) : resetSummary({ unlocked: true, unlocksAt: "2026-10-01T02:00:00.000Z" }) }));
  const sent: unknown[] = [];
  await page.route(/\/api\/admin$/, (route) => {
    sent.push(route.request().postDataJSON());
    done = true;
    return route.fulfill({ json: { ok: true, message: "Reset done. Kestrel Gives 2027 is ready for its dates.", view: "summary", answer: resetSummary({ demoReset: true, empty: true, name: "Kestrel Gives 2027", unlocksAt: null }) } });
  });
  await page.goto("/admin/reset");
  await pageLoaded(page);
  await expect(page.locator(".admin-reset .pill")).toHaveText("Ready");
  await page.getByRole("button", { name: "Reset for next year" }).click();
  const dialog = page.getByRole("dialog", { name: "Reset for next year?" });
  await expect(dialog).toContainText("This deletes 16 items with their 40 photos, 42 bids, 9 purchases and 4 proofs from Kestrel Gives 2026.");
  await expect(dialog).toContainText("The demo is shared, so this empties it for everyone");
  const confirm = dialog.getByRole("button", { name: "Reset for next year" });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await dialog.getByLabel("Type Kestrel Gives 2026 to confirm").fill("Kestrel Gives");
  await dialog.getByLabel("Type Kestrel Gives 2026 to confirm").press("Enter"); // a wrong name: Enter does nothing
  await expect(dialog).toBeVisible();
  expect(sent).toEqual([]);
  await dialog.getByLabel("Type Kestrel Gives 2026 to confirm").fill("Kestrel Gives 2026");
  await expect(confirm).not.toHaveAttribute("aria-disabled", /.*/);
  await axe(page);
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  expect(sent).toEqual([{ action: "reset-year", confirmName: "Kestrel Gives 2026" }]);
  await expect(page.getByText("Reset done. Kestrel Gives 2027 is ready for its dates.")).toBeVisible();
  const offer = page.getByRole("region", { name: "The demo was reset for next year" });
  await expect(offer).toContainText("Kestrel Gives 2027 has no items or dates yet");
  await expect(offer).toContainText("set its dates in Event settings and add items");
  await expect(offer.getByRole("heading", { level: 3 })).toBeFocused();
  await expect(page.locator("[data-reset-status]")).toContainText("no close date yet");
  await expect(page.getByRole("region", { name: "Reset deletes" })).toContainText("Nothing yet");
  await axe(page);
});

test("Reset refused: a wrong name stays in the dialog; locked meanwhile closes it and reloads with why", async ({ page }) => {
  await viewAs(page, "1");
  await page.route(/\/api\/admin\?view=summary$/, (route) => route.fulfill({ json: resetSummary({ unlocked: true, unlocksAt: "2026-10-01T02:00:00.000Z" }) }));
  let answers = [
    { status: 422, json: { ok: false, code: "wrong-name", error: "Type the event's name, Kestrel Gives 2026, to confirm." } },
    { status: 409, json: { ok: false, code: "locked", error: "Reset for next year unlocks 30 days after bidding closes." } },
  ];
  await page.route(/\/api\/admin$/, (route) => route.fulfill(answers.shift()!));
  await page.goto("/admin/reset");
  await pageLoaded(page);
  await page.getByRole("button", { name: "Reset for next year" }).click();
  const dialog = page.getByRole("dialog", { name: "Reset for next year?" });
  await dialog.getByLabel("Type Kestrel Gives 2026 to confirm").fill("Kestrel Gives 2026");
  await dialog.getByRole("button", { name: "Reset for next year" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Type the event's name, Kestrel Gives 2026, to confirm.");
  await dialog.getByRole("button", { name: "Reset for next year" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "unlocks" })).toHaveText("Reset for next year unlocks 30 days after bidding closes. The section has been reloaded.");
  answers = [];
});

test("after a Reset, Totals offers Restore demo data: the demo bar's own dialog, then focus on the section title", async ({ page }) => {
  await viewAs(page, "1");
  let restored = false;
  await page.route(/\/api\/admin\?view=summary$/, (route) => route.fulfill({ json: restored ? summary("ended") : resetSummary({ demoReset: true, empty: true, name: "Kestrel Gives 2027", unlocksAt: null }) }));
  const demo: unknown[] = [];
  await page.route(/\/api\/demo$/, async (route) => {
    demo.push(route.request().postDataJSON());
    restored = true;
    const app = await (await route.fetch({ url: "http://localhost:3000/api/app", method: "GET" })).json();
    return route.fulfill({ json: app });
  });
  await page.goto("/admin");
  await pageLoaded(page);
  const offer = page.getByRole("region", { name: "The demo was reset for next year" });
  await expect(offer).toBeVisible();
  await axe(page);
  await offer.getByRole("button", { name: "Restore demo data" }).click();
  const dialog = page.getByRole("dialog", { name: "Restore demo data?" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(demo).toEqual([]);
  await expect(offer.getByRole("button", { name: "Restore demo data" })).toBeFocused();
  await offer.getByRole("button", { name: "Restore demo data" }).click();
  await dialog.getByRole("button", { name: "Restore demo data" }).click();
  await expect(page.getByText("Demo data restored.")).toBeVisible();
  expect(demo).toEqual([{ action: "restore" }]);
  await expect(page.locator("[data-reset-offer]")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "Totals" })).toBeFocused();
});
