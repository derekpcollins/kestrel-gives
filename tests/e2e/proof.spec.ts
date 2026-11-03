// Upload donation proof and the giving stub (SPEC §7.6, §3; DECISIONS #95, #103; Stage 5D).
// Other specs jump phases on dev meanwhile, so these never write: the phase is set in the
// browser, the proof part of /api/me is stubbed, and uploads and proofs are answered here.
// tests/db/employee-flows.test.ts covers the real POST /api/proofs.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(({}, info) => test.skip(info.project.name !== "light-1280" && info.project.name !== "light-390", "content is the same in every project; 390 checks the phone"));
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });

const WCAG_22_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
type Json = Record<string, any>;

async function as(page: Page, viewerId: string, phase: "submission" | "live" | "ended"): Promise<void> {
  await page.context().addCookies([{ name: "kg_viewer", value: viewerId, url: "http://localhost:3000" }]);
  await page.route(/\/api\/app(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.event) body.event.phase = phase;
    await route.fulfill({ response, json: body });
  });
}

/** Replaces the proof part of the real /api/me answer. */
async function proof(page: Page, view: (now: string) => Json): Promise<void> {
  await page.route(/\/api\/me$/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.phase = "ended";
    body.proof = view(body.now);
    await route.fulfill({ response, json: body });
  });
}

const owes = (now: string, over: Json = {}) => ({
  totalCents: 3_500, latest: null, totalChanged: false, blocked: null,
  deadline: new Date(new Date(now).getTime() + 6.5 * 86_400_000).toISOString(), ...over,
});

/** Answers the screenshot upload and the proof, and records them. */
async function sends(page: Page, answer: (n: number) => { status: number; json: Json } = () => ({ status: 201, json: { ok: true, message: "Thanks. Your proof is in, and an admin will review it." } })) {
  const seen = { uploads: [] as string[], proofs: [] as Json[] };
  await page.route(/\/api\/uploads\?purpose=proof$/, async (route) => {
    seen.uploads.push(route.request().headers()["content-type"] ?? "");
    await route.fulfill({ status: 201, json: { ok: true, id: String(40 + seen.uploads.length), url: "/seed/proofs/placeholder-proof.png" } });
  });
  await page.route(/\/api\/proofs$/, async (route) => {
    seen.proofs.push(JSON.parse(route.request().postData() ?? "{}"));
    const { status, json } = answer(seen.proofs.length);
    await route.fulfill({ status, json });
  });
  return seen;
}

/** A small real PNG, drawn in the page (the tests' tsconfig has no DOM types). */
async function receipt(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate<string>(`(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 600; canvas.height = 900;
    canvas.getContext("2d").fillRect(0, 0, 600, 900);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = "";
    for (const b of bytes) text += String.fromCharCode(b);
    return btoa(text);
  })()`);
  return Buffer.from(base64, "base64");
}

const form = (page: Page) => page.locator("[data-proof-body]:not([hidden]):not([aria-busy])");

