// The app shell on every page (Milestone 3B; SPEC §3.1, §8): demo bar, site header and phase
// banner, drawn from GET /api/app. Pages mark their slots and name themselves with
// <body data-page="…">; page scripts listen for "kg:state" to draw their own content.
import type { AppState } from "./app-state.ts";
import { confirmRestore, renderDemoBar, updateDemoBar, type DemoBarActions } from "./components/demo-bar.ts";
import { el } from "./components/dom.ts";
import { icon } from "./components/icons.ts";
import { updatePhaseBanner } from "./components/phase-banner.ts";
import { renderSiteHeader } from "./components/site-header.ts";
import { fetchWithTimeout, LoadTimeout, pageLoading } from "./components/loading.ts";
import { pageKeyFor } from "./components/shell-rules.ts";
import { maybeShowWelcome } from "./components/welcome.ts";


export class RequestError extends Error {}

async function call(path: string, init?: RequestInit): Promise<AppState> {
  let response: Response;
  const options = { ...init, headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) } };
  try {
    // Reading the app state gives up after LOAD_TIMEOUT_MS (DECISIONS #119); demo actions wait.
    response = init?.method ? await fetch(path, options) : await fetchWithTimeout(path, options);
  } catch (error) {
    if (error instanceof LoadTimeout) throw new RequestError("The demo is taking too long to answer. Try again in a moment.");
    throw new RequestError("Can't reach the server. Check your connection and try again.");
  }
  const body = (await response.json().catch(() => null)) as (AppState & { ok?: boolean; error?: string }) | null;
  if (!response.ok || !body) throw new RequestError(body?.error ?? "Something went wrong. Please try again.");
  return body;
}

const demo = (payload: object) => call("/api/demo", { method: "POST", body: JSON.stringify(payload) });

export interface Shell {
  readonly state: AppState | null;
}

export async function startShell(): Promise<Shell> {
  const page = pageKeyFor(document.body.dataset.page, location.pathname);
  const demoSlot = document.querySelector<HTMLElement>("[data-shell-demo]");
  const headerSlot = document.querySelector<HTMLElement>("[data-shell-header]");
  const bannerSlot = document.querySelector<HTMLElement>("[data-shell-banner]");
  const shell = { state: null as AppState | null };
  let bar: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let headerKey = "";

  // The header draws at once (without the person or Submit an Item) so the page doesn't jump.
  headerSlot?.replaceChildren(renderSiteHeader(null, page));

  const show = (state: AppState) => {
    shell.state = state;
    // Redraw the header only when what it shows changes (the person, or the phase that
    // decides Submit an Item), so a focused link or an open menu isn't swept away.
    const key = `${state.viewer?.id}|${state.viewer?.role}|${state.event?.phase}`;
    if (key !== headerKey) {
      headerKey = key;
      headerSlot?.replaceChildren(renderSiteHeader(state, page));
    }
    // No phase message on the guide (SPEC v1.25 §8): its scenarios say the phase they need. The
    // slot stays for "The demo couldn't load", which still shows there.
    if (bannerSlot && page !== "guide") updatePhaseBanner(bannerSlot, state);
    if (bar) updateDemoBar(bar, state);
    document.dispatchEvent(new CustomEvent<AppState>("kg:state", { detail: state }));
    scheduleRefresh(state);
  };

  // If the phase changes while the page is open (bidding opens or closes), redraw then.
  const scheduleRefresh = (state: AppState) => {
    clearTimeout(timer);
    const now = Date.parse(state.now);
    const next = [state.event?.biddingOpensAt, state.event?.biddingClosesAt]
      .map((t) => (t ? Date.parse(t) - now : NaN))
      .filter((ms) => ms > 0 && ms < 24 * 3_600_000)
      .sort((a, b) => a - b)[0];
    if (next !== undefined) timer = setTimeout(() => void call("/api/app").then(show).catch(() => {}), next + 1_000);
  };

  const actions: DemoBarActions = {
    viewAs: async (userId) => show(await demo({ action: "view-as", userId })),
    jump: async (to) => show(await demo({ action: "jump", to })),
    restore: async () => show(await demo({ action: "restore" })),
  };

  // A page that changed what the app state shows (an admin saving new dates) asks for it again.
  document.addEventListener("kg:refresh", () => void call("/api/app").then(show).catch(() => {}));
  // The "demo was reset" offer (Home, Admin Dashboard) asks for the demo bar's Restore, even with
  // the bar hidden (?demo=off). `detail.done` hears whether it ran, to place focus afterwards.
  document.addEventListener("kg:restore", (event) => {
    const done = (event as CustomEvent<{ done?: (restored: boolean) => void } | null>).detail?.done;
    void confirmRestore(actions.restore).then((restored) => done?.(restored));
  });

  // The first load. If it fails or times out, the page's loading line goes and a banner says
  // why, with Try again (which shows the loading line again and asks once more).
  const start = async (retry?: HTMLButtonElement) => {
    try {
      const state = await call("/api/app");
      bar = renderDemoBar(state, actions);
      if (bar) demoSlot?.replaceChildren(bar);
      bannerSlot?.replaceChildren();
      show(state);
      // A first visit: the welcome, once the page has its data (DECISIONS entry 138).
      void maybeShowWelcome(page);
      // Try again worked: its button is gone, so focus goes to the page's main region.
      if (retry) document.querySelector<HTMLElement>("main")?.focus();
    } catch (error) {
      pageLoading(false);
      const again = el("button", { className: "btn btn--secondary", attrs: { type: "button", "data-shell-retry": "" } }, "Try again");
      again.addEventListener("click", () => {
        if (again.getAttribute("aria-busy") === "true") return;
        again.setAttribute("aria-busy", "true");
        again.setAttribute("aria-disabled", "true");
        pageLoading(true);
        void start(again);
      });
      bannerSlot?.replaceChildren(loadError(error, again));
      if (retry) again.focus();
    }
  };
  await start();
  return shell;
}

function loadError(error: unknown, again: HTMLButtonElement): HTMLElement {
  return el("div", { className: "phase-banner" },
    el("div", { className: "banner banner--danger", attrs: { role: "alert" } },
      icon("alert"),
      el("div", { className: "banner__body" },
        el("p", { className: "banner__title", text: "The demo couldn't load" }),
        el("p", { className: "banner__text", text: error instanceof Error ? error.message : "Please reload the page." }),
      ),
      el("div", { className: "banner__action" }, again),
    ),
  );
}
