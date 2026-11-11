// The welcome dialog (SPEC v1.24 §3.1; DECISIONS #138–140): a first visit opens it once the
// page's data has loaded; it's remembered from the moment it opens; never on the tour, never
// on top of another dialog, never with ?demo=off. It fits a phone, and on a phone held sideways
// only its body scrolls. Every other spec starts with it seen (#140); this one starts empty.
// About this demo and storage unavailable come in Stage 3.
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { runAxe } from "./axe.ts";
import { pageLoaded } from "./page-load.ts";
import { WELCOME, WELCOME_KEY } from "../../src/components/welcome-rules.ts";

test.use({ storageState: { cookies: [], origins: [] } });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });

/** Behavior is the same everywhere, so most tests run once; axe runs in all four projects. */
const once = (info: TestInfo) => test.skip(info.project.name !== "light-1280", "behavior is the same in every project");

const welcome = (page: Page) => page.getByRole("dialog", { name: WELCOME.title });
const stored = (page: Page) => page.evaluate(`localStorage.getItem(${JSON.stringify(WELCOME_KEY)})`);
const start = (page: Page) => welcome(page).getByRole("button", { name: WELCOME.dismiss });
const tour = (page: Page) => welcome(page).getByRole("link", { name: WELCOME.tour.label });

/** The welcome would open right after the data loads; give it a moment before saying it didn't. */
async function expectNoWelcome(page: Page): Promise<void> {
  await page.waitForTimeout(750);
  await expect(page.locator("dialog")).toHaveCount(0);
}

/** Holds a request until `release()` is called. */
async function hold(page: Page, url: string | RegExp): Promise<() => void> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(url, async (route) => { await gate; await route.continue(); });
  return release;
}

/** A box inside the viewport, top to bottom and side to side. */
async function inView(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  const size = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
}

