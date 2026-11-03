// Submit an Item and Edit item (SPEC §7.3; DECISIONS #93, #94, #98; Stage 5B). Other specs jump
// phases and read the seed meanwhile, so these never write to dev: the browser sees the phase
// and item each test needs, and each test answers uploads and saves itself, the way the API
// does. tests/db/employee-flows.test.ts covers the real saves and rules.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import { startingBidHelp, startingBidTooLow } from "../../src/components/item-form-rules.ts";

test.beforeEach(({}, info) => test.skip(info.project.name !== "light-1280" && info.project.name !== "light-390", "content is the same in every project; 390 checks the phone"));
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });

const WCAG_22_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
type Json = Record<string, any>;

/** The event in `phase`, viewed as the seed person with this id (3 is Jules, an employee; 1 is Maya, an admin). */
async function as(page: Page, viewerId: string, phase: "submission" | "live" | "ended"): Promise<void> {
  await page.context().addCookies([{ name: "kg_viewer", value: viewerId, url: "http://localhost:3000" }]);
  await page.route(/\/api\/app(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.event) body.event.phase = phase;
    await route.fulfill({ response, json: body });
  });
}

/** Answers POST /api/uploads with ids 7, 8, … and records each body's size and type. */
async function uploads(page: Page, answer: (n: number) => { status: number; json: Json } = (n) => ({ status: 201, json: { ok: true, id: String(6 + n), url: "/seed/placeholder-photo.png" } })) {
  const seen: { bytes: number; type: string | undefined }[] = [];
  await page.route(/\/api\/uploads\?purpose=photo$/, async (route) => {
    const request = route.request();
    seen.push({ bytes: request.postDataBuffer()?.byteLength ?? 0, type: request.headers()["content-type"] });
    const { status, json } = answer(seen.length);
    await route.fulfill({ status, json });
  });
  return seen;
}

/** Answers saves to /api/items (POST, PATCH, DELETE) and records them. */
async function saves(page: Page, answer: (route: Route) => { status: number; json: Json }) {
  const seen: { method: string; url: string; body: Json | null }[] = [];
  await page.route(/\/api\/items(\?id=\d+)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fallback();
    seen.push({ method: request.method(), url: request.url(), body: request.postData() ? JSON.parse(request.postData()!) : null });
    const { status, json } = answer(route);
    await route.fulfill({ status, json });
  });
  return seen;
}

/** A real picture, drawn in the page: `width` × `height`, as PNG. */
async function picture(page: Page, width: number, height: number): Promise<Buffer> {
  // A string, so this file needs no DOM types (the tests' tsconfig has none).
  const base64 = await page.evaluate<string>(`(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = ${width};
    canvas.height = ${height};
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#2a9d8f";
    ctx.fillRect(0, 0, ${width}, ${height});
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = "";
    for (const b of bytes) text += String.fromCharCode(b);
    return btoa(text);
  })()`);
  return Buffer.from(base64, "base64");
}

async function fillAuction(page: Page): Promise<void> {
  await page.getByLabel("Silent auction").check();
  await page.getByLabel("Title").fill("Kayak trip on the bay");
  await page.getByLabel("Description").fill("Half a day, two kayaks, snacks included.");
  await page.locator(".uploader__input").setInputFiles({ name: "kayak.png", mimeType: "image/png", buffer: await picture(page, 3000, 2000) });
  await expect(page.locator(".uploader__thumb")).toHaveCount(1);
}

test("employees submit during the submission window; the form starts from the event minimum", async ({ page }) => {
  await as(page, "3", "submission");
  await page.goto("/submit");
  const form = page.locator("[data-submit-form]");
  await expect(form).toBeVisible();
  await expect(page.getByLabel("Title")).toBeDisabled(); // until a sale type is chosen
  await expect(page.getByRole("group", { name: "What kind of sale is it?" })).toHaveAccessibleDescription("Choose one to fill in the rest.");
  await expect(page.locator('.site-header a[href="/submit"]')).toHaveAttribute("aria-current", "page"); // behind Menu at 390
  await page.getByLabel("Silent auction").check();
  await expect(page.getByLabel("Title")).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "Starting bid" })).toHaveValue("10");
  await expect(page.locator("#item-start-help")).toHaveText("At least $10, the event minimum. Whole dollars.");
  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(results.violations).toEqual([]);
});

test("while bidding is live, only admins can submit", async ({ page }) => {
  await as(page, "3", "live");
  await page.goto("/submit");
  await expect(page.locator("[data-submit-blocked]")).toContainText("Submissions are closed. Only admins can add items now.");
  await expect(page.locator("[data-submit-form]")).toBeHidden();

  await page.context().addCookies([{ name: "kg_viewer", value: "1", url: "http://localhost:3000" }]);
  await page.reload();
  await expect(page.locator("[data-submit-form]")).toBeVisible();
});

