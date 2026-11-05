// Jump to "Submissions open" clears bids, purchases and proofs (owner, 7A review; DECISIONS
// #124), through the demo bar as a visitor would; and the tour's Set me up for real (DECISIONS #128). It empties the shared dev data, so it runs in
// `npm run check:visual`, one test at a time, never beside the parallel specs; Restore runs after.
import { expect, test, type APIRequestContext } from "@playwright/test";

test.describe.configure({ mode: "serial" });
const RUNS_HERE = "light-1280";
test.beforeEach(({}, info) => test.skip(info.project.name !== RUNS_HERE, "behavior is the same in every project"));

/** Restore, waiting out the shared 10-second cooldown if needed. */
async function restore(request: APIRequestContext): Promise<void> {
  for (let tries = 0; tries < 5; tries++) {
    const r = await request.post("/api/demo", { data: { action: "restore" } });
    if (r.ok()) return;
    if (r.status() !== 429) throw new Error(`Restore answered ${r.status()}`);
    await new Promise((done) => setTimeout(done, (Number(r.headers()["retry-after"] ?? "10") + 1) * 1000));
  }
  throw new Error("Restore stayed in its cooldown");
}

test.afterAll(async ({ request }, info) => {
  if (info.project.name === RUNS_HERE) await restore(request);
});

test("the tour's Set me up, for real: Win and donate moves the shared demo to Bidding ended and finds Jules's wins", async ({ page, request, baseURL }) => {
  test.setTimeout(60_000);
  await restore(request);
  await page.context().addCookies([{ name: "kg_viewer", value: "1", url: baseURL! }]);
  await page.goto("/guide");
  const card = page.getByRole("region", { name: "3. Win and donate" });
  await expect(card.locator("[data-guide-effect]")).toHaveText("Just you: viewing as Jules. Everyone: moves the demo to Bidding ended.");
  await card.getByRole("button", { name: "Set me up for Win and donate" }).click();
  const status = card.getByRole("status");
  await expect(status).toContainText("Viewing as Jules Ferreira, Bidding ended.");
  await expect(status).toContainText("Jules won");
  await expect(page.locator('[data-demo-bar="page"] .demo-bar__who')).toHaveText("Viewing as Jules Ferreira (employee)");
  await expect(page.locator("[data-shell-banner] .banner")).toContainText("Winners, please donate and upload proof by");
  await status.getByRole("link", { name: "Go to Your Items" }).click();
  await expect(page.getByText("You won").first()).toBeVisible();
});

test("Submissions open: the dialog says what goes, then bids, purchases and proofs are gone and items stay", async ({ page, request }) => {
  test.setTimeout(90_000);
  await restore(request);
  await page.goto("/items/1");
  await expect(page.getByText("Bid history")).toBeVisible();
  await expect(page.locator(".table__empty")).toHaveCount(0); // the seed's six bids

  const bar = page.locator('[data-demo-bar="page"]');
  await bar.getByRole("button", { name: "Submissions open", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Open submissions and clear activity?" });
  const confirm = dialog.getByRole("button", { name: "Clear and open submissions" });
  // Restore again right before confirming, so the shared cooldown answers first however long the
  // page took to load (a cold dev server can take longer than the 10 seconds); the dialog says
  // why and stays open.
  await restore(request);
  await confirm.click();
  await expect(dialog.locator(".dialog__error")).toContainText("The demo data just changed.");
  await page.waitForTimeout(10_500);
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".toast-region")).toContainText("Bids, purchases and proofs cleared. Submissions are open.");
  await expect(bar.getByRole("button", { name: "Submissions open", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(bar.locator(".demo-bar__status")).toHaveText("Event moved to: Submissions open");
  await expect(page.locator("[data-shell-banner] .banner")).toContainText("Submissions are open");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Submit an Item" })).toBeVisible();

  // The item is still there, with no bids; Jules owes nothing; the sold-out item has stock again.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Lakeside Cabin Weekend" })).toBeVisible();
  await expect(page.locator(".table__empty")).toHaveText("No bids yet.");
  const me = (await (await request.get("/api/me")).json()) as { proof: { totalCents: number } | null };
  expect(me.proof?.totalCents ?? 0).toBe(0);
  const items = (await (await request.get("/api/items?type=instant")).json()) as { items: { id: string | number; remaining: number }[] };
  expect(items.items.find((i) => String(i.id) === "13")?.remaining).toBeGreaterThan(0); // sold out in the seed; stock is full again
});
