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
