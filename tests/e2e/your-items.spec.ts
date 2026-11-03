// Your Items (SPEC §8, §7.6; DECISIONS #101; Stage 5C). Other specs jump phases on dev
// meanwhile, so these never write: the browser sees the phase each test needs, and states the
// seed doesn't have (a changed total, nothing at all, a failed load) come from a stubbed
// /api/me. tests/db/employee-flows.test.ts covers the real answer.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(({}, info) => test.skip(info.project.name !== "light-1280" && info.project.name !== "light-390", "content is the same in every project; 390 checks the phone"));
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });

const WCAG_22_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
type Json = Record<string, any>;

async function as(page: Page, viewerId: string, phase: "submission" | "live" | "ended"): Promise<void> {
  await page.context().addCookies([{ name: "kg_viewer", value: viewerId, url: "http://localhost:3000" }]);
  await page.route(/\/api\/app(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.event) body.event.phase = phase;
    await route.fulfill({ response, json: body });
  });
}

/** Rewrites the real /api/me answer (or replaces it) before the page sees it. */
async function me(page: Page, edit: (answer: Json) => Json | void): Promise<void> {
  await page.route(/\/api\/me$/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: edit(body) ?? body });
  });
}

const loaded = (page: Page) => page.locator("[data-your-items]:not([aria-busy])");
const section = (page: Page, name: string) => page.getByRole("region", { name });

test("Jules during live: four sections from the real answer, the proof summary, and Edit on donated items", async ({ page }) => {
  await as(page, "3", "live");
  const answer = page.waitForResponse(/\/api\/me$/);
  await page.goto("/your-items");
  const real = (await (await answer).json()) as Json;
  await expect(loaded(page)).toBeVisible();

  const headings = page.locator("[data-your-items] h2");
  await expect(headings).toHaveText(["My bids", "Won & purchased", "My donated items", "Cancelled"]);
  await expect(section(page, "My bids").locator(".item-tile")).toHaveCount(real.bids.length);
  await expect(section(page, "My bids").getByRole("link", { name: /\s*, Outbid$/ }).first()).toBeVisible();
  await expect(section(page, "Won & purchased").locator(".item-tile")).toHaveCount(real.wins.length);

  const summary = page.getByRole("group", { name: "Your donation total" });
  await expect(summary).toContainText(`$${real.proof.totalCents / 100}`);
  await expect(summary).toContainText("Proof due");
  await expect(summary.getByRole("link", { name: "Donate and upload proof" })).toHaveAttribute("href", "/your-items/proof");
  await expect(summary.getByRole("link", { name: "Go to the giving page" })).toHaveAttribute("href", "/giving");

  const first = real.donated[0];
  await expect(section(page, "My donated items").getByRole("link", { name: `Edit ${first.title}` })).toHaveAttribute("href", `/items/${first.itemId}/edit`);
  await expect(page.locator('.site-header a[href="/your-items"]')).toHaveAttribute("aria-current", "page"); // behind Menu at 390

  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(results.violations).toEqual([]);
});

test("after the close, bids say won or ended, and lost ones fade", async ({ page }) => {
  await as(page, "3", "ended");
  await me(page, (a) => {
    a.phase = "ended";
    a.bids = [
      { itemId: "2", title: "Guitar lessons, four weeks", coverUrl: "", myTopCents: 8_500, highBidCents: 8_500, standing: "won" },
      { itemId: "1", title: "Lakeside Cabin Weekend", coverUrl: "", myTopCents: 20_000, highBidCents: 24_000, standing: "lost" },
    ];
  });
  await page.goto("/your-items");
  const bids = section(page, "My bids");
  await expect(bids.getByRole("link", { name: /^Guitar lessons, four weeks\s*, You won$/ })).toBeVisible();
  await expect(bids.locator(".item-tile").nth(1)).toHaveClass(/item-tile--muted/);
  await expect(bids.locator(".item-tile").nth(1)).toContainText("Your bid · Won at $240");
});

test("a changed total shows the banner; nothing cancelled means no Cancelled section", async ({ page }) => {
  await as(page, "3", "ended");
  await me(page, (a) => {
    a.cancelled = [];
    a.proof = { ...a.proof, totalCents: 9_000, totalChanged: true, blocked: null,
      latest: { status: "pending", amountCents: 12_500, owedCents: 12_500, rejectionReason: null, createdAt: a.now, imageUrl: "/seed/proofs/placeholder-proof.png" } };
  });
  await page.goto("/your-items");
  const banner = page.locator("[data-your-items] .banner--warning");
  await expect(banner).toContainText("Your donation total changed");
  await expect(banner).toContainText("It was $125 when you uploaded proof and is now $90. Please check that your proof still covers it.");
  await expect(page.getByRole("group", { name: "Your donation total" })).toContainText("Pending review");
  await expect(page.getByRole("heading", { name: "Cancelled" })).toHaveCount(0);
});

test("a rejected proof shows its reason and offers a new upload", async ({ page }) => {
  await as(page, "7", "ended");
  await me(page, (a) => {
    a.proof = { ...a.proof, totalCents: 3_500, totalChanged: false, blocked: null,
      latest: { status: "rejected", amountCents: 3_500, owedCents: 3_500, rejectionReason: "The screenshot doesn't show the amount.", createdAt: a.now, imageUrl: "/seed/proofs/placeholder-proof.png" } };
  });
  await page.goto("/your-items");
  const summary = page.getByRole("group", { name: "Your donation total" });
  await expect(summary).toContainText("Rejected");
  await expect(summary).toContainText("Reason: The screenshot doesn't show the amount.");
  await expect(summary.getByRole("link", { name: "Upload a new proof" })).toBeVisible();
  await expect(summary.getByRole("link", { name: "Go to the giving page" })).toHaveCount(0);
});

test("someone with nothing yet sees each list's empty message and no upload link", async ({ page }) => {
  await as(page, "3", "submission");
  await me(page, (a) => {
    a.bids = []; a.wins = []; a.donated = []; a.cancelled = [];
    a.proof = { totalCents: 0, latest: null, deadline: null, totalChanged: false, blocked: { code: "nothing-owed", message: "…" } };
  });
  await page.goto("/your-items");
  await expect(section(page, "My bids")).toContainText("You haven't bid on anything yet.");
  await expect(section(page, "Won & purchased")).toContainText("Nothing won or bought yet.");
  await expect(section(page, "My donated items")).toContainText("You haven't donated an item yet.");
  const summary = page.getByRole("group", { name: "Your donation total" });
  await expect(summary).toContainText("$0");
  await expect(summary.getByRole("link")).toHaveCount(0);
  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(results.violations).toEqual([]);
});

test("a failed load says so and Try again recovers", async ({ page }) => {
  await as(page, "3", "live");
  let fail = true;
  await page.route(/\/api\/me$/, (route) => (fail ? route.fulfill({ status: 500, json: { ok: false, error: "Something went wrong." } }) : route.fallback()));
  await page.goto("/your-items");
  const failed = page.locator("[data-your-items-error]");
  await expect(failed).toBeVisible();
  await expect(failed).toContainText("We couldn't load your items");
  fail = false;
  await failed.getByRole("button", { name: "Try again" }).click();
  await expect(failed).toBeHidden();
  await expect(page.locator("[data-your-items] h2").first()).toHaveText("My bids");
});