test("a large picture is resized to JPEG, 1600px on its long side, before upload", async ({ page }) => {
  await as(page, "3", "submission");
  await page.goto("/submit");
  await page.getByLabel("Silent auction").check();
  await page.locator(".uploader__input").setInputFiles({ name: "big.png", mimeType: "image/png", buffer: await picture(page, 4000, 3000) });
  const thumb = page.locator(".uploader__thumb");
  await expect(thumb).toHaveAttribute("alt", "Photo 1 of 1 (cover): big.png");
  const size = await thumb.evaluate(async (img: { decode(): Promise<void>; naturalWidth: number; naturalHeight: number }) => {
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  });
  expect(size).toEqual([1600, 1200]);
  await expect(page.locator(".uploader__status")).toHaveText("1 photo added. 1 of 5.");
});

test("a picture the browser can't read is refused with a clear message", async ({ page }) => {
  await as(page, "3", "submission");
  await page.goto("/submit");
  await page.getByLabel("Silent auction").check();
  await page.locator(".uploader__input").setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.alloc(64, 1) });
  await expect(page.locator(".uploader__problems")).toHaveText("“broken.png”: We couldn't read that picture. Try a JPEG, PNG or WebP.");
  await expect(page.locator(".uploader__thumb")).toHaveCount(0);
});

test("submitting uploads the photo, then saves the item in cents, then opens it with a toast", async ({ page }) => {
  await as(page, "3", "submission");
  const sent = await uploads(page);
  const saved = await saves(page, () => ({ status: 201, json: { ok: true, id: "3", message: "Thanks. Your item is in." } }));
  await page.goto("/submit");
  await fillAuction(page);
  await page.getByRole("textbox", { name: "Starting bid" }).fill("25");
  await page.getByRole("button", { name: "Submit item" }).click();
  await expect(page).toHaveURL(/\/items\/3$/);
  await expect(page.locator(".toast")).toContainText("Thanks. Your item is in.");
  expect(sent).toHaveLength(1);
  expect(sent[0]!.type).toBe("image/jpeg");
  expect(sent[0]!.bytes).toBeLessThan(4 * 1024 * 1024);
  expect(saved[0]!.body).toEqual({
    type: "auction", title: "Kayak trip on the bay", description: "Half a day, two kayaks, snacks included.",
    startingBidCents: 2_500, priceCents: null, quantity: null, photos: [{ uploadId: "7" }],
  });
});

test("an upload cap shows at the top of the form; a retry doesn't upload the same photo twice", async ({ page }) => {
  await as(page, "3", "submission");
  const message = "You've uploaded 10 pictures today, the most this demo allows each person in a day. Try again tomorrow.";
  let capped = true;
  const sent = await uploads(page, (n) => (capped ? { status: 429, json: { ok: false, code: "upload-cap", error: message } } : { status: 201, json: { ok: true, id: String(6 + n), url: "/x" } }));
  let failSave = true;
  const saved = await saves(page, () => (failSave ? { status: 500, json: { ok: false, error: "Something went wrong. Please try again." } } : { status: 201, json: { ok: true, id: "3", message: "Thanks. Your item is in." } }));
  await page.goto("/submit");
  await fillAuction(page);

  await page.getByRole("button", { name: "Submit item" }).click();
  const alert = page.locator(".item-form__alert");
  await expect(alert).toHaveText(message);
  await expect(alert).toBeFocused();
  await expect(page.getByRole("button", { name: "Submit item" })).not.toHaveAttribute("aria-busy");
  expect(saved).toHaveLength(0);

  capped = false;
  await page.getByRole("button", { name: "Submit item" }).click();
  await expect(alert).toHaveText("Something went wrong. Please try again.");
  failSave = false;
  await page.getByRole("button", { name: "Submit item" }).click();
  await expect(page).toHaveURL(/\/items\/3$/);
  expect(sent).toHaveLength(2); // the refused one, then one that worked and was reused
  expect(saved.map((s) => s.body!.photos)).toEqual([[{ uploadId: "8" }], [{ uploadId: "8" }]]);
});

test("problems the server finds show under their fields, with the summary", async ({ page }) => {
  await as(page, "3", "submission");
  await uploads(page);
  // The refusal is built from the same event minimum the page reads, as the server builds it.
  const min = ((await (await page.request.get("/api/app")).json()) as { event: { minStartingBidCents: number } }).event.minStartingBidCents;
  await saves(page, () => ({ status: 422, json: { ok: false, code: "invalid", error: "Check the highlighted fields.", problems: { startingBid: startingBidTooLow(min), title: "Use 80 characters or fewer." } } }));
  await page.goto("/submit");
  await fillAuction(page);
  await page.getByRole("button", { name: "Submit item" }).click();
  const summary = page.locator(".error-summary");
  await expect(summary).toBeFocused();
  await expect(summary).toContainText(`Starting bid: ${startingBidTooLow(min)}`);
  await expect(page.locator("#item-start-error")).toHaveText(startingBidTooLow(min));
  await expect(page.locator("#item-start-help")).toHaveText(startingBidHelp(min));
  await expect(page.getByRole("textbox", { name: "Starting bid" })).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#item-title-error")).toHaveText("Use 80 characters or fewer.");
});

