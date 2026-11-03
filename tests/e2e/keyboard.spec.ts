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

test("skip link is the first tab stop and moves focus to main", async ({ page }) => {
  await page.goto("/design-system/");
  await page.keyboard.press("Tab");
  const skip = page.locator("body > .skip-link");
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});

test("collapsed nav: Menu opens the links; Escape and outside clicks close it", async ({ page }) => {
  await page.goto("/design-system/#site-header");
  const nav = page.locator('nav[aria-label="Main (hnl)"]');
  const button = nav.getByRole("button", { name: "Menu" });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(nav.getByRole("link", { name: "Silent Auction" })).toBeHidden();

  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(nav.getByRole("link", { name: "Home" })).toBeFocused();
  await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");

  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toBeFocused();

  await button.click();
  await page.locator(".gallery__header h1").click();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toBeFocused(); // the click landed on nothing focusable
});

test("profile menu: a disclosure of links; Escape, outside clicks and tabbing out close it", async ({ page }) => {
  await page.goto("/design-system/#site-header");
  const menu = page.locator(".site-header:not([data-static]) .profile-menu").first();
  const button = menu.getByRole("button", { name: "Maya Okafor, admin" });
  const panel = menu.locator(".profile-menu__panel");
  await expect(menu.locator('[role="menu"], [role="menuitem"]')).toHaveCount(0);
  await expect(panel).toBeHidden();

  await button.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("link", { name: "Admin Dashboard" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(button).toBeFocused();

  await button.click();
  await page.locator(".gallery__header h1").click();
  await expect(panel).toBeHidden();
  await expect(button).toBeFocused();

  await button.press("Enter");
  await page.keyboard.press("Tab"); // to the link
  await page.keyboard.press("Tab"); // out of the menu
  await expect(panel).toBeHidden();
});

test("demo bar: announces who you're viewing as and the phase; restore raises an event", async ({ page }) => {
  await page.goto("/design-system/#demo-bar");
  const bar = page.locator('[data-demo-bar="specimen"]').first();
  await bar.getByLabel("Viewing as").selectOption({ label: "Dev Kapoor (employee)" });
  await expect(bar.locator(".demo-bar__status")).toHaveText("Now viewing as Dev Kapoor (employee)");
  await expect(bar.locator(".demo-bar__who")).toHaveText("Viewing as Dev Kapoor (employee)");

  const ended = bar.getByRole("button", { name: "Bidding ended" });
  await ended.click();
  await expect(ended).toHaveAttribute("aria-pressed", "true");
  await expect(bar.getByRole("button", { name: "Bidding live" })).toHaveAttribute("aria-pressed", "false");

  // What Restore opens is covered by "demo bar's Restore opens the danger dialog".
});

test("demo bar: collapsed state is remembered, and ?demo=off removes the page's bar", async ({ page }) => {
  // A page-level bar, built on the gallery page for the test.
  // Runs in the page as a module, so this file needs no DOM types (DECISIONS #26).
  const addBar = async () => {
    await page.addScriptTag({ type: "module", content: `
      import { enhanceDemoBar } from "/js/components/demo-bar.js";
      const bar = document.querySelector('[data-demo-bar="specimen"]').cloneNode(true);
      bar.dataset.demoBar = "page";
      document.body.prepend(bar);
      enhanceDemoBar(bar);
      document.body.dataset.barReady = String(Number(document.body.dataset.barReady ?? 0) + 1);
    ` });
    await expect(page.locator("body[data-bar-ready]")).toHaveCount(1);
  };
  await page.goto("/design-system/");
  await page.addScriptTag({ content: 'localStorage.removeItem("kestrel-demo-bar-collapsed")' });
  await addBar();
  const pageBar = page.locator('[data-demo-bar="page"]');
  await pageBar.locator("summary").click(); // collapse
  await expect(pageBar.locator("details")).not.toHaveAttribute("open");
  // The <details> toggle event is async; wait for it to be saved before reloading.
  await expect.poll(() => page.evaluate('localStorage.getItem("kestrel-demo-bar-collapsed")')).toBe("true");
  await page.reload();
  await addBar();
  await expect(page.locator('[data-demo-bar="page"] details')).not.toHaveAttribute("open");

  await page.goto("/design-system/?demo=off");
  await addBar();
  await expect(page.locator('[data-demo-bar="page"]')).toHaveCount(0);
  await expect(page.locator('[data-demo-bar="specimen"]')).toHaveCount(2);
});

test("confirm dialog: modal, Escape closes, focus returns; Escape waits while the request runs", async ({ page }) => {
  await page.goto("/design-system/#dialogs");
  const trigger = page.locator('[data-demo-dialog="bid"]');
  await trigger.click();
  const dialog = page.locator("dialog.dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => el.matches(":modal"))).toBe(true);
  await expect(dialog.getByRole("heading", { name: "Place a $65 bid?" })).toBeVisible(); // $60 top bid + $5 increment
  await expect(dialog.getByRole("button", { name: "Place bid" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.press("Enter");
  await page.keyboard.press("Enter"); // confirm
  await expect(dialog.getByRole("button", { name: "Placing bid…" })).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible(); // still running
  await expect(dialog).toHaveCount(0, { timeout: 5000 });
  await expect(trigger).toBeFocused();
  await expect(page.locator(".toast-region")).toContainText("Bid placed.");
});

test("confirm dialog: a failed request shows the reason and stays open", async ({ page }) => {
  await page.goto("/design-system/#dialogs");
  await page.locator('[data-demo-dialog="bid-fail"]').click();
  const dialog = page.locator("dialog.dialog");
  await dialog.getByRole("button", { name: "Place bid" }).click();
  await expect(dialog.locator(".dialog__error")).toHaveText("Someone just bid $65. The minimum is now $70.", { timeout: 5000 });
  await expect(dialog.getByRole("button", { name: "Place bid" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("danger dialog starts on the safe button; type-to-confirm needs the exact event name", async ({ page }) => {
  await page.goto("/design-system/#dialogs");
  await page.locator('[data-demo-dialog="cancel"]').click();
  const dialog = page.locator("dialog.dialog");
  await expect(dialog.getByRole("button", { name: "Keep item" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);

  const reset = page.locator('[data-demo-dialog="reset"]');
  await reset.click();
  const input = dialog.getByLabel("Type Kestrel Gives 2026 to confirm");
  const confirm = dialog.getByRole("button", { name: "Reset for next year" });
  await expect(input).toBeFocused();
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await input.fill("kestrel gives 2026");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await input.fill("Kestrel Gives 2026 ");
  await expect(confirm).toHaveAttribute("aria-disabled", "true"); // exactly, no extra space
  await input.fill("Kestrel Gives 2026");
  await expect(confirm).not.toHaveAttribute("aria-disabled");
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0, { timeout: 5000 });
  await expect(reset).toBeFocused();
});

test("demo bar's Restore opens the danger dialog", async ({ page }) => {
  await page.goto("/design-system/#demo-bar");
  const restore = page.locator('[data-demo-bar="specimen"]').first().getByRole("button", { name: "Restore demo data" });
  await restore.click();
  await expect(page.locator("dialog.dialog--danger")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(restore).toBeFocused();
});

test("carousel: buttons and thumbnails move; current thumbnail marked; ends inactive; changes announced", async ({ page }) => {
  await page.goto("/design-system/#carousel");
  const carousel = page.locator("[data-carousel]").first();
  const prev = carousel.getByRole("button", { name: "Previous photo" });
  const next = carousel.getByRole("button", { name: "Next photo" });
  const count = carousel.locator(".carousel__count");
  await expect(prev).toHaveAttribute("aria-disabled", "true");
  await expect(carousel.getByRole("button", { name: "Photo 1 of 5" })).toHaveAttribute("aria-current", "true");

  await next.press("Enter");
  await expect(count).toHaveText("Photo 2 of 5");
  await expect(count).toHaveAttribute("aria-live", "polite");
  await expect(carousel.getByRole("button", { name: "Photo 2 of 5" })).toHaveAttribute("aria-current", "true");
  await expect(carousel.getByRole("button", { name: "Photo 1 of 5" })).not.toHaveAttribute("aria-current");
  await expect(carousel.getByRole("img", { name: "Photo 2 of 5 (placeholder)" })).toBeVisible();

  await carousel.getByRole("button", { name: "Photo 5 of 5" }).click();
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await next.press("Enter"); // press, not click: Playwright won't click an aria-disabled button
  await expect(count).toHaveText("Photo 5 of 5");
  await expect(page.locator("[data-carousel]").nth(1).locator(".carousel__nav").first()).toBeHidden(); // single photo
});

test("item tiles: words come from the rules; cancelled only in Your Items", async ({ page }) => {
  await page.goto("/design-system/#item-tiles");
  const live = page.locator('[data-tiles="live-auction"]').first();
  await expect(live.getByRole("link", { name: "Lakeside Cabin Weekend" })).toBeVisible();
  const cabin = live.locator(".item-tile").filter({ hasText: "Lakeside Cabin Weekend" });
  await expect(cabin.locator(".item-tile__amount")).toHaveText("$240"); // only the number takes the amount style
  await expect(cabin.locator(".item-tile__detail")).toHaveText(/^Top bid · \d+ bids$/);
  await expect(live).toContainText("Starting bid · No bids yet");
  // Chrome's name computation puts a space before the visually hidden ", Status"; speech is the same.
  await expect(live.getByRole("link", { name: "Sourdough starter and a loaf a month, Outbid", exact: true })).toBeVisible();
  await expect(live.getByRole("link", { name: /^Bike tune-up at your desk ?, Ending soon$/ })).toBeVisible();
  await expect(page.locator('[data-tiles="live-instant"]').first()).toContainText("2 left");
  const ended = page.locator('[data-tiles="ended"]').first();
  for (const label of ["You won", "Ended", "Sold out"]) await expect(ended.locator(".item-tile__status", { hasText: label }).first()).toBeVisible();
  await expect(page.locator('.item-tile__status:text-is("Cancelled")')).toHaveCount(2); // the cancelled group, light and dark
  await expect(page.locator('[data-tiles]:not([data-tiles="cancelled"]) .item-tile__status:text-is("Cancelled")')).toHaveCount(0);
});

test("table: the scroll region joins the tab order only while it scrolls", async ({ page }) => {
  await page.goto("/design-system/#tables");
  const wrap = page.locator("[data-table-scroll]").first();
  // Resize the region itself so the test doesn't depend on the gallery's layout.
  type Styled = { style: { width: string; maxWidth: string } };
  await wrap.evaluate((el) => { const s = (el as unknown as Styled).style; s.maxWidth = "none"; s.width = "200rem"; });
  await expect(wrap).not.toHaveAttribute("tabindex");
  await wrap.evaluate((el) => { (el as unknown as Styled).style.width = "10rem"; });
  await expect(wrap).toHaveAttribute("tabindex", "0");
});
