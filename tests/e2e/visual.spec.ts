// Conformance check 6 (SPEC §12.6): full-page screenshots for a person to review, light and
// dark at 390px and 1280px, with demo controls hidden (?demo=off). Nothing is compared
// automatically. The one exception is the welcome dialog, which needs the demo on (below).
//
// "In every seeded state" (DECISIONS entry 121): every screen as seeded (live), then each other
// phase and the "just reset" state on the screens that phase changes, not the full
// cross-product. Each state test sets its own state (Restore, then an Event phase jump or a real Reset as
// Maya) and Restore runs after the last, so the tests share the one dev database and must run
// one at a time: `npm run check:visual` passes --workers=1.
//
// Each state is set once and shot in all four views from it (owner, check-speed plan B;
// DECISIONS entry 134): the tests run in one project, open a browser context per view (the
// config's light and dark projects at 390 and 1280), and shoot a screen in the four at once.
// The files are named after those projects, as before.
import { test, type APIRequestContext, type Browser, type BrowserContext, type FullProject, type Page } from "@playwright/test";
import { SCREENS, viewAs, type Screen } from "./screens.ts";
import { WELCOME_SEEN } from "./welcome-seen.ts";
import { WELCOME } from "../../src/components/welcome-rules.ts";

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

/**
 * POST /api/demo, waiting out the 10-second cooldown that Restore and the clearing jump to
 * "Submissions open" share (DECISIONS entry 124), if the last one ran moments ago.
 */
async function demo(request: APIRequestContext, data: Record<string, string>): Promise<void> {
  for (let tries = 0; tries < 5; tries++) {
    const r = await request.post("/api/demo", { data });
    if (r.ok()) return;
    if (r.status() !== 429) throw new Error(`${JSON.stringify(data)} answered ${r.status()}`);
    const wait = Number(r.headers()["retry-after"] ?? "10");
    await new Promise((done) => setTimeout(done, (wait + 1) * 1000));
  }
  throw new Error(`${JSON.stringify(data)} stayed in its cooldown`);
}
const restore = (request: APIRequestContext) => demo(request, { action: "restore" });

async function setState(request: APIRequestContext, state: State): Promise<void> {
  await restore(request);
  if (state === "live") return;
  const to = state === "reset" ? "after" : state;
  await demo(request, { action: "jump", to });
  if (state !== "reset") return;
  const app = (await (await request.get("/api/app", { headers: MAYA })).json()) as { event: { name: string } };
  const reset = await request.post("/api/admin", { headers: MAYA, data: { action: "reset-year", confirmName: app.event.name } });
  if (!reset.ok()) throw new Error(`Reset answered ${reset.status()}`);
}

/** The views: every light or dark project in the config (not the 320px reflow one). */
const views = (projects: readonly FullProject[]) => projects.filter((p) => p.use.colorScheme && p.use.viewport);

/**
 * A context per view, with the HTTP cache off (see the route below), closed after `run`. Each
 * starts with the welcome seen, unless a first visit is what's being shot.
 */
async function inEveryView(browser: Browser, projects: readonly FullProject[], baseURL: string | undefined, run: (page: Page, view: string) => Promise<void>, firstVisit = false): Promise<void> {
  const opened: BrowserContext[] = [];
  try {
    await Promise.all(views(projects).map(async (p) => {
      const { colorScheme, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = p.use;
      const context = await browser.newContext({ colorScheme, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL: baseURL ?? p.use.baseURL, storageState: firstVisit ? { cookies: [], origins: [] } : WELCOME_SEEN });
      opened.push(context);
      // vercel dev leaks an open file on every 304 answer; routing turns off the browser's cache
      // so each file comes back 200 and nothing leaks (DECISIONS entry 122).
      await context.route("**/*", (route) => route.continue());
      await run(await context.newPage(), p.name);
    }));
  } finally {
    await Promise.all(opened.map((c) => c.close()));
  }
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

// One project runs the states; it shoots every view itself.
const RUNS_HERE = "light-1280";
test.beforeEach(({}, info) => test.skip(info.project.name !== RUNS_HERE, "this project's run shoots all four views"));

test.afterAll(async ({ request }, info) => {
  if (info.project.name === RUNS_HERE) await restore(request);
});

/** Each screen in the four views at once; the next screen once all four are done. */
async function shootAll(browser: Browser, projects: readonly FullProject[], screens: readonly Screen[], folder: string, baseURL: string | undefined): Promise<void> {
  for (const s of screens) await inEveryView(browser, projects, baseURL, (page, view) => shoot(page, s, `${folder}${s.name}-${view}.png`, baseURL));
}

test("every screen, as seeded (live)", async ({ browser, request, baseURL }, testInfo) => {
  test.setTimeout(300_000);
  await setState(request, "live");
  await shootAll(browser, testInfo.config.projects, SCREENS, "visual-review/", baseURL);
});

// The welcome dialog (DECISIONS entries 138 and 139) only exists with the demo on, so it's shot
// apart from the screens: Home on a first visit with the dialog open, the window only, since the
// dialog sits over it (visual-review/welcome/).
test("welcome: Home on a first visit, with the dialog open", async ({ browser, request, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  await setState(request, "live");
  const home = screen("home");
  await inEveryView(browser, testInfo.config.projects, baseURL, async (page, view) => {
    await viewAs(page, home, baseURL);
    await page.goto(home.path);
    const dialog = page.getByRole("dialog", { name: WELCOME.title });
    await dialog.waitFor({ state: "visible", timeout: 20_000 });
    await page.evaluate(`Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)))`);
    // Its entrance animation finished (loading shimmers repeat forever, so they don't count).
    await page.waitForFunction("document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity)");
    await page.screenshot({ path: `visual-review/welcome/home-${view}.png` });
  }, true);
});

for (const [state, screens] of Object.entries(STATES) as [Exclude<State, "live">, readonly Screen[]][]) {
  test(`${state}: the screens it changes`, async ({ browser, request, baseURL }, testInfo) => {
    test.setTimeout(240_000);
    await setState(request, state);
    await shootAll(browser, testInfo.config.projects, screens, `visual-review/${state}/`, baseURL);
  });
}
