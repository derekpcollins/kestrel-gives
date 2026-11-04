// The 5-minute tour (/guide; owner, guide plan; DECISIONS entries 127 and 128). The scenarios are
// static HTML, so the page reads without JavaScript and with ?demo=off. This script adds each
// scenario's Set me up: it says first what it will change on the shared demo, sets the viewer
// (just this browser) and the phase (everyone) with the demo bar's own rules, checks that the
// state the scenario needs is still there, and says Ready with where to start, or what
// happened and how to recover. It never restores on its own.
import type { AdminProofs } from "../admin-api.ts";
import type { AppState, PersonView } from "../app-state.ts";
import type { BrowseAnswer } from "../items-api.ts";
import type { MeAnswer } from "../me-api.ts";
import { confirmSubmissionJump } from "../components/demo-bar.ts";
import { el } from "../components/dom.ts";
import { icon } from "../components/icons.ts";
import { currentJump, type JumpValue } from "../components/shell-rules.ts";
import {
  SCENARIOS, checkChange, checkLastOne, checkOutbid, checkReview, checkSubmit, checkWin,
  personNamed, phaseMatches, readyText, setupEffect, type CheckResult, type Scenario,
} from "./guide-rules.ts";

class SetupError extends Error {}

let state: AppState | null = null;
let ready: (s: AppState) => void;
const firstState = new Promise<AppState>((resolve) => { ready = resolve; });

export function startGuidePage(): void {
  const page = document.querySelector<HTMLElement>("[data-guide-page]");
  if (!page) return;
  // ?demo=off is for clean screenshots: the tour still reads, without the buttons.
  if (new URLSearchParams(location.search).get("demo") === "off") return;

  const cards = SCENARIOS.map((s) => ({ s, root: page.querySelector<HTMLElement>(`[data-scenario="${s.id}"]`) }))
    .filter((c): c is { s: Scenario; root: HTMLElement } => c.root !== null);

  document.addEventListener("kg:state", (event) => {
    state = (event as CustomEvent<AppState>).detail;
    ready(state);
    for (const { s, root } of cards) showEffect(s, root, state);
  });

  for (const { s, root } of cards) {
    const setup = root.querySelector<HTMLElement>("[data-guide-setup]");
    const button = setup?.querySelector<HTMLButtonElement>("button");
    if (!setup || !button) continue;
    setup.hidden = false;
    button.addEventListener("click", () => void run(s, root, button));
  }
}

/** The line beside Set me up: what it changes for you, and for everyone. */
function showEffect(s: Scenario, root: HTMLElement, st: AppState): void {
  const line = root.querySelector<HTMLElement>("[data-guide-effect]");
  if (!line) return;
  const effect = setupEffect(s, currentJump(st.event, new Date(st.now)));
  line.replaceChildren(el("span", { text: effect.you }), ...(effect.everyone ? [" ", el("strong", { text: effect.everyone })] : []));
}

