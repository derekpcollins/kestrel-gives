// Conformance check 6 (SPEC §12.6): full-page screenshots for a person to review, light and
// dark at 390px and 1280px, with demo controls hidden (?demo=off). Nothing is compared
// automatically.
//
// "In every seeded state" (DECISIONS entry 121): every screen as seeded (live), then each other
// phase and the "just reset" state on the screens that phase changes, not the full
// cross-product. Each state test sets its own state (Restore, then Jump to or a real Reset as
// Maya) and Restore runs after the last, so the tests share the one dev database and must run
// one at a time: `npm run check:visual` passes --workers=1.
import { test, type APIRequestContext, type Page } from "@playwright/test";
import { SCREENS, viewAs, type Screen } from "./screens.ts";

type State = "live" | "submission" | "ending-soon" | "ended" | "after" | "reset";

const screen = (name: string): Screen => {
  const found = SCREENS.find((s) => s.name === name);
  if (!found) throw new Error(`No screen named ${name}`);
  return found;
};
const pick = (...names: string[]) => names.map(screen);

/** The screens each state changes (the owner's set, Milestone 7 answer 3). */
const STATES: Record<Exclude<State, "live">, readonly Screen[]> = {
  submission: pick("home", "silent-auction", "instant-sale", "item-auction", "item-instant", "submit", "item-edit", "your-items", "proof", "giving", "admin-totals", "admin-items", "admin-settings"),
  "ending-soon": pick("home", "silent-auction", "item-auction", "your-items"),
  ended: pick("home", "silent-auction", "instant-sale", "item-auction", "item-instant", "your-items", "proof", "giving", "submit", "item-edit", "admin-totals", "admin-people", "admin-proofs", "admin-items", "admin-settings"),
  after: pick("home", "your-items", "proof", "admin-people", "admin-proofs", "admin-reset"),
  reset: pick("home", "silent-auction", "instant-sale", "your-items", "submit", "proof", "giving", "admin-totals", "admin-people", "admin-proofs", "admin-items", "admin-reset", "admin-settings"),
};

const MAYA = { cookie: "kg_viewer=1" };

/** Restore, waiting out the 10-second cooldown if the last test restored moments ago. */
async function restore(request: APIRequestContext): Promise<void> {
  for (let tries = 0; tries < 5; tries++) {
    const r = await request.post("/api/demo", { data: { action: "restore" } });
    if (r.ok()) return;
    if (r.status() !== 429) throw new Error(`Restore answered ${r.status()}`);
    const wait = Number(r.headers()["retry-after"] ?? "10");
    await new Promise((done) => setTimeout(done, (wait + 1) * 1000));
  }
  throw new Error("Restore stayed in its cooldown");
}

async function setState(request: APIRequestContext, state: State): Promise<void> {
  await restore(request);
  if (state === "live") return;
  const to = state === "reset" ? "after" : state;
  const jump = await request.post("/api/demo", { data: { action: "jump", to } });
  if (!jump.ok()) throw new Error(`Jump to ${to} answered ${jump.status()}`);
  if (state !== "reset") return;
  const app = (await (await request.get("/api/app", { headers: MAYA })).json()) as { event: { name: string } };
  const reset = await request.post("/api/admin", { headers: MAYA, data: { action: "reset-year", confirmName: app.event.name } });
  if (!reset.ok()) throw new Error(`Reset answered ${reset.status()}`);
}

async function shoot(page: Page, s: Screen, file: string, baseURL: string | undefined): Promise<void> {
  await page.context().clearCookies();
  await viewAs(page, s, baseURL);
  // A screenshot of a page whose API failed isn't a review of that state.
  const failed: string[] = [];
  const onResponse = (r: { status(): number; url(): string }) => {
    if (r.status() >= 500 && new URL(r.url()).pathname.startsWith("/api/")) failed.push(`${r.status()} ${new URL(r.url()).pathname}`);
  };
  page.on("response", onResponse);
  const url = new URL(s.path, "http://placeholder");
  url.searchParams.set("demo", "off");
  await page.goto(url.pathname + url.search);
  await page.waitForLoadState("networkidle");
  // Tiles load their photos lazily, so a full-page screenshot would show empty frames below the
  // first screen. Load every picture first.
  await page.evaluate(`Promise.all([...document.images].map((img) => { img.loading = "eager"; return img.decode().catch(() => undefined); }))`);
  page.off("response", onResponse);
  if (failed.length) throw new Error(`${s.name}: ${failed.join(", ")}`);
  await page.screenshot({ path: file, fullPage: true });
}

test.describe.configure({ mode: "serial" });

// vercel dev leaks an open file on every 304 answer, and a browser revalidates each script,
// stylesheet and image on every page load, so this run's ~170 loads reached its open-file limit
// and every function call then failed ("spawn EBADF", 502). Routing the page's requests turns off
// the browser's HTTP cache, so each file comes back 200 and nothing leaks (DECISIONS entry 122).
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => route.continue());
});

test.afterAll(async ({ request }) => {
  await restore(request);
});

test("every screen, as seeded (live)", async ({ page, request, baseURL }, testInfo) => {
  test.setTimeout(240_000);
  await setState(request, "live");
  for (const s of SCREENS) await shoot(page, s, `visual-review/${s.name}-${testInfo.project.name}.png`, baseURL);
});

for (const [state, screens] of Object.entries(STATES) as [Exclude<State, "live">, readonly Screen[]][]) {
  test(`${state}: the screens it changes`, async ({ page, request, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    await setState(request, state);
    for (const s of screens) await shoot(page, s, `visual-review/${state}/${s.name}-${testInfo.project.name}.png`, baseURL);
  });
}
