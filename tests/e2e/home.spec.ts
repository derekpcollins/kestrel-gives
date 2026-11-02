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

  // No item lists on Home (SPEC §8), and no payment words anywhere on it.
  await expect(page.locator(".item-tile")).toHaveCount(0);
  expect(await page.locator("main").innerText()).not.toMatch(/\b(pay|paid|payment|checkout)\b/i);
});
