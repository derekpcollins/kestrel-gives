// The app shell on every page (Milestone 3B; SPEC §3.1, §8): demo bar, site header and phase
// banner, drawn from GET /api/app. Pages mark their slots and name themselves with
// <body data-page="…">; page scripts listen for "kg:state" to draw their own content.
import type { AppState } from "./app-state.ts";
import { renderDemoBar, updateDemoBar, type DemoBarActions } from "./components/demo-bar.ts";
import { el } from "./components/dom.ts";
import { icon } from "./components/icons.ts";
import { updatePhaseBanner } from "./components/phase-banner.ts";
import { renderSiteHeader, type PageKey } from "./components/site-header.ts";

const PAGES: readonly PageKey[] = ["home", "silent-auction", "instant-sale", "your-items", "submit", "admin"];

export class RequestError extends Error {}

async function call(path: string, init?: RequestInit): Promise<AppState> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) } });
  } catch {
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
  const page = PAGES.find((p) => p === document.body.dataset.page) ?? "home";
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
    if (bannerSlot) updatePhaseBanner(bannerSlot, state);
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

  try {
    const state = await call("/api/app");
    bar = renderDemoBar(state, actions);
    if (bar) demoSlot?.replaceChildren(bar);
    show(state);
  } catch (error) {
    bannerSlot?.replaceChildren(loadError(error));
  }
  return shell;
}

function loadError(error: unknown): HTMLElement {
  return el("div", { className: "phase-banner" },
    el("div", { className: "banner banner--danger", attrs: { role: "alert" } },
      icon("alert"),
      el("div", { className: "banner__body" },
        el("p", { className: "banner__title", text: "The demo couldn't load" }),
        el("p", { className: "banner__text", text: error instanceof Error ? error.message : "Please reload the page." }),
      ),
    ),
  );
}
