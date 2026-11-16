// Home (SPEC §8) against the real API on dev: the lockup, the headline as the h1 and the
// lead, How to participate in order, and the three charities from the database, with no item lists.
// Read-only, so it can run beside the other specs.
import { expect, test } from "@playwright/test";
import { pageLoaded } from "./page-load.ts";
import { runAxe } from "./axe.ts";

test.beforeEach(({}, info) => test.skip(info.project.name !== "light-1280", "content is the same in every project"));

test("Home: hero, how to participate, and the charities from the data", async ({ page }) => {
  await page.goto("/");
  await pageLoaded(page);
  const hero = page.locator(".hero");
  await expect(hero.getByRole("img", { name: "Kestrel Gives" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Make something. Give something.");
  await expect(hero.locator(".hero__lead")).toHaveText("Each year, Kestrel's designers donate things they make and do. Coworkers bid on them, and every dollar goes to three charities.");
  // No event label and none of the old instructional paragraphs (owner, visible changes B2).
  await expect(hero).not.toContainText("Kestrel Gives 2026");
  await expect(hero.locator("p")).toHaveCount(1);

  const steps = page.getByRole("region", { name: "How to participate" }).getByRole("listitem");
  await expect(steps.getByRole("heading")).toHaveText(["Submit an item", "Bid or buy", "Donate once", "Upload proof"]);
  await expect(steps.nth(3)).toContainText("within 7 days of the close"); // the seeded event's setting

  const charities = page.getByRole("region", { name: "Where donations go" });
  await expect(charities).toContainText("split equally among these three charities");
  await expect(charities.getByRole("heading", { level: 3 })).toHaveText(["Lantern Paws", "Lunchbox Brigade", "Saplingworks"]);
  await expect(charities.locator("[data-charities]")).not.toHaveAttribute("aria-busy");

  // Each charity's own logo (DECISIONS entry 130): decorative, since it spells the name the
  // heading repeats; loaded; and stacked above the name.
  const logos = charities.locator(".charity-card__logo");
  await expect(logos).toHaveCount(3);
  for (const [i, slug] of ["lantern-paws", "lunchbox-brigade", "saplingworks"].entries()) {
    await expect(logos.nth(i)).toHaveAttribute("alt", "");
    await expect(logos.nth(i)).toHaveAttribute("src", new RegExp(`/brand/charities/${slug}\\.png$`));
    await logos.nth(i).scrollIntoViewIfNeeded(); // they load lazily
    await expect.poll(() => logos.nth(i).evaluate((el) => { const img = el as unknown as { complete: boolean; naturalWidth: number }; return img.complete ? img.naturalWidth : 0; })).toBe(320);
  }
  const logoBox = await logos.first().boundingBox();
  const nameBox = await charities.getByRole("heading", { level: 3 }).first().boundingBox();
  expect(logoBox!.y + logoBox!.height).toBeLessThanOrEqual(nameBox!.y);

  // No item lists on Home (SPEC §8), and no payment words anywhere on it.
  await expect(page.locator(".item-tile")).toHaveCount(0);
  expect(await page.locator("main").innerText()).not.toMatch(/\b(pay|paid|payment|checkout)\b/i);
});

// Visible changes B2: one centered column, top to bottom the lockup, the h1, the lead. The
// headline is the largest text, the lockup's words aren't, and the lead is a step above body.
for (const width of [390, 1280]) {
  test(`Home hero at ${width}: centered, in order, the headline the largest text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await pageLoaded(page);
    const box = async (sel: string) => (await page.locator(sel).filter({ visible: true }).first().boundingBox())!;
    const [mark, words, title, lead] = [await box(".lockup__mark"), await box(".lockup__words"), await box(".hero__title"), await box(".hero__lead")];
    expect(mark.y + mark.height).toBeLessThanOrEqual(words.y);
    expect(words.y + words.height).toBeLessThanOrEqual(title.y);
    expect(title.y + title.height).toBeLessThanOrEqual(lead.y);
    const center = (await box("main")).x + (await box("main")).width / 2;
    for (const b of [mark, words, title, lead]) expect(Math.abs(b.x + b.width / 2 - center)).toBeLessThanOrEqual(2);
    const style = (sel: string) => page.evaluate(`(() => { const s = getComputedStyle(document.querySelector("${sel}")); return [parseFloat(s.fontSize), s.textAlign]; })()`) as Promise<[number, string]>;
    const [titleSize, titleAlign] = await style(".hero__title");
    const [wordsSize] = await style(".lockup__words");
    const [leadSize, leadAlign] = await style(".hero__lead");
    const [bodySize] = await style(".steps__text");
    expect(titleSize).toBeGreaterThan(wordsSize);
    expect(leadSize).toBeGreaterThan(bodySize);
    expect(leadSize).toBeLessThan(wordsSize);
    expect([titleAlign, leadAlign]).toEqual(["center", "center"]);
  });
}

// At 320, the narrowest width, each sentence of the headline stays on one line (owner, B2 review).
test("Home at 320: each sentence of the headline is one line", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await pageLoaded(page);
  const lines = await page.evaluate(`[...document.querySelectorAll(".hero__line")].map((s) => s.getClientRects().length)`);
  expect(lines).toEqual([1, 1]);
});

// At 390 How to participate starts on the first screen, under the demo bar, header and banner.
test("Home at 390: How to participate starts on the first screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await pageLoaded(page);
  const heading = (await page.getByRole("heading", { level: 2, name: "How to participate" }).boundingBox())!;
  expect(heading.y + heading.height).toBeLessThanOrEqual(844);
});


// SPEC v1.17 §7.8: after a Reset on the shared demo, Home offers Restore right away. The app
// state is the real one with demoReset set, and Restore is stubbed, so nothing writes.
test("after a Reset, Home offers Restore demo data above the hero; once restored it's gone and focus is on the h1", async ({ page }) => {
  let restored = false;
  await page.route(/\/api\/app$/, async (route) => {
    const app = await (await route.fetch()).json();
    return route.fulfill({ json: { ...app, demoReset: !restored, event: restored ? app.event : { ...app.event, name: "Kestrel Gives 2027" } } });
  });
  await page.route(/\/api\/demo$/, async (route) => {
    restored = true;
    const app = await (await route.fetch({ url: "http://localhost:3000/api/app", method: "GET" })).json();
    return route.fulfill({ json: { ...app, demoReset: false } });
  });
  await page.goto("/?demo=off");
  await pageLoaded(page);
  const offer = page.getByRole("region", { name: "The demo was reset for next year" });
  await expect(offer.getByRole("heading", { level: 2 })).toBeVisible();
  await expect(offer).toContainText("Kestrel Gives 2027 has no items or dates yet");
  await expect(offer).not.toContainText("Event settings");
  expect(await page.locator("main > *").first().getAttribute("data-reset-offer")).toBe("");
  const { violations } = await runAxe(page);
  expect(violations.map((v) => v.id)).toEqual([]);
  // The demo bar is hidden (?demo=off), and the offer still restores through the same dialog.
  await offer.getByRole("button", { name: "Restore demo data" }).click();
  await page.getByRole("dialog", { name: "Restore demo data?" }).getByRole("button", { name: "Restore demo data" }).click();
  await expect(page.getByText("Demo data restored.")).toBeVisible();
  await expect(page.locator("[data-reset-offer]")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Make something. Give something." })).toBeFocused();
});
