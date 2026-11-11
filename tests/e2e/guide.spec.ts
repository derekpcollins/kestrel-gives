// The guide, Things to try (owner, guide plan; SPEC v1.21, v1.25; DECISIONS entries 127 and 128). Set me up
// runs against a mocked demo: these specs run beside others on the shared dev data, so the app
// state, the demo actions and the reads behind each check are answered here, and nothing on
// dev changes. The real setup runs in demo-jump.spec.ts, one test at a time.
import { expect, test, type Page, type Route } from "@playwright/test";

const RUNS_HERE = "light-1280";
test.beforeEach(({}, info) => test.skip(info.project.name !== RUNS_HERE, "behavior is the same in every project"));

type Phase = "live" | "ended" | "submission";
interface Fake { viewer: string; phase: Phase; sent: string[]; demoStatus?: number }

const PEOPLE = [
  { id: "1", firstName: "Maya", lastName: "Okafor", role: "admin" },
  { id: "3", firstName: "Jules", lastName: "Ferreira", role: "employee" },
  { id: "7", firstName: "Owen", lastName: "Achterberg", role: "employee" },
];
const HOUR = 3_600_000;

/** An app state in the given phase, with dates that agree with it. */
function appState(f: Fake): object {
  const now = Date.now();
  const at = (h: number) => new Date(now + h * HOUR).toISOString();
  const dates = f.phase === "live"
    ? { submissionsOpenAt: at(-200), biddingOpensAt: at(-48), biddingClosesAt: at(48), proofDeadline: at(216) }
    : f.phase === "ended"
      ? { submissionsOpenAt: at(-200), biddingOpensAt: at(-96), biddingClosesAt: at(-1), proofDeadline: at(167) }
      : { submissionsOpenAt: at(-1), biddingOpensAt: at(96), biddingClosesAt: at(192), proofDeadline: at(360) };
  return {
    ok: true, now: new Date(now).toISOString(), people: PEOPLE, viewer: PEOPLE.find((p) => p.id === f.viewer), charities: [], demoReset: false,
    event: { id: "1", name: "Kestrel Gives 2026", timeZone: "America/New_York", phase: f.phase, endingSoon: false, winnersFinalized: false, givingPlatformUrl: "/giving", minStartingBidCents: 1000, ...dates },
  };
}