test("the form starts at the total, warns below it, needs a screenshot, then sends both", async ({ page }) => {
  await as(page, "7", "ended");
  await proof(page, (now) => owes(now));
  const seen = await sends(page);
  await page.goto("/your-items/proof");
  await expect(form(page)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Upload donation proof");
  await expect(page.locator("[data-proof-total]")).toHaveText("Your donation total is $35. 6 days left to upload proof.");
  await expect(page.getByRole("link", { name: "Go to the giving page" })).toHaveAttribute("href", "/giving");
  await expect(page.locator("#proof-demo-note")).toHaveText("This is a demo. Don't upload a real receipt or personal details.");
  await expect(page.locator('.site-header a[href="/your-items"]')).toHaveAttribute("aria-current", "page");

  const amount = page.getByLabel("Amount you donated");
  await expect(amount).toHaveValue("35");
  await expect(page.locator("[data-proof-amount-note]")).toBeHidden();
  await amount.fill("20");
  await expect(page.locator("[data-proof-amount-note]")).toHaveText("That's less than your $35 donation total. You can still submit; an admin will review it.");
  await expect(amount).not.toHaveAttribute("aria-invalid", "true");

  // No screenshot yet: the browser check says so and nothing is sent.
  await page.getByRole("button", { name: "Upload proof" }).click();
  await expect(page.locator(".error-summary")).toContainText("Add a screenshot.");
  expect(seen.uploads).toHaveLength(0);

  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(results.violations).toEqual([]);

  await page.locator("#proof-shot").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: await receipt(page) });
  await expect(page.getByRole("img", { name: "Screenshot: receipt.png" })).toBeVisible();
  await expect(page.locator(".uploader__count")).toHaveText("Screenshot added. Remove it to choose a different one.");
  await expect(page.getByRole("button", { name: "Remove screenshot" })).toBeVisible();
  await expect(page.locator(".uploader__item button")).toHaveCount(1);

  await page.getByRole("button", { name: "Upload proof" }).click();
  await page.waitForURL("**/your-items");
  expect(seen.uploads).toEqual(["image/jpeg"]);
  expect(seen.proofs).toEqual([{ amountCents: 2_000, uploadId: "41" }]);
  await expect(page.getByText("Thanks. Your proof is in, and an admin will review it.")).toBeVisible();
});

test("a rejected proof shows its reason; an amount the server refuses shows under the field, and the retry reuses the upload", async ({ page }) => {
  await as(page, "7", "ended");
  await proof(page, (now) => owes(now, { latest: { status: "rejected", amountCents: 3_500, owedCents: 3_500, rejectionReason: "The screenshot doesn't show the amount.", createdAt: now, imageUrl: "/seed/proofs/placeholder-proof.png" } }));
  const seen = await sends(page, (n) => n === 1
    ? { status: 422, json: { ok: false, code: "bad-amount", field: "amount", error: "Enter $100,000 or less." } }
    : { status: 201, json: { ok: true, message: "Thanks. Your proof is in, and an admin will review it." } });
  await page.goto("/your-items/proof");
  const note = page.locator("[data-proof-notes] .banner--danger");
  await expect(note).toContainText("Your last proof was rejected");
  await expect(note).toContainText("Reason: The screenshot doesn't show the amount.");

  await page.locator("#proof-shot").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: await receipt(page) });
  await expect(page.getByRole("img", { name: "Screenshot: receipt.png" })).toBeVisible();
  await page.getByRole("button", { name: "Upload proof" }).click();
  await expect(page.locator(".field:has(#proof-amount) .field__message--error")).toHaveText("Enter $100,000 or less.");
  await expect(page.getByLabel("Amount you donated")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Amount you donated").fill("35");
  await page.getByRole("button", { name: "Upload proof" }).click();
  await page.waitForURL("**/your-items");
  expect(seen.uploads).toHaveLength(1);
  expect(seen.proofs.map((p) => p.uploadId)).toEqual(["41", "41"]);
});

test("someone with nothing to prove sees why instead of the form", async ({ page }) => {
  await as(page, "3", "live");
  await proof(page, () => ({ totalCents: 0, latest: null, deadline: null, totalChanged: false, blocked: { code: "nothing-owed", message: "You don't have a donation total yet." } }));
  await page.goto("/your-items/proof");
  const blocked = page.locator("[data-proof-blocked]");
  await expect(blocked).toBeVisible();
  await expect(blocked.getByRole("heading")).toHaveText("You don't have a donation total yet.");
  await expect(page.locator("[data-proof-form]")).toBeHidden();
  // The info icon (a circle), not a check mark: nothing is done yet.
  await expect(blocked.locator(".empty__icon circle")).toHaveCount(1);
  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(results.violations).toEqual([]);
});

