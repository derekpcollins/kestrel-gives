// The app shell against the real API on dev (Milestone 3B; SPEC §3.1, §8): Viewing as, Event
// phase and Restore change what the header, profile menu and phase banner show. These tests
// change the shared dev data, so they run one at a time in one project and put the event
// back to live at the end.
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
// Only light-1280 runs these tests. The other projects still load this file in their own
// workers, so anything that touches dev (the reset below) must check the project too: an
// unguarded afterAll there once jumped the event back to live in the middle of this run.
const RUNS_HERE = "light-1280";
test.beforeEach(({}, info) => test.skip(info.project.name !== RUNS_HERE, "behavior is the same in every project"));

const bar = (page: Page) => page.locator('[data-demo-bar="page"]');
const banner = (page: Page) => page.locator("[data-shell-banner] .banner");
const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });

async function open(page: Page, path = "/") {
  await page.goto(path);
  await page.addScriptTag({ content: 'localStorage.removeItem("kestrel-demo-bar-collapsed")' });
  await page.goto(path);
  await expect(banner(page)).toBeVisible();
}

test.afterAll(async ({ request }, info) => {
  if (info.project.name !== RUNS_HERE) return;
  await request.post("/api/demo", { data: { action: "jump", to: "live" } });
  await request.post("/api/demo", { data: { action: "view-as", userId: "3" } });
});

test("the API refuses a form post; the viewer cookie is HttpOnly, SameSite=Lax, Path=/", async ({ request }) => {
  const form = await request.post("/api/demo", { form: { action: "restore" } });
  expect(form.status()).toBe(415);
  const ok = await request.post("/api/demo", { data: { action: "view-as", userId: "3" } });
  const cookie = ok.headers()["set-cookie"] ?? "";
  expect(cookie).toMatch(/^kg_viewer=3;/);
  for (const part of ["Path=/", "HttpOnly", "SameSite=Lax"]) expect(cookie.split("; ")).toContain(part);
  // Local vercel dev is plain http, so no Secure here; https deployments add it (unit-tested).
});

