// The app shell against the real API on dev (Milestone 3B; SPEC §3.1, §8): Viewing as, Jump
// to and Restore change what the header, profile menu and phase banner show. These tests
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

test("Jump to moves the phase: banner, pressed button, and Submit an Item only in the submission window", async ({ page }) => {
  await open(page);
  const jump = (name: string) => bar(page).getByRole("button", { name, exact: true });
  await expect(nav(page).getByRole("link", { name: "Submit an Item" })).toHaveCount(0);

  await jump("Submissions open").click();
  await expect(jump("Submissions open")).toHaveAttribute("aria-pressed", "true");
  await expect(banner(page)).toContainText("Submissions are open");
  await expect(nav(page).getByRole("link", { name: "Submit an Item" })).toBeVisible();
  await expect(bar(page).locator(".demo-bar__status")).toHaveText("Event moved to: Submissions open");

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
  await expect(dialog.locator(".dialog__error")).toContainText("The demo was just restored.");
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

test("demo bar at 1280: the Viewing as and Jump to labels share a top edge, and so do their controls", async ({ page }) => {
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
  await expect(strip.locator(".demo-bar__note")).toHaveText("Shared demo · resets daily");
  for (const part of [".demo-bar__tag", ".demo-bar__who", ".demo-bar__note"]) await expect(strip.locator(part)).toBeVisible();

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