/** The item page's answer for item 5, with what the test needs. */
async function item(page: Page, edit: (item: Json) => void): Promise<void> {
  await page.route(/\/api\/items\?id=5$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const body = await response.json();
    edit(body.item);
    await route.fulfill({ response, json: body });
  });
}

test("editing an item with bids: sale type and money are locked; no delete", async ({ page }) => {
  await as(page, "3", "live");
  await item(page, (it) => { it.submitter.id = "3"; it.hasActivity = true; it.cancelled = false; });
  const saved = await saves(page, () => ({ status: 200, json: { ok: true, id: "5", message: "Your changes are saved." } }));
  await page.goto("/items/5/edit");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Edit item");
  await expect(page.locator("[data-locked-note]")).toContainText("Locked: this item has bids or purchases.");
  // The chosen type stays clearly chosen; only the other one is greyed out, and it can't change.
  await expect(page.getByLabel("Silent auction")).toBeChecked();
  await expect(page.getByLabel("Silent auction")).toBeEnabled();
  await expect(page.getByLabel("Instant sale")).toBeDisabled();
  await page.getByLabel("Silent auction").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("Silent auction")).toBeChecked();
  await expect(page.getByRole("textbox", { name: "Starting bid" })).toBeDisabled();
  await expect(page.getByLabel("Title")).toBeEnabled();
  await expect(page.locator("[data-delete-section]")).toBeHidden();
  await expect(page.locator(".uploader__thumb").first()).toHaveAttribute("alt", /^Photo 1 of \d \(cover\): current photo$/);
  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(results.violations).toEqual([]);

  await page.getByLabel("Title").fill("Pottery class for two, Saturdays");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/items\/5$/);
  expect(saved[0]!.method).toBe("PATCH");
  expect(saved[0]!.body!.title).toBe("Pottery class for two, Saturdays");
  expect(saved[0]!.body!.photos.every((p: Json) => typeof p.photoId === "string")).toBe(true);
});

test("deleting an item with no activity asks first, then goes to Your Items with a toast", async ({ page }) => {
  await as(page, "3", "submission");
  await item(page, (it) => { it.submitter.id = "3"; it.hasActivity = false; it.cancelled = false; });
  const saved = await saves(page, () => ({ status: 200, json: { ok: true, id: "5", message: "Your item is deleted." } }));
  await page.goto("/items/5/edit");
  // Editing isn't Submit an Item: the link shows in the window, but no nav link is current.
  await expect(page.locator('.site-header a[href="/submit"]')).toHaveCount(1); // behind Menu at 390
  await expect(page.locator(".site-header [aria-current]")).toHaveCount(0);
  await expect(page.getByText("Choose one to fill in the rest.")).toBeHidden();
  await page.getByRole("button", { name: "Delete item" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("This removes the item and its photos from the auction. It can't be undone.");
  await dialog.getByRole("button", { name: "Keep item" }).click();
  expect(saved).toHaveLength(0);

  await page.getByRole("button", { name: "Delete item" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete item" }).click();
  await expect(page).toHaveURL(/\/your-items$/);
  await expect(page.locator(".toast")).toContainText("Your item is deleted.");
  expect(saved[0]!.method).toBe("DELETE");
});

test("someone else's item can't be edited; its page has no Edit link", async ({ page }) => {
  await as(page, "3", "live");
  await item(page, (it) => { it.submitter.id = "4"; it.cancelled = false; });
  await page.goto("/items/5/edit");
  await expect(page.locator("[data-submit-blocked]")).toContainText("Only the person who donated this item, or an admin, can change it.");
  await page.goto("/items/5");
  await expect(page.locator(".page-header__title")).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit item" })).toHaveCount(0);
});

test("the submitter sees Edit item on the item page", async ({ page }) => {
  await as(page, "3", "live");
  await item(page, (it) => { it.submitter.id = "3"; it.cancelled = false; });
  await page.goto("/items/5");
  await expect(page.getByRole("link", { name: "Edit item" })).toHaveAttribute("href", "/items/5/edit");
});

test("once bidding ends, nobody edits: no Edit link, and the edit page says why (#102)", async ({ page }) => {
  await as(page, "1", "ended"); // Maya, an admin: no exception
  await item(page, (it) => { it.submitter.id = "1"; it.cancelled = false; it.hasActivity = false; });
  await page.goto("/items/5");
  await expect(page.locator(".page-header__title")).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit item" })).toHaveCount(0);
  await page.goto("/items/5/edit");
  await expect(page.locator("[data-submit-blocked]")).toContainText("Bidding has ended, so this item can't be changed.");
  await expect(page.locator("[data-submit-form]")).toBeHidden();
  await expect(page.locator("[data-delete-section]")).toBeHidden();
});