test("viewing as an admin shows the profile menu with the Admin Dashboard; an employee sees only an avatar", async ({ page }) => {
  await open(page, "/silent-auction");
  await expect(nav(page).getByRole("link", { name: "Silent Auction" })).toHaveAttribute("aria-current", "page");
  await bar(page).getByLabel("Viewing as").selectOption({ label: "Maya Okafor (admin)" });
  await expect(bar(page).locator(".demo-bar__status")).toHaveText("Now viewing as Maya Okafor (admin)");
  const profile = page.getByRole("button", { name: "Maya Okafor, admin" });
  await profile.click();
  await expect(page.getByRole("link", { name: "Admin Dashboard" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(profile).toBeFocused();

  await page.reload(); // the cookie remembers
  await expect(page.getByRole("button", { name: "Maya Okafor, admin" })).toBeVisible();

  await bar(page).getByLabel("Viewing as").selectOption({ label: "Jules Ferreira (employee)" });
  await expect(page.getByRole("img", { name: "Jules Ferreira" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin Dashboard" })).toHaveCount(0);
});

test("the Admin Dashboard tells employees it's for admins", async ({ page }) => {
  await open(page, "/admin");
  await expect(page.getByText("For admins only")).toBeVisible();
  await bar(page).getByLabel("Viewing as").selectOption({ label: "Theo Lindqvist (admin)" });
  await expect(page.getByText("For admins only")).toBeHidden();
  await bar(page).getByLabel("Viewing as").selectOption({ label: "Jules Ferreira (employee)" });
});

test("Event phase moves the phase: banner and pressed button; Submissions open asks first, and Cancel changes nothing", async ({ page }) => {
  await open(page);
  const jump = (name: string) => bar(page).getByRole("button", { name, exact: true });
  await expect(nav(page).getByRole("link", { name: "Submit an Item" })).toHaveCount(0);

  // "Submissions open" clears activity, so it asks first (DECISIONS #124). The real clearing runs
  // in demo-jump.spec.ts, one test at a time, so it can't empty the data under other specs here.
  const sent: string[] = [];
  page.on("request", (r) => { if (r.url().endsWith("/api/demo") && r.method() === "POST") sent.push(r.postData() ?? ""); });
  await jump("Submissions open").click();
  const dialog = page.getByRole("dialog", { name: "Open submissions and clear activity?" });
  await expect(dialog).toContainText("Submissions open clears bids, purchases and proofs, with their uploaded files. Items stay. Restore demo data brings them back.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(jump("Submissions open")).toBeFocused();
  await expect(jump("Bidding live")).toHaveAttribute("aria-pressed", "true");
  expect(sent).toEqual([]);

  // Inside the shared cooldown the server says why, in the dialog, which stays open.
  await page.route("**/api/demo", (route) =>
    route.fulfill({ status: 429, contentType: "application/json", headers: { "Retry-After": "6" }, body: JSON.stringify({ error: "The demo data just changed. Try again in 6 seconds." }) }));
  await jump("Submissions open").click();
  await dialog.getByRole("button", { name: "Clear and open submissions" }).click();
  await expect(dialog.locator(".dialog__error")).toContainText("The demo data just changed. Try again in 6 seconds.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.unroute("**/api/demo");
  await expect(jump("Bidding live")).toHaveAttribute("aria-pressed", "true");

  await jump("Ending soon").click();
  await expect(banner(page)).toContainText("Bidding ends soon");
  await expect(nav(page).getByRole("link", { name: "Submit an Item" })).toHaveCount(0);

  await jump("Bidding ended").click();
  await expect(banner(page)).toContainText("Winners, please donate and upload proof by");

  await jump("30+ days after").click();
  await expect(banner(page)).toContainText("The proof deadline was");
  await page.reload();
  await expect(jump("30+ days after")).toHaveAttribute("aria-pressed", "true"); // from the data, not the click

  await jump("Bidding live").click();
  await expect(banner(page)).toContainText("Bidding is open");
});

test("Restore asks first, restores, and a second restore within the cooldown shows why in the dialog", async ({ page }) => {
  await open(page);
  await bar(page).getByRole("button", { name: "Bidding ended", exact: true }).click();
  await expect(banner(page)).toContainText("Bidding has ended");

  const restore = bar(page).getByRole("button", { name: "Restore demo data" });
  await restore.click();
  const dialog = page.locator("dialog.dialog--danger");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Restore demo data" }).click();
  await expect(dialog).toHaveCount(0, { timeout: 15_000 });
  await expect(banner(page)).toContainText("Bidding is open");
  await expect(page.locator(".toast-region")).toContainText("Demo data restored.");

  await restore.click();
  await dialog.getByRole("button", { name: "Restore demo data" }).click();
  await expect(dialog.locator(".dialog__error")).toContainText("The demo data just changed.");
  await page.keyboard.press("Escape");
  await expect(restore).toBeFocused();
});

test("an employee's avatar is an image with their name, not a control", async ({ page }) => {
  await page.request.post("/api/demo", { data: { action: "view-as", userId: "3" } });
  await open(page, "/silent-auction");
  const avatar = page.locator(".site-header__end").getByRole("img", { name: "Jules Ferreira" });
  await expect(avatar).toBeVisible();
  await expect(page.locator(".site-header__end").getByRole("button")).toHaveCount(0);
  await expect(page.locator(".site-header__end a, .site-header__end [tabindex]")).toHaveCount(0);
  // Runs in the page as an expression; this file has no DOM types (DECISIONS #26).
  const STATIC = `document.querySelector(".site-header__end [role=img]")`;
  expect(await page.evaluate(`getComputedStyle(${STATIC}).cursor`)).toBe("default");

  // No hover state: hovering changes nothing that's drawn.
  const look = async () => String(await page.evaluate(`(() => {
    const el = ${STATIC}, s = getComputedStyle(el), a = getComputedStyle(el.firstElementChild);
    return [s.backgroundColor, s.outlineStyle, s.borderColor, s.boxShadow, a.backgroundColor, a.color].join("|");
  })()`));
  const before = await look();
  expect(before).toMatch(/rgb/); // really read the styles
  await avatar.hover();
  expect(await look()).toBe(before);

  // Not in the tab order: tabbing through the whole page never lands on it.
  await page.locator("body").focus();
  const stops: string[] = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    stops.push(String(await page.evaluate('document.activeElement?.className ?? ""')));
  }
  expect(stops.some((c) => c.includes("profile-menu__static") || c.includes("avatar"))).toBe(false);
  expect(stops.some((c) => c.includes("site-header__link"))).toBe(true); // the walk did reach the header
});

test("demo bar at 1280: the Viewing as and Event phase labels share a top edge, and so do their controls", async ({ page }) => {
  await open(page);
  const viewing = await bar(page).locator(".demo-bar__viewing .field__label").boundingBox();
  const jump = await bar(page).locator(".demo-bar__group-label").boundingBox();
  expect(Math.abs(viewing!.y - jump!.y)).toBeLessThanOrEqual(1);
  // ...and so do the controls under them.
  const select = await bar(page).locator(".demo-bar__viewing select").boundingBox();
  const firstJump = await bar(page).locator(".demo-bar__jump-buttons .btn").first().boundingBox();
  expect(Math.abs(select!.y - firstJump!.y)).toBeLessThanOrEqual(1);
});

test("demo bar below 40rem starts collapsed, keeps its strip, and a visitor's choice wins", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page); // clears the remembered choice
  const details = bar(page).locator("details");
  await expect(details).not.toHaveAttribute("open");
  const strip = bar(page).locator("summary");
  await expect(strip.locator(".demo-bar__tag")).toHaveText("Demo");
  await expect(strip.locator(".demo-bar__who")).toHaveText("Viewing as Jules Ferreira (employee)");
  for (const part of [".demo-bar__tag", ".demo-bar__who"]) await expect(strip.locator(part)).toBeVisible();
  await expect(bar(page).locator(".demo-bar__note")).toBeHidden(); // open bar only (v1.25)

  await strip.click(); // the visitor opens it
  await expect(details).toHaveAttribute("open");
  await page.reload();
  await expect(bar(page).locator("details")).toHaveAttribute("open");

  // Wide screens start open when nothing is remembered.
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await expect(bar(page).locator("details")).toHaveAttribute("open");
});

test("phase banner in dark mode: calm phases get the dark butter surface; ending soon stays bright", async ({ page, request }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const colors = async () => String(await page.evaluate(`(() => {
    const s = getComputedStyle(document.querySelector("[data-shell-banner] .banner"));
    return [s.backgroundColor, s.borderTopColor, s.color].join("|");
  })()`)).split("|");
  const BUTTER = "rgb(255, 224, 138)";
  await request.post("/api/demo", { data: { action: "jump", to: "live" } });
  await open(page);
  const [bg, border, text] = await colors();
  expect(bg).not.toBe(BUTTER);
  expect(border).toBe(BUTTER);
  expect(text).toBe("rgb(253, 243, 208)");

  await bar(page).getByRole("button", { name: "Ending soon", exact: true }).click();
  await expect(banner(page)).toHaveClass(/banner--urgent/);
  expect((await colors())[0]).toBe(BUTTER);

  await page.emulateMedia({ colorScheme: "light" }); // light mode unchanged: butter for both
  expect((await colors())[0]).toBe(BUTTER);
  await bar(page).getByRole("button", { name: "Bidding live", exact: true }).click();
  await expect(banner(page)).not.toHaveClass(/banner--urgent/);
  expect((await colors())[0]).toBe(BUTTER);
});

test("forced colors: the pressed phase, the current admin section and the current page still stand out (DECISIONS #123)", async ({ page, baseURL }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.context().addCookies([{ name: "kg_viewer", value: "1", url: baseURL ?? "http://localhost:3000" }]);
  await page.goto("/admin");
  await expect(page.locator(".admin-nav__link[aria-current='page']")).toBeVisible();
  const background = (selector: string) => page.evaluate(`getComputedStyle(document.querySelector("${selector.replace(/"/g, '\\"')}")).backgroundColor`);
  // The marked one has a fill (Highlight); the others are the page's own background.
  expect(await background(".admin-nav__link[aria-current='page']")).not.toBe(await background(".admin-nav__link:not([aria-current])"));
  expect(await background(".demo-bar__jump-buttons .btn[aria-pressed='true']")).not.toBe(await background(".demo-bar__jump-buttons .btn[aria-pressed='false']"));
  await page.goto("/your-items");
  const line = await page.evaluate(`getComputedStyle(document.querySelector(".site-header__link[aria-current='page']")).textDecorationLine`);
  expect(line).toBe("underline");
});

// Visible changes A1 (SPEC v1.25 §3.1, §6): the strip is one line at every width, the note lives in
// the open bar, the controls are compact but never under 36px, and Restore is the danger outline.
test("demo bar: the strip is one line at 320, 390 and 1280; the open bar is compact", async ({ page }) => {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await open(page);
    const summary = bar(page).locator("summary");
    if (await bar(page).locator("details").evaluate((d) => (d as unknown as { open: boolean }).open)) await summary.click();
    const tag = await summary.locator(".demo-bar__tag").boundingBox();
    const who = await summary.locator(".demo-bar__who").boundingBox();
    const chevron = await summary.locator(".icon").boundingBox();
    const box = await summary.boundingBox();
    // One line: everything shares a vertical centre, and the strip is no taller than its 44px target.
    for (const part of [who!, chevron!]) expect(Math.abs(part.y + part.height / 2 - (tag!.y + tag!.height / 2)), `${width}px`).toBeLessThanOrEqual(2);
    expect(box!.height, `${width}px`).toBeLessThanOrEqual(45);
    await expect(bar(page).locator(".demo-bar__note")).toBeHidden();

    await summary.click();
    await expect(bar(page).locator(".demo-bar__note")).toHaveText("Shared demo · resets daily");
    await expect(bar(page).locator(".demo-bar__group-label")).toHaveText("Event phase");
    const heights = await bar(page).locator(".demo-bar__jump-buttons .btn, .demo-bar__viewing select, [data-demo-restore]")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    for (const h of heights) {
      expect(h, `${width}px`).toBeGreaterThanOrEqual(36);
      expect(h, `${width}px`).toBeLessThan(44);
    }
    await expect(bar(page).locator("[data-demo-restore]")).toHaveClass(/btn--danger-outline/);
  }
});