test("a first visit opens it once the page's data has loaded, focused on Start exploring, and remembers it then", async ({ page }, info) => {
  once(info);
  const release = await hold(page, /\/api\/items\?type=auction/);
  await page.goto("/silent-auction");
  await expect(page.locator("[data-shell-demo] .demo-bar")).toBeVisible(); // the app state is in
  await expect(page.locator("[data-browse-grid]")).toHaveAttribute("aria-busy", "true");
  await page.waitForTimeout(750);
  await expect(welcome(page)).toHaveCount(0); // not while the items are still loading
  expect(await stored(page)).toBeNull();

  release();
  await expect(welcome(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-browse-grid]")).not.toHaveAttribute("aria-busy", /.*/);
  expect(await welcome(page).evaluate((el) => el.matches(":modal"))).toBe(true);
  await expect(start(page)).toBeFocused();
  expect(await stored(page)).toBe("true"); // remembered on open, not on dismiss

  // The words: the title and its one-line description, four things to try, then Restore.
  await expect(welcome(page)).toHaveAccessibleDescription(WELCOME.body);
  await expect(welcome(page).getByRole("listitem")).toHaveText([...WELCOME.steps]);
  await expect(welcome(page)).toContainText(WELCOME.closing);
  // Dismiss first, as in every dialog here; the tour is a real link.
  await expect(welcome(page).locator(".dialog__actions > *")).toHaveText([WELCOME.dismiss, WELCOME.tour.label]);
  await expect(tour(page)).toHaveAttribute("href", "/guide");
});

test("Home opens it too; leaving without dismissing still counts, and once dismissed it stays away", async ({ page }, info) => {
  once(info);
  await page.goto("/");
  await expect(welcome(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-charities]")).not.toHaveAttribute("aria-busy", /.*/);

  // Gone to another page with it still open: already seen.
  await page.goto("/instant-sale");
  await pageLoaded(page);
  await expectNoWelcome(page);

  await page.goto("/");
  await pageLoaded(page);
  await expectNoWelcome(page);
  expect(await stored(page)).toBe("true");
});

test("Start exploring and Escape both just close it, and it isn't back on reload", async ({ page }, info) => {
  once(info);
  await page.goto("/");
  await expect(welcome(page)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Enter"); // on Start exploring: closes, goes nowhere
  await expect(welcome(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);

  await page.reload();
  await pageLoaded(page);
  await expectNoWelcome(page);

  // A second visitor closes it with Escape.
  await page.evaluate(`localStorage.clear()`);
  await page.reload();
  await expect(welcome(page)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(welcome(page)).toHaveCount(0);
  await page.reload();
  await pageLoaded(page);
  await expectNoWelcome(page);
});

test("Take the 5-minute tour goes to the Guide, which never shows it; a first visit to the Guide counts as seen", async ({ page }, info) => {
  once(info);
  await page.goto("/");
  await expect(welcome(page)).toBeVisible({ timeout: 15_000 });
  await tour(page).click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole("heading", { level: 1, name: "Try it: a 5-minute tour" })).toBeVisible();
  await expectNoWelcome(page);

  // Someone who starts on the Guide has found the tour already.
  await page.evaluate(`localStorage.clear()`);
  await page.reload();
  await expect(page.locator("[data-shell-demo] .demo-bar")).toBeVisible();
  await expectNoWelcome(page);
  expect(await stored(page)).toBe("true");
  await page.goto("/");
  await pageLoaded(page);
  await expectNoWelcome(page);
});

test("keyboard: focus stays inside, Tab reaches both actions, and the page behind can't be reached", async ({ page }, info) => {
  once(info);
  await page.goto("/");
  await expect(welcome(page)).toBeVisible({ timeout: 15_000 });
  await expect(start(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(tour(page)).toBeFocused();
  // However far you Tab or Shift+Tab, focus is in the dialog (or the browser's own controls).
  for (const key of ["Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    const where = await page.evaluate(`(() => { const a = document.activeElement; return !a || a === document.body ? "none" : a.closest("dialog") ? "dialog" : "page"; })()`);
    expect(where).not.toBe("page");
  }
  await page.keyboard.press("Escape");
  await expect(welcome(page)).toHaveCount(0);
});

test("fits a 390×844 phone without scrolling", async ({ page }, info) => {
  once(info);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(welcome(page)).toBeVisible({ timeout: 15_000 });
  const body = welcome(page).locator(".dialog__body");
  const sizes = await welcome(page).evaluate((el) => {
    const b = el.querySelector(".dialog__body")!;
    return { dialog: [el.scrollHeight, el.clientHeight], body: [b.scrollHeight, b.clientHeight] };
  });
  expect(sizes.dialog[0]).toBeLessThanOrEqual(sizes.dialog[1]!);
  expect(sizes.body[0]).toBeLessThanOrEqual(sizes.body[1]!);
  await expect(body).not.toHaveAttribute("tabindex", /.*/); // nothing to scroll, so no extra Tab stop
  await inView(page, welcome(page));
});

test("at 320 wide nothing scrolls sideways and every line and both actions are on screen", async ({ page }, info) => {
  once(info);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await expect(welcome(page)).toBeVisible({ timeout: 15_000 });
  const widths = await welcome(page).evaluate((el) => ({
    dialog: [el.scrollWidth, el.clientWidth],
    body: [el.querySelector(".dialog__body")!.scrollWidth, el.querySelector(".dialog__body")!.clientWidth],
  }));
  expect(await page.evaluate("document.documentElement.scrollWidth")).toBeLessThanOrEqual(320);
  expect(widths.dialog[0]).toBeLessThanOrEqual(widths.dialog[1]!);
  expect(widths.body[0]).toBeLessThanOrEqual(widths.body[1]!);
  await inView(page, welcome(page));
  await inView(page, start(page));
  await inView(page, tour(page));
  await inView(page, welcome(page).getByText(WELCOME.closing));
});

test("on a phone held sideways (844×390) only the body scrolls, and both actions stay in view", async ({ page }, info) => {
  once(info);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await expect(welcome(page)).toBeVisible({ timeout: 15_000 });
  const body = welcome(page).locator(".dialog__body");
  // The dialog itself doesn't scroll; its body does, and becomes a named, focusable region.
  const sizes = await welcome(page).evaluate((el) => {
    const b = el.querySelector(".dialog__body")!;
    return { dialog: [el.scrollHeight, el.clientHeight], body: [b.scrollHeight, b.clientHeight] };
  });
  expect(sizes.dialog[0]).toBeLessThanOrEqual(sizes.dialog[1]!);
  expect(sizes.body[0]).toBeGreaterThan(sizes.body[1]!);
  await expect(welcome(page).getByRole("region", { name: WELCOME.title })).toBeVisible();
  await expect(body).toHaveAttribute("tabindex", "0");
  await inView(page, welcome(page));
  await inView(page, welcome(page).getByRole("heading", { name: WELCOME.title }));
  await inView(page, start(page));
  await inView(page, tour(page));

  // From the keyboard: Shift+Tab from Start exploring reaches the body, and End scrolls it to the last line.
  await expect(start(page)).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(body).toBeFocused();
  await page.keyboard.press("End");
  await expect.poll(() => body.evaluate((b) => Math.ceil(b.scrollTop + b.clientHeight) >= b.scrollHeight)).toBe(true);
  const last = await welcome(page).getByText(WELCOME.closing).boundingBox();
  const frame = await body.boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(frame!.y + frame!.height + 1);
  await inView(page, start(page));
  await inView(page, tour(page));
  const { violations } = await runAxe(page);
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test("no accessibility violations with it open", async ({ page }) => {
  await page.goto("/");
  await expect(welcome(page)).toBeVisible({ timeout: 15_000 });
  const { violations } = await runAxe(page);
  expect(violations.map((v) => `${v.id}: ${v.help} @ ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("never on top of another dialog: skipped for this load, not remembered, and shown on the next", async ({ page }, info) => {
  once(info);
  const release = await hold(page, /\/api\/items\?type=auction/);
  await page.goto("/silent-auction");
  const bar = page.locator('[data-demo-bar="page"]');
  await bar.getByRole("button", { name: "Restore demo data" }).click(); // the bar starts open at 1280
  const restore = page.getByRole("dialog", { name: "Restore demo data?" });
  await expect(restore).toBeVisible();
  release();
  await expect(page.locator("[data-browse-grid]")).not.toHaveAttribute("aria-busy", /.*/, { timeout: 15_000 });
  await page.waitForTimeout(750);
  await expect(welcome(page)).toHaveCount(0);
  expect(await stored(page)).toBeNull();
  await restore.getByRole("button", { name: "Cancel" }).click();
  await expect(restore).toHaveCount(0);
  await expectNoWelcome(page); // not when the other one closes either

  await page.reload();
  await expect(welcome(page)).toBeVisible({ timeout: 15_000 });
});

test("with ?demo=off it never shows and isn't remembered", async ({ page }, info) => {
  once(info);
  await page.goto("/?demo=off");
  await pageLoaded(page);
  await expectNoWelcome(page);
  expect(await stored(page)).toBeNull();
  await page.goto("/silent-auction?demo=off");
  await pageLoaded(page);
  await expectNoWelcome(page);
  expect(await stored(page)).toBeNull();
});
