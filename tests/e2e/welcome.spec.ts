// The welcome dialog (SPEC v1.24 §3.1; DECISIONS #138–140): a first visit opens it once the
// page's data has loaded; it's remembered from the moment it opens; never on the tour, never
// on top of another dialog, never with ?demo=off. It fits a phone, and on a phone held sideways
// only its body scrolls. About this demo reopens it, and with storage blocked it still shows on
// Home. Every other spec starts with it seen (#140); this one starts empty.
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
const demoBar = (page: Page) => page.locator('[data-demo-bar="page"]');
const about = (page: Page) => demoBar(page).getByRole("button", { name: "About this demo" });

/** The divider above the actions, shown only while the body scrolls. */
const divider = (body: Locator) => body.evaluate((b) => {
  const view = b.ownerDocument.defaultView as unknown as { getComputedStyle(e: unknown): { borderBottomWidth: string } };
  return view.getComputedStyle(b).borderBottomWidth;
});

/** Each action's left edge, top edge and width, in DOM order. */
const actionBoxes = (dialog: Locator) => dialog.locator(".dialog__actions > *").evaluateAll((els) =>
  els.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width) }; }));

/** Stacked: one above the other, the same left edge and the full width of the row. */
async function expectStacked(dialog: Locator): Promise<void> {
  const [first, second] = await actionBoxes(dialog);
  const row = await dialog.locator(".dialog__actions").evaluate((a) => Math.round(a.getBoundingClientRect().width));
  expect(second!.y).toBeGreaterThan(first!.y);
  expect(Math.abs(first!.x - second!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(first!.width - second!.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(first!.width - row)).toBeLessThanOrEqual(1);
}

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
  // The primary on the right, as in every dialog here, so Tab runs as you read; the tour is a real link.
  await expect(welcome(page).locator(".dialog__actions > *")).toHaveText([WELCOME.tour.label, WELCOME.dismiss]);
  await expect(tour(page)).toHaveAttribute("href", "/guide");
  const [left, right] = await actionBoxes(welcome(page));
  expect(right!.x).toBeGreaterThan(left!.x); // side by side at 1280
  expect(right!.y).toBe(left!.y);
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
  await page.keyboard.press("Shift+Tab");
  await expect(tour(page)).toBeFocused(); // the tour comes before Start exploring
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
  expect(await divider(body)).toBe("0px"); // and no divider
  await inView(page, welcome(page));
  // The actions don't fit side by side, so each takes the full width: the tour, then Start exploring.
  await expectStacked(welcome(page));
  await expect(welcome(page).locator(".dialog__actions > *")).toHaveText([WELCOME.tour.label, WELCOME.dismiss]);
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
  await expectStacked(welcome(page));
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
  expect(await divider(body)).toBe("1px"); // the cue that there's more
  await inView(page, welcome(page));
  await inView(page, welcome(page).getByRole("heading", { name: WELCOME.title }));
  await inView(page, start(page));
  await inView(page, tour(page));

  // From the keyboard: Shift+Tab past the tour reaches the body, and End scrolls it to the last line.
  await expect(start(page)).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(tour(page)).toBeFocused();
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

test("About this demo reopens it from the open bar, and focus comes back to About this demo", async ({ page }, info) => {
  once(info);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(welcome(page)).toBeVisible({ timeout: 15_000 });
  await start(page).click();
  await expect(welcome(page)).toHaveCount(0);

  // Phones start with the bar collapsed; About this demo is in the open bar.
  await expect(about(page)).toBeHidden();
  await demoBar(page).locator("summary").click();
  await about(page).click();
  await expect(welcome(page)).toBeVisible();
  await expect(start(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(welcome(page)).toHaveCount(0);
  await expect(about(page)).toBeFocused();

  // From the keyboard too, closed with Start exploring this time.
  await page.keyboard.press("Enter");
  await expect(welcome(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(welcome(page)).toHaveCount(0);
  await expect(about(page)).toBeFocused();
  expect(await stored(page)).toBe("true");
});

test("with storage blocked it shows on Home on every load, nowhere else, and About this demo still works", async ({ page }, info) => {
  once(info);
  // Cookies off and some privacy modes: even reading localStorage throws.
  await page.addInitScript(`Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(welcome(page)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(welcome(page)).toHaveCount(0);

  // It can't be remembered, so Home shows it again, but only Home.
  await page.reload();
  await expect(welcome(page)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await page.goto("/silent-auction");
  await pageLoaded(page);
  await expectNoWelcome(page);

  // The demo bar still works (collapsed on a phone, nothing remembered), and so does About.
  await demoBar(page).locator("summary").click();
  await about(page).click();
  await expect(welcome(page)).toBeVisible();
  await expect(start(page)).toBeFocused();
  await start(page).click();
  await expect(about(page)).toBeFocused();
});

test("below 640px every dialog's actions fill the row: a confirm dialog that wraps stacks at one width", async ({ page }, info) => {
  once(info);
  await page.addInitScript(`localStorage.setItem(${JSON.stringify(WELCOME_KEY)}, "true")`); // not this test's subject
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/silent-auction");
  await pageLoaded(page);
  await demoBar(page).locator("summary").click();
  await demoBar(page).getByRole("button", { name: "Submissions open" }).click();
  const confirm = page.getByRole("dialog", { name: "Open submissions and clear activity?" });
  await expect(confirm).toBeVisible();
  await expectStacked(confirm);
  await expect(confirm.locator(".dialog__actions > *")).toHaveText(["Cancel", "Clear and open submissions"]);
  await confirm.getByRole("button", { name: "Cancel" }).click();

  // One whose actions fit stays side by side, filling the row between them.
  await demoBar(page).getByRole("button", { name: "Restore demo data" }).click();
  const restore = page.getByRole("dialog", { name: "Restore demo data?" });
  await expect(restore).toBeVisible();
  const [cancel, act] = await actionBoxes(restore);
  const row = await restore.locator(".dialog__actions").evaluate((a) => { const r = a.getBoundingClientRect(); return { x: Math.round(r.x), width: Math.round(r.width) }; });
  expect(act!.y).toBe(cancel!.y);
  expect(Math.abs(cancel!.x - row.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(act!.x + act!.width - (row.x + row.width))).toBeLessThanOrEqual(1);
  await restore.getByRole("button", { name: "Cancel" }).click();
});