test("an approved proof for the current total gets the check mark", async ({ page }) => {
  await as(page, "4", "ended");
  await proof(page, (now) => ({ totalCents: 3_500, latest: { status: "approved", amountCents: 3_500, owedCents: 3_500, rejectionReason: null, createdAt: now, imageUrl: "/seed/proofs/placeholder-proof.png" }, deadline: null, totalChanged: false, blocked: { code: "approved", message: "Your proof is approved. Thank you!" } }));
  await page.goto("/your-items/proof");
  const blocked = page.locator("[data-proof-blocked]");
  await expect(blocked.getByRole("heading")).toHaveText("Your proof is approved. Thank you!");
  await expect(blocked.locator(".empty__icon path")).toHaveCount(1);
  await expect(blocked.locator(".empty__icon circle")).toHaveCount(0);
});

test("a failed load says so and Try again recovers", async ({ page }) => {
  await as(page, "7", "ended");
  let fail = true;
  await page.route(/\/api\/me$/, (route) => (fail ? route.fulfill({ status: 500, json: { ok: false, error: "Something went wrong." } }) : route.fallback()));
  await page.goto("/your-items/proof");
  const failed = page.locator("[data-proof-error]");
  await expect(failed).toBeVisible();
  fail = false;
  await failed.getByRole("button", { name: "Try again" }).click();
  await expect(failed).toBeHidden();
});

test("the giving stub explains the one donation page split three ways and links to proof", async ({ page }) => {
  await as(page, "7", "ended");
  await proof(page, (now) => owes(now));
  await page.goto("/giving");
  await expect(page.locator("[data-giving-total]")).toHaveText("Your total: $35");
  await expect(page.locator("main")).toContainText("Give that total once on the donation page. There's no charity to choose.");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Giving page");
  await expect(page.locator("main")).toContainText("no money moves");
  await expect(page.locator("[data-charities]:not([aria-busy]) .charity-card")).toHaveCount(3);
  await expect(page.getByRole("main").getByRole("link", { name: "Upload proof" })).toHaveAttribute("href", "/your-items/proof");
  await expect(page.locator(".site-header [aria-current=page]")).toHaveCount(0);
  expect(await page.locator("main").innerText()).not.toMatch(/\b(pay|paid|payment|checkout)\b/i);
  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(results.violations).toEqual([]);
});

test("the giving stub follows the demo bar: nothing owed hides Upload proof and says why", async ({ page }) => {
  await as(page, "7", "ended");
  // Owen owes $35 here; anyone else owes nothing. Switching person in the demo bar changes the cookie.
  await page.route(/\/api\/me$/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const owen = /kg_viewer=7\b/.test(route.request().headers()["cookie"] ?? "");
    body.proof = owen ? owes(body.now) : { totalCents: 0, latest: null, deadline: null, totalChanged: false, blocked: { code: "nothing-owed", message: "You don't have a donation total yet." } };
    await route.fulfill({ response, json: body });
  });
  await page.goto("/giving");
  const main = page.getByRole("main");
  await expect(page.locator("[data-giving-total]")).toHaveText("Your total: $35");
  await expect(main.getByRole("link", { name: "Upload proof" })).toBeVisible();
  await expect(page.locator("[data-giving-none]")).toBeHidden();

  const details = page.locator("[data-shell-demo] details");
  if ((await details.getAttribute("open")) === null) await details.locator("summary").click(); // collapsed below 40rem
  await page.getByLabel("Viewing as").selectOption({ label: "Dev Kapoor (employee)" });
  await expect(page.locator(".demo-bar__who")).toContainText("Dev Kapoor");
  await expect(page.locator("[data-giving-total]")).toHaveText("Your total: $0");
  await expect(main).toContainText("You don't owe anything yet. Bid or buy to have a total.");
  await expect(main.getByRole("link", { name: "Upload proof" })).toHaveCount(0);
  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(results.violations).toEqual([]);
});