const json = (route: Route, body: object, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const tile = (id: string, title: string, remaining: number | null) => ({ id, type: remaining === null ? "auction" : "instant", title, coverUrl: "", startingBidCents: 1000, topBidCents: null, bidCount: 0, priceCents: 2000, remaining, viewerIsTopBidder: false, viewerHasBid: false });

async function mockDemo(page: Page, f: Fake, reads: { instantLeft?: number } = {}): Promise<void> {
  await page.route("**/api/app", (route) => json(route, appState(f)));
  await page.route("**/api/demo", async (route) => {
    const body = route.request().postData() ?? "";
    f.sent.push(body);
    if (f.demoStatus) return json(route, { error: "The demo data just changed. Try again in 7 seconds." }, f.demoStatus);
    const payload = JSON.parse(body) as { action: string; userId?: string; to?: Phase };
    if (payload.action === "view-as" && payload.userId) f.viewer = payload.userId;
    if (payload.action === "jump" && payload.to) f.phase = payload.to;
    return json(route, appState(f));
  });
  await page.route("**/api/items?type=auction", (route) => json(route, { ok: true, items: [tile("4", "Weekend dog-sitting", null), tile("77", "Lakeside Cabin Weekend", null)] }));
  await page.route("**/api/items?type=instant", (route) => json(route, { ok: true, items: [tile("88", "Homemade hot sauce trio", reads.instantLeft ?? 2)] }));
  await page.route("**/api/me", (route) => json(route, {
    ok: true, wins: [{ kind: "won", itemId: "2", title: "Guitar lessons, four weeks", coverUrl: "", amountCents: 8500, at: "" }],
    proof: { totalCents: 8500, latest: null, deadline: null, totalChanged: false, blocked: null },
  }));
}

const scenario = (page: Page, name: string) => page.getByRole("region", { name });
const setUp = (page: Page, name: string) => scenario(page, name).getByRole("button", { name: `Set me up for ${name.replace(/^\d\. /, "")}` });

test("Set me up as just you: only the viewer changes, then Ready links to the item by its current id", async ({ page }) => {
  const f: Fake = { viewer: "1", phase: "live", sent: [] };
  await mockDemo(page, f);
  await page.goto("/guide");
  const card = scenario(page, "1. Get outbid");
  await expect(card.locator("[data-guide-effect]")).toHaveText("Just you: viewing as Jules.");
  await setUp(page, "1. Get outbid").click();
  const status = card.getByRole("status");
  await expect(status).toContainText("Ready");
  await expect(status).toContainText("Viewing as Jules Ferreira, Bidding live.");
  await expect(status.getByRole("link", { name: "Go to Lakeside Cabin Weekend" })).toHaveAttribute("href", "/items/77");
  expect(f.sent.map((s) => JSON.parse(s))).toEqual([{ action: "view-as", userId: "3" }]);
});

test("Set me up that moves the phase says so for everyone first, then jumps, then checks", async ({ page }) => {
  const f: Fake = { viewer: "3", phase: "live", sent: [] };
  await mockDemo(page, f);
  await page.goto("/guide");
  const card = scenario(page, "3. Win and donate");
  await expect(card.locator("[data-guide-effect]")).toHaveText("Just you: viewing as Jules. Everyone: moves the demo to Bidding ended.");
  await setUp(page, "3. Win and donate").click();
  await expect(card.getByRole("status")).toContainText("Jules won “Guitar lessons, four weeks”.");
  expect(f.sent.map((s) => JSON.parse(s))).toEqual([{ action: "jump", to: "ended" }]);
  // The shell redrew from the new state, so the next scenario in that phase moves nothing.
  await expect(scenario(page, "4. Review as admin").locator("[data-guide-effect]")).toHaveText("Just you: viewing as Maya.");
  // The Guide shows no phase banner (v1.25); the demo bar's pressed phase says where the event is.
  await expect(page.locator('[data-demo-bar="page"] .demo-bar__jump-buttons .btn[aria-pressed="true"]')).toHaveText("Bidding ended");
  await expect(page.locator("[data-shell-banner] .banner")).toHaveCount(0);
});

test("Submit an item asks before clearing, and Cancel sends nothing", async ({ page }) => {
  const f: Fake = { viewer: "3", phase: "live", sent: [] };
  await mockDemo(page, f);
  await page.goto("/guide");
  await setUp(page, "6. Submit an item").click();
  const dialog = page.getByRole("dialog", { name: "Open submissions and clear activity?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(setUp(page, "6. Submit an item")).toBeFocused();
  expect(f.sent).toEqual([]);
  await expect(scenario(page, "6. Submit an item").locator("[data-guide-status]")).toBeEmpty();
});

test("a refused jump (the shared cooldown) shows its reason in the scenario", async ({ page }) => {
  const f: Fake = { viewer: "3", phase: "live", sent: [], demoStatus: 429 };
  await mockDemo(page, f);
  await page.goto("/guide");
  await setUp(page, "3. Win and donate").click();
  const status = scenario(page, "3. Win and donate").getByRole("status");
  await expect(status).toContainText("Couldn't set this up");
  await expect(status).toContainText("The demo data just changed. Try again in 7 seconds.");
});

test("when the needed state is gone, it says what happened and offers Restore (which still asks)", async ({ page }) => {
  const f: Fake = { viewer: "3", phase: "live", sent: [] };
  await mockDemo(page, f, { instantLeft: 0 });
  await page.goto("/guide");
  await setUp(page, "2. Buy the last one").click();
  const status = scenario(page, "2. Buy the last one").getByRole("status");
  await expect(status).toContainText("Homemade hot sauce trio is sold out");
  await expect(status).toContainText("Someone bought the last one.");
  await status.getByRole("button", { name: "Restore demo data" }).click();
  const dialog = page.getByRole("dialog", { name: "Restore demo data?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(f.sent.map((s) => JSON.parse(s).action)).not.toContain("restore");
});

test("the guide is linked from the footer and the demo bar: the strip when wide, the open bar when narrow", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".site-footer").getByRole("link", { name: "Things to try" })).toHaveAttribute("href", "/guide");
  // Home's own "New here?" line gave way to the welcome dialog (DECISIONS #138).
  await expect(page.getByRole("main").getByRole("link", { name: /New here\?/ })).toHaveCount(0);
  const bar = page.locator('[data-demo-bar="page"]');
  // Wide: in the strip, open or collapsed; the open bar's own copy is hidden.
  await expect(bar.locator(".demo-bar__tour--strip")).toBeVisible();
  await expect(bar.locator(".demo-bar__tour--open")).toBeHidden();
  await bar.locator("summary").click();
  await expect(bar.locator(".demo-bar__tour--strip")).toBeVisible();
  // Narrow: no room in the strip, so it's the last thing in the open bar.
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(bar.locator(".demo-bar__tour--strip")).toBeHidden();
  await bar.locator("summary").click();
  await expect(bar.locator(".demo-bar__tour--open")).toBeVisible();
  // On the tour itself, the links say it's the current page.
  await page.goto("/guide");
  await expect(page.locator(".site-footer").getByRole("link", { name: "Things to try" })).toHaveAttribute("aria-current", "page");
});

test("with ?demo=off the guide still reads, without Set me up", async ({ page }) => {
  await page.goto("/guide?demo=off");
  await expect(page.getByRole("heading", { level: 1, name: "Things to try" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Set me up/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "1. Get outbid" }).getByRole("listitem")).toHaveCount(4);
});

test("the guide shows no phase banner, but a failed load still says so there (v1.25)", async ({ page }) => {
  await page.goto("/guide");
  await expect(page).toHaveTitle("Things to try · Kestrel Gives");
  await expect(page.locator("[data-shell-demo] .demo-bar")).toBeVisible(); // the app state is in
  await expect(page.locator("[data-shell-banner] .banner")).toHaveCount(0);
  // The slot stays for load errors.
  await page.route("**/api/app", (route) => route.fulfill({ status: 500, json: { ok: false, error: "The demo is resting." } }));
  await page.reload();
  await expect(page.locator("[data-shell-banner] .banner--danger")).toContainText("The demo couldn't load");
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("the footer: Things to try, Design system, then How this was built, in the same tab (v1.25)", async ({ page }) => {
  await page.goto("/");
  const links = page.locator(".site-footer a");
  await expect(links).toHaveText(["Things to try", "Design system", "How this was built"]);
  const built = page.locator(".site-footer").getByRole("link", { name: "How this was built" });
  await expect(built).toHaveAttribute("href", "https://derekpcollins.com/work/kestrel-gives/");
  await expect(built).not.toHaveAttribute("target", /.*/);
});
