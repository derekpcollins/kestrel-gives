// Loading, slow and failed reads (owner, 6F; DECISIONS #119). Every page that waits on an API
// shows a visible loading line at once, then its content; a read that fails or takes longer
// than LOAD_TIMEOUT_MS ends in an error with Try again, which works. The APIs are delayed,
// failed or held in the browser (page.route), and the page clock is faked for the timeout, so
// nothing here writes and nothing waits ten real seconds.
import { expect, test, type Page, type Route } from "@playwright/test";
import { runAxe } from "./axe.ts";

test.beforeEach(({}, info) => test.skip(info.project.name !== "light-1280", "behavior is the same in every project"));
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });

const delayed = (ms: number) => async (route: Route) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await route.fallback();
};

async function viewAs(page: Page, id: string): Promise<void> {
  await page.context().addCookies([{ name: "kg_viewer", value: id, url: "http://localhost:3000" }]);
}

const loading = (page: Page) => page.locator("[data-page-loading]:visible");

// Each page, the API it waits on beyond the app state, and what shows once it has loaded.
const PAGES: { name: string; path: string; api: RegExp; viewer?: string; loaded: (page: Page) => ReturnType<Page["locator"]> }[] = [
  { name: "Silent Auction", path: "/silent-auction", api: /\/api\/items\?type=auction/, loaded: (p) => p.locator(".item-tile").first() },
  { name: "Instant Sale", path: "/instant-sale", api: /\/api\/items\?type=instant/, loaded: (p) => p.locator(".item-tile").first() },
  { name: "an item", path: "/items/1", api: /\/api\/items\?id=1$/, loaded: (p) => p.locator("[data-item-content] h1") },
  { name: "Your Items", path: "/your-items", api: /\/api\/me$/, loaded: (p) => p.locator(".your-items__section").first() },
  { name: "the proof page", path: "/your-items/proof", api: /\/api\/me$/, viewer: "1", loaded: (p) => p.locator("[data-proof-body]:visible, [data-proof-blocked]:visible") },
  { name: "the edit page", path: "/items/5/edit", api: /\/api\/items\?id=5$/, loaded: (p) => p.locator("[data-submit-form]:visible, [data-submit-blocked]:visible") },
  { name: "the giving page", path: "/giving", api: /\/api\/me$/, loaded: (p) => p.locator("[data-giving-total]:visible, [data-giving-none]:visible") },
  { name: "the Admin Dashboard", path: "/admin", api: /\/api\/admin\?view=summary$/, viewer: "1", loaded: (p) => p.locator(".total-card").first() },
];

for (const target of PAGES) {
  test(`${target.name}: a visible loading line while the API is slow, then the content`, async ({ page }) => {
    if (target.viewer) await viewAs(page, target.viewer);
    await page.route(target.api, delayed(1_500));
    await page.goto(target.path);
    await expect(loading(page)).toHaveCount(1);
    await expect(loading(page)).toHaveAttribute("role", "status");
    await expect(loading(page)).toContainText("Loading");
    await expect(target.loaded(page)).toBeVisible({ timeout: 10_000 });
    await expect(loading(page)).toHaveCount(0);
  });
}

test("Home and the submit form show their loading line while the app state is slow", async ({ page }) => {
  await page.route(/\/api\/app$/, delayed(1_500));
  await page.goto("/");
  await expect(page.getByRole("status").filter({ hasText: "Loading the charities…" })).toBeVisible();
  await expect(page.locator(".charity-card").first()).toBeVisible({ timeout: 10_000 });
  await expect(loading(page)).toHaveCount(0);
  await page.goto("/submit");
  await expect(page.getByRole("status").filter({ hasText: "Loading the form…" })).toBeVisible();
  await expect(page.locator("[data-submit-form]:visible, [data-submit-blocked]:visible")).toBeVisible({ timeout: 10_000 });
  await expect(loading(page)).toHaveCount(0);
});

test("a failed read shows the page's error with Try again, which loads it", async ({ page }) => {
  let fail = true;
  await page.route(/\/api\/items\?type=auction/, (route) => (fail ? route.fulfill({ status: 500, json: { error: "Down" } }) : route.fallback()));
  await page.goto("/silent-auction");
  const error = page.getByRole("region", { name: "We couldn't load the items" });
  await expect(error).toBeVisible();
  await expect(loading(page)).toHaveCount(0);
  const { violations } = await runAxe(page);
  expect(violations.map((v) => v.id)).toEqual([]);
  fail = false;
  await error.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".item-tile").first()).toBeVisible();
  await expect(error).toBeHidden();
});

test("a read that takes longer than 10 seconds gives up: the error with Try again, then it loads", async ({ page }) => {
  await viewAs(page, "1");
  await page.clock.install();
  let hold = true;
  await page.route(/\/api\/me$/, async (route) => {
    if (!hold) return route.fallback();
    await new Promise(() => {}); // never answers
  });
  const asked = page.waitForRequest(/\/api\/me$/);
  await page.goto("/your-items");
  await expect(page.getByRole("status").filter({ hasText: "Loading your items…" })).toBeVisible();
  await asked; // the clock starts counting once the page has asked
  await page.clock.runFor(9_000);
  await expect(page.getByRole("status").filter({ hasText: "Loading your items…" })).toBeVisible();
  await page.clock.runFor(1_500);
  const error = page.getByRole("region", { name: "We couldn't load your items" });
  await expect(error).toBeVisible();
  await expect(loading(page)).toHaveCount(0);
  hold = false;
  await error.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Loading your items…" })).toBeVisible();
  await expect(page.locator(".your-items__section").first()).toBeVisible();
  await expect(loading(page)).toHaveCount(0);
});

test("the app state failing or timing out: a banner with Try again replaces the loading line; Try again loads the page", async ({ page }) => {
  await page.clock.install();
  let mode: "hang" | "fail" | "ok" = "hang";
  await page.route(/\/api\/app$/, async (route) => {
    if (mode === "ok") return route.fallback();
    if (mode === "fail") return route.fulfill({ status: 503, json: { error: "The database is starting. Try again in a moment." } });
    await new Promise(() => {});
  });
  const asked = page.waitForRequest(/\/api\/app$/);
  await page.goto("/silent-auction");
  await expect(loading(page)).toHaveCount(1);
  await asked;
  await page.clock.runFor(10_500);
  const banner = page.getByRole("alert").filter({ hasText: "The demo couldn't load" });
  await expect(banner).toContainText("The demo is taking too long to answer. Try again in a moment.");
  await expect(loading(page)).toHaveCount(0);
  mode = "fail";
  await banner.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The database is starting." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeFocused();
  mode = "ok";
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".item-tile").first()).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "The demo couldn't load" })).toHaveCount(0);
  await expect(page.locator("main")).toBeFocused();
});
