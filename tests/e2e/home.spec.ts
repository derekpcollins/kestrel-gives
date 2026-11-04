// Home (SPEC §8) against the real API on dev: the lockup as the h1, the description, How
// to participate in order, and the three charities from the database, with no item lists.
// Read-only, so it can run beside the other specs.
import { expect, test } from "@playwright/test";

test.beforeEach(({}, info) => test.skip(info.project.name !== "light-1280", "content is the same in every project"));

test("Home: hero, how to participate, and the charities from the data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Kestrel Gives" })).toBeVisible();
  await expect(page.locator("[data-event-name]")).toHaveText("Kestrel Gives 2026");

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

test("Home on a phone: the description is left-aligned; only the overline is centered", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("[data-event-name]")).toBeVisible();
  const align = (sel: string) => page.evaluate(`getComputedStyle(document.querySelector("${sel}")).textAlign`);
  expect(await align(".hero__lead")).toMatch(/^(start|left)$/);
  expect(await align(".hero__more")).toMatch(/^(start|left)$/);
  expect(await align(".hero__event")).toBe("center");
});


// SPEC v1.17 §7.8: after a Reset on the shared demo, Home offers Restore right away. The app
// state is the real one with demoReset set, and Restore is stubbed, so nothing writes.
test("after a Reset, Home offers Restore demo data above the hero; once restored it's gone and focus is on the h1", async ({ page }) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
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
  const offer = page.getByRole("region", { name: "The demo was reset for next year" });
  await expect(offer.getByRole("heading", { level: 2 })).toBeVisible();
  await expect(offer).toContainText("Kestrel Gives 2027 has no items or dates yet");
  await expect(offer).not.toContainText("Event settings");
  expect(await page.locator("main > *").first().getAttribute("data-reset-offer")).toBe("");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  // The demo bar is hidden (?demo=off), and the offer still restores through the same dialog.
  await offer.getByRole("button", { name: "Restore demo data" }).click();
  await page.getByRole("dialog", { name: "Restore demo data?" }).getByRole("button", { name: "Restore demo data" }).click();
  await expect(page.getByText("Demo data restored.")).toBeVisible();
  await expect(page.locator("[data-reset-offer]")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Kestrel Gives" })).toBeFocused();
});
