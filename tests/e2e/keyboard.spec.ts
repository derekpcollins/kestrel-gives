// Part of conformance check 3 (SPEC §6, §12): components work with a keyboard alone and
// tell screen readers what changed. Runs in check:a11y, at one size (behavior doesn't
// depend on the color scheme or width).
import { expect, test } from "@playwright/test";

test.beforeEach(({}, info) => test.skip(info.project.name !== "light-1280", "behavior is the same in every project"));

const png = (name: string, size = 64) => ({ name, mimeType: "image/png", buffer: Buffer.alloc(size, 1) });

test("submit-an-item demo: sale type unlocks the form; errors are summarized and linked", async ({ page }) => {
  await page.goto("/design-system/#demo");
  const form = page.locator("#demo-form");
  await expect(form.locator("#demo-title-input")).toBeDisabled(); // inside the disabled fieldset

  // Submitting with nothing chosen: the summary takes focus and names the sale type.
  await form.getByRole("button", { name: "Submit item" }).press("Enter");
  const summary = form.locator(".error-summary");
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("1 field needs attention");
  await expect(summary).toContainText("Choose a sale type.");

  // Arrow keys choose a card (native radios); the rest unlocks.
  await form.locator("#demo-type-auction").focus();
  await page.keyboard.press("Space");
  await expect(form.locator("#demo-title-input")).toBeEnabled();

  // Cents in a money field.
  await form.locator("#demo-start").fill("12.50");
  await form.getByRole("button", { name: "Submit item" }).click();
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("Title: Enter a title.");
  await expect(summary).toContainText("Starting bid: Whole dollars only.");
  await expect(summary).toContainText("Photos: Add at least one photo.");
  await expect(form.locator("#demo-start")).toHaveAttribute("aria-invalid", "true");

  // Summary links move focus to the field.
  await summary.getByRole("link", { name: /Starting bid/ }).press("Enter");
  await expect(form.locator("#demo-start")).toBeFocused();

  // Below the minimum, then fixed: the message updates, then clears.
  await form.locator("#demo-start").fill("8");
  await form.locator("#demo-start").blur();
  await expect(form.locator("#demo-start-error")).toHaveText("Enter at least $10.");
  await form.locator("#demo-start").fill("25");
  await form.locator("#demo-start").blur();
  await expect(form.locator("#demo-start-error")).toHaveCount(0);
  await expect(form.locator("#demo-start")).not.toHaveAttribute("aria-invalid");
});

test("photo uploader: reorder and remove with the keyboard, with announcements", async ({ page }) => {
  await page.goto("/design-system/#demo");
  const form = page.locator("#demo-form");
  await form.locator("#demo-type-auction").check();
  const uploader = form.locator("[data-uploader]");

  await uploader.locator(".uploader__input").setInputFiles([png("a.png"), png("b.png"), png("c.png")]);
  const thumbs = uploader.locator(".uploader__thumb");
  await expect(thumbs).toHaveCount(3);
  await expect(thumbs.nth(0)).toHaveAttribute("alt", "Photo 1 of 3 (cover): a.png");
  await expect(uploader.locator(".uploader__status")).toHaveText("3 photos added. 3 of 5.");

  // Every thumbnail control is a full-size target (--size-target, 44px).
  for (const box of await uploader.locator(".uploader__actions .btn").evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height }; }))) {
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  }

  // Move the cover right: focus follows the photo, and the change is announced.
  await uploader.getByRole("button", { name: "Move photo 1 right" }).press("Enter");
  await expect(thumbs.nth(0)).toHaveAttribute("alt", "Photo 1 of 3 (cover): b.png");
  await expect(thumbs.nth(1)).toHaveAttribute("alt", "Photo 2 of 3: a.png");
  await expect(uploader.getByRole("button", { name: "Move photo 2 right" })).toBeFocused();
  await expect(uploader.locator(".uploader__status")).toHaveText("Moved to photo 2 of 3.");

  // At the end, focus switches to the button that can still move it.
  await page.keyboard.press("Enter");
  await expect(thumbs.nth(2)).toHaveAttribute("alt", "Photo 3 of 3: a.png");
  await expect(uploader.getByRole("button", { name: "Move photo 3 left" })).toBeFocused();

  // Remove: focus goes to the next remove button (or the last one).
  await uploader.getByRole("button", { name: "Remove photo 3" }).press("Enter");
  await expect(thumbs).toHaveCount(2);
  await expect(uploader.getByRole("button", { name: "Remove photo 2" })).toBeFocused();

  // Wrong type, too large, and more than five.
  await uploader.locator(".uploader__input").setInputFiles([
    { name: "scan.gif", mimeType: "image/gif", buffer: Buffer.alloc(8) },
    png("huge.png", 5 * 1024 * 1024),
    png("d.png"), png("e.png"), png("f.png"), png("g.png"),
  ]);
  await expect(thumbs).toHaveCount(5);
  const problems = uploader.locator(".uploader__problems");
  await expect(problems).toContainText("“scan.gif” isn't a JPEG, PNG or WebP image.");
  await expect(problems).toContainText("“huge.png” is larger than 4 MB.");
  await expect(problems).toContainText("You can add up to 5 photos. 1 photo wasn't added.");
  await expect(uploader).toHaveClass(/uploader--full/);
  await expect(uploader.locator(".uploader__count")).toHaveText("5 of 5 photos. Remove one to add another.");
});