async function run(s: Scenario, root: HTMLElement, button: HTMLButtonElement): Promise<void> {
  if (button.getAttribute("aria-busy") === "true") return;
  const status = root.querySelector<HTMLElement>("[data-guide-status]")!;
  button.setAttribute("aria-busy", "true");
  button.setAttribute("aria-disabled", "true");
  status.replaceChildren();
  try {
    let st = state ?? (await firstState);
    const viewer = personNamed(st.people, s.viewer);
    if (!viewer) throw new SetupError(`${s.viewer} isn't in the demo right now. Restore demo data brings everyone back.`);

    // The phase first, with the demo bar's rules: only Submissions open asks, since it clears activity.
    if (!phaseMatches(s.phase, currentJump(st.event, new Date(st.now)))) {
      if (s.phase === "submission") {
        const jumped: { state: AppState | null } = { state: null };
        const done = await confirmSubmissionJump(async () => { jumped.state = await demo({ action: "jump", to: "submission" }); });
        if (!done || !jumped.state) return; // Cancelled: nothing changed.
        st = jumped.state;
      } else {
        st = await demo({ action: "jump", to: s.phase });
      }
    }

    // Change the outcome reads Jules's view before switching to Maya.
    const checkAs = s.checkAs ? personNamed(st.people, s.checkAs) : viewer;
    if (!checkAs) throw new SetupError(`${s.checkAs} isn't in the demo right now. Restore demo data brings everyone back.`);
    if (st.viewer?.id !== checkAs.id) st = await demo({ action: "view-as", userId: checkAs.id });
    const result = await check(s);
    if (checkAs.id !== viewer.id) st = await demo({ action: "view-as", userId: viewer.id });

    // The shell redraws the header, banner and demo bar from the new state.
    document.dispatchEvent(new CustomEvent("kg:refresh"));
    showResult(status, result, viewer, currentJump(st.event, new Date(st.now)) ?? s.phase);
  } catch (error) {
    document.dispatchEvent(new CustomEvent("kg:refresh"));
    status.replaceChildren(banner("danger", "Couldn't set this up", error instanceof Error && error.message ? error.message : "Something went wrong. Try again."));
  } finally {
    button.removeAttribute("aria-busy");
    button.removeAttribute("aria-disabled");
  }
}

async function check(s: Scenario): Promise<CheckResult> {
  switch (s.needs) {
    case "auction-items": return checkOutbid((await read<BrowseAnswer>("/api/items?type=auction")).items);
    case "instant-items": return checkLastOne((await read<BrowseAnswer>("/api/items?type=instant")).items);
    case "jules-me": return s.id === "win" ? checkWin(await read<MeAnswer>("/api/me")) : checkChange(await read<MeAnswer>("/api/me"));
    case "proofs": return checkReview((await read<AdminProofs>("/api/admin?view=proofs")).proofs);
    case "none": return checkSubmit();
  }
}

function showResult(status: HTMLElement, result: CheckResult, viewer: PersonView, phase: JumpValue): void {
  if (result.ok) {
    const text = [readyText(viewer, phase), result.note].filter(Boolean).join(" ");
    const go = el("a", { className: "btn btn--secondary btn--sm", attrs: { href: result.start.href } }, result.start.label, icon("chevron-right", { size: "sm" }));
    status.replaceChildren(banner("success", "Ready", text, go));
    return;
  }
  const restore = el("button", { className: "btn btn--secondary btn--sm", attrs: { type: "button" } }, "Restore demo data");
  restore.addEventListener("click", () => {
    // The demo bar's own Restore dialog, through the shell, so it works with the bar collapsed.
    document.dispatchEvent(new CustomEvent("kg:restore", {
      detail: { done: (restored: boolean) => { if (restored) status.replaceChildren(banner("info", "Restored", "The demo is back as seeded. Press Set me up again.")); } },
    }));
  });
  status.replaceChildren(banner("warning", result.title, result.text, restore));
}

function banner(tone: "success" | "warning" | "danger" | "info", title: string, text: string, action?: HTMLElement): HTMLElement {
  const glyph = tone === "success" ? "check" : tone === "info" ? "info" : "alert";
  return el("div", { className: `banner banner--${tone} guide-scenario__result` },
    icon(glyph),
    el("div", { className: "banner__body" }, el("p", { className: "banner__title", text: title }), el("p", { className: "banner__text", text })),
    ...(action ? [el("div", { className: "banner__action" }, action)] : []),
  );
}

async function demo(payload: object): Promise<AppState> {
  return send<AppState>("/api/demo", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

const read = <T>(path: string) => send<T>(path, { headers: { Accept: "application/json" } });

async function send<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, credentials: "same-origin" });
  } catch {
    throw new SetupError("Can't reach the server. Check your connection and try again.");
  }
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw new SetupError(body?.error ?? "Something went wrong. Try again.");
  return body;
}
