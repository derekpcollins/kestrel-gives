// Backdrop clicks on dialogs (SPEC v1.25 §3.1; DECISIONS entry 146). On the gallery's live
// dialogs, whose requests are simulated: a click on the backdrop counts as Cancel on the confirm
// and danger variants, is ignored by dialogs with typed input (a reason, type-to-confirm) and
// while a request runs, and never fires for a press that starts inside the dialog. Then once on
// the real demo bar: Restore's backdrop click sends nothing.
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const once = (info: TestInfo) => test.skip(info.project.name !== "light-1280", "behavior is the same in every project");

const dialog = (page: Page) => page.locator("dialog[open]");
/** A point on the backdrop: the top-left corner, well outside any dialog. */
const backdrop = (page: Page) => page.mouse.click(8, 8);

/** The gallery's live dialog buttons (data-demo-dialog), not the static button specimens. */
const DEMO: Record<string, string> = { "Place bid": "bid", "Restore demo data": "restore", "Cancel item": "cancel", "Reject proof": "reject", "Reset for next year": "reset" };
const galleryTrigger = (page: Page, name: string) => page.locator(`[data-demo-dialog="${DEMO[name]}"]`);

async function openFromGallery(page: Page, name: string): Promise<void> {
  await galleryTrigger(page, name).click();
  await expect(dialog(page)).toBeVisible();
  await page.waitForFunction("document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity)");
}

test("confirm and danger dialogs: a backdrop click is Cancel, and focus goes back to the button", async ({ page }, info) => {
  once(info);
  await page.goto("/design-system/");
  for (const name of ["Place bid", "Restore demo data", "Cancel item"]) {
    await openFromGallery(page, name);
    await backdrop(page);
    await expect(dialog(page), name).toHaveCount(0);
    await expect(galleryTrigger(page, name), name).toBeFocused();
    await expect(page.locator(".toast:not(.toast--static)"), `${name}: nothing was confirmed`).toHaveCount(0);
  }
});

test("dialogs with typed input ignore the backdrop; Cancel and Escape still close them", async ({ page }, info) => {
  once(info);
  await page.goto("/design-system/");
  for (const name of ["Reject proof", "Reset for next year"]) {
    await openFromGallery(page, name);
    await page.keyboard.type("Half typed");
    await backdrop(page);
    await expect(dialog(page), name).toBeVisible();
    await expect(dialog(page).locator("input, textarea"), name).toHaveValue("Half typed");
    await page.keyboard.press("Escape");
    await expect(dialog(page), name).toHaveCount(0);
  }
});

test("a press that starts inside the dialog and ends on the backdrop doesn't close it", async ({ page }, info) => {
  once(info);
  await page.goto("/design-system/");
  await openFromGallery(page, "Restore demo data");
  const box = (await dialog(page).locator(".dialog__body").boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(8, 8, { steps: 5 });
  await page.mouse.up();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
});

test("while the request runs, the backdrop does nothing", async ({ page }, info) => {
  once(info);
  await page.goto("/design-system/");
  await openFromGallery(page, "Place bid");
  await dialog(page).getByRole("button", { name: "Place bid" }).click(); // simulated, about a second
  await expect(dialog(page).getByRole("button", { name: "Placing bid…" })).toBeVisible();
  await backdrop(page);
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0, { timeout: 5_000 }); // it closes itself once the bid is in
  await expect(page.locator(".toast:not(.toast--static)")).toContainText("Bid placed");
});

test("the real demo bar: Restore's backdrop click sends no request", async ({ page }, info) => {
  once(info);
  const posts: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST") posts.push(r.url()); });
  await page.goto("/");
  const bar = page.locator('[data-demo-bar="page"]');
  if (!(await bar.locator("details").evaluate((d) => (d as unknown as { open: boolean }).open))) await bar.locator("summary").click();
  await bar.getByRole("button", { name: "Restore demo data" }).click();
  await expect(page.getByRole("dialog", { name: "Restore demo data?" })).toBeVisible();
  await page.waitForFunction("document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity)");
  await backdrop(page);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Restore demo data" })).toBeFocused();
  await page.waitForTimeout(500);
  expect(posts.filter((u) => u.includes("/api/demo"))).toEqual([]);
});
