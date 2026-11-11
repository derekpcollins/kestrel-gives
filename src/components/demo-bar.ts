// Demo bar (DESIGN-SYSTEM.md › Demo bar; SPEC §3.1). Remembers whether it's collapsed,
// announces who you're viewing as and where the event moved, and removes itself for
// ?demo=off. On the gallery page it only raises demo:viewing-as, demo:jump, demo:restore and
// demo:about events. On app pages renderDemoBar() builds it from the app state and passes actions that
// call the API; each control shows the button loading state while its request runs, and
// updateDemoBar() refreshes it in place so focus stays where it was.
import type { AppState } from "../app-state.ts";
import { JUMPS, PHASE_LABEL, SHARED_NOTE, SUBMISSION_JUMP_TEXT, TOUR_LINK, currentJump, type JumpValue } from "./shell-rules.ts";
import { confirmDialog } from "./dialog.ts";
import { el } from "./dom.ts";
import { readItem, writeItem } from "./local-store.ts";
import { icon } from "./icons.ts";
import { showToast } from "./toast.ts";
import { openWelcome } from "./welcome.ts";

const COLLAPSED_KEY = "kestrel-demo-bar-collapsed";
const ABOUT_LABEL = "About this demo";

export type { JumpValue };

export interface DemoBarActions {
  viewAs(userId: string): Promise<void>;
  jump(to: JumpValue): Promise<void>;
  restore(): Promise<void>;
}

const personLabel = (p: { firstName: string; lastName: string; role: string }) => `${p.firstName} ${p.lastName} (${p.role})`;

/** Builds the page's demo bar from the app state. Returns null for ?demo=off. */
export function renderDemoBar(state: AppState, actions: DemoBarActions): HTMLElement | null {
  if (new URLSearchParams(location.search).get("demo") === "off") return null;
  const select = el("select", { className: "input", attrs: { id: "demo-viewing-as" } },
    ...state.people.map((p) => el("option", { text: personLabel(p), attrs: { value: p.id } })),
  );
  const bar = el("section", { className: "demo-bar", attrs: { "aria-label": "Demo controls", "data-demo-bar": "page" } },
    el("details", { className: "demo-bar__details", attrs: { open: "" } },
      el("summary", { className: "demo-bar__summary" },
        el("span", { className: "demo-bar__tag", text: "Demo" }),
        el("span", { className: "demo-bar__who" }),
        el("span", { className: "demo-bar__tour-room", attrs: { "aria-hidden": "true" } }),
        icon("chevron-down", { size: "sm" }),
      ),
      el("div", { className: "demo-bar__controls" },
        el("div", { className: "field demo-bar__viewing" },
          el("label", { className: "field__label", text: "Viewing as", attrs: { for: "demo-viewing-as" } }),
          el("div", { className: "select" }, select, icon("chevron-down")),
        ),
        el("fieldset", { className: "demo-bar__jump" },
          el("legend", { className: "demo-bar__group-label", text: PHASE_LABEL }),
          el("div", { className: "demo-bar__jump-buttons" },
            ...JUMPS.map((j) => el("button", { className: "btn btn--secondary btn--sm", text: j.label, attrs: { type: "button", value: j.value, "aria-pressed": "false" } })),
          ),
        ),
        el("div", { className: "demo-bar__end" },
          // The danger outline: it opens a red confirmation (SPEC v1.25 §3.1).
          el("button", { className: "btn btn--danger-outline btn--sm", attrs: { type: "button", "data-demo-restore": "" } }, icon("trash", { size: "sm" }), "Restore demo data"),
          // Reopens the welcome (SPEC v1.24 §3.1). A button, since it opens a dialog.
          el("button", { className: "demo-bar__about", text: ABOUT_LABEL, attrs: { type: "button", "data-demo-about": "" } }),
          // Open bar only (SPEC v1.25 §3.1), so the strip stays one line.
          el("p", { className: "demo-bar__note", text: SHARED_NOTE }),
        ),
        tourLink("demo-bar__tour demo-bar__tour--open", TOUR_LINK.open),
      ),
    ),
    // Outside the <summary>, so the link isn't nested in the toggle; CSS places it in the strip.
    el("div", { className: "demo-bar__strip-tour" }, tourLink("demo-bar__tour demo-bar__tour--strip", TOUR_LINK.strip)),
    el("p", { className: "visually-hidden demo-bar__status", attrs: { role: "status" } }),
  );
  updateDemoBar(bar, state);
  enhanceDemoBar(bar, actions);
  return bar;
}

/** The tour link (SPEC v1.21 §3.1). On the tour itself it marks the current page. */
function tourLink(className: string, text: string): HTMLElement {
  const link = el("a", { className, text, attrs: { href: TOUR_LINK.href } });
  if (location.pathname.replace(/\/$/, "") === TOUR_LINK.href) link.setAttribute("aria-current", "page");
  return link;
}

/** Shows the state's viewer and phase without rebuilding the bar. */
export function updateDemoBar(bar: HTMLElement, state: AppState): void {
  const select = bar.querySelector<HTMLSelectElement>(".demo-bar__viewing select");
  const who = bar.querySelector<HTMLElement>(".demo-bar__who");
  if (select && state.viewer) select.value = state.viewer.id;
  if (who && state.viewer) who.textContent = `Viewing as ${personLabel(state.viewer)}`;
  const pressed = currentJump(state.event, new Date(state.now));
  for (const button of bar.querySelectorAll<HTMLButtonElement>(".demo-bar__jump-buttons .btn")) {
    button.setAttribute("aria-pressed", String(button.value === pressed));
  }
}

export function enhanceDemoBar(bar: HTMLElement, actions?: DemoBarActions): void {
  // The page's real bar hides for clean screenshots; gallery specimens never do.
  if (bar.dataset.demoBar === "page" && new URLSearchParams(location.search).get("demo") === "off") {
    bar.remove();
    return;
  }

  const details = bar.querySelector<HTMLDetailsElement>(".demo-bar__details");
  const status = bar.querySelector<HTMLElement>(".demo-bar__status");
  const who = bar.querySelector<HTMLElement>(".demo-bar__who");
  const select = bar.querySelector<HTMLSelectElement>(".demo-bar__viewing select");

  if (details && bar.dataset.demoBar === "page") {
    // A remembered choice wins. Without one, the bar starts open on wide screens and
    // collapsed below 40rem, where it would push the page down (owner, pre-push review).
    const remembered = readItem(COLLAPSED_KEY);
    details.open = remembered === null ? isWide() : remembered !== "true";
    // Only the visitor's own toggles are remembered, not the default set above. The click on
    // the summary runs before <details> flips, so the new state is the opposite of now.
    // With storage blocked it's simply not remembered (DECISIONS entry 141).
    details.querySelector("summary")?.addEventListener("click", () => {
      writeItem(COLLAPSED_KEY, String(details.open));
    });
  }

  let previous = select?.value ?? "";
  select?.addEventListener("change", async () => {
    const label = select.selectedOptions[0]?.textContent?.trim() ?? "";
    if (actions) {
      select.setAttribute("aria-busy", "true");
      try {
        await actions.viewAs(select.value);
      } catch (error) {
        select.value = previous;
        showToast(message(error), { tone: "danger" });
        return;
      } finally {
        select.removeAttribute("aria-busy");
      }
    }
    previous = select.value;
    if (who) who.textContent = `Viewing as ${label}`;
    announce(status, `Now viewing as ${label}`);
    bar.dispatchEvent(new CustomEvent("demo:viewing-as", { bubbles: true, detail: { userId: select.value, label } }));
  });

  for (const button of bar.querySelectorAll<HTMLButtonElement>(".demo-bar__jump-buttons .btn")) {
    button.addEventListener("click", async () => {
      if (button.getAttribute("aria-disabled") === "true") return;
      if (actions && button.value === "submission") {
        // This jump clears activity (DECISIONS entry 124), so it asks first, as Restore does.
        if (!(await confirmSubmissionJump(() => actions.jump("submission")))) return;
      } else if (actions) {
        const ok = await whileBusy(button, () => actions.jump(button.value as JumpValue));
        if (!ok) return;
      }
      for (const other of bar.querySelectorAll(".demo-bar__jump-buttons .btn")) other.setAttribute("aria-pressed", String(other === button));
      announce(status, `Event moved to: ${button.textContent?.trim()}`);
      bar.dispatchEvent(new CustomEvent("demo:jump", { bubbles: true, detail: { phase: button.value } }));
    });
  }

  bar.querySelector<HTMLButtonElement>("[data-demo-restore]")?.addEventListener("click", async () => {
    if (!actions) {
      bar.dispatchEvent(new CustomEvent("demo:restore", { bubbles: true, detail: {} }));
      return;
    }
    if (await confirmRestore(actions.restore)) announce(status, "Demo data restored");
  });

  // The welcome again; focus comes back here when it closes.
  bar.querySelector<HTMLButtonElement>("[data-demo-about]")?.addEventListener("click", () => {
    if (actions) void openWelcome();
    else bar.dispatchEvent(new CustomEvent("demo:about", { bubbles: true, detail: {} }));
  });
}

/**
 * Restore demo data's confirmation, then a toast. The demo bar and the "demo was reset" offer
 * on Home and the Admin Dashboard (SPEC v1.17 §7.8) both use it, so they ask the same way.
 */
export async function confirmRestore(restore: () => Promise<void>): Promise<boolean> {
  const restored = await confirmDialog({
    variant: "danger",
    title: "Restore demo data?",
    body: "Every item, bid, purchase, proof and email template goes back to the seeded demo, with bidding live. The demo is shared, so this resets it for everyone.",
    confirmLabel: "Restore demo data",
    busyLabel: "Restoring…",
    onConfirm: restore,
  });
  if (restored) showToast("Demo data restored.", { tone: "success" });
  return restored;
}

/**
 * Event phase "Submissions open" clears every bid, purchase and proof (owner, 7A review; DECISIONS
 * entry 124), so it says so first. A refusal (busy, or the shared cooldown) shows in the dialog.
 */
export async function confirmSubmissionJump(jump: () => Promise<void>): Promise<boolean> {
  const done = await confirmDialog({
    variant: "danger",
    title: "Open submissions and clear activity?",
    body: SUBMISSION_JUMP_TEXT,
    confirmLabel: "Clear and open submissions",
    busyLabel: "Clearing…",
    onConfirm: jump,
  });
  if (done) showToast("Bids, purchases and proofs cleared. Submissions are open.", { tone: "success" });
  return done;
}

/** Runs a request with the button in its loading state. False (with a toast) if it failed. */
async function whileBusy(button: HTMLButtonElement, work: () => Promise<void>): Promise<boolean> {
  button.setAttribute("aria-busy", "true");
  button.setAttribute("aria-disabled", "true");
  try {
    await work();
    return true;
  } catch (error) {
    showToast(message(error), { tone: "danger" });
    return false;
  } finally {
    button.removeAttribute("aria-busy");
    button.removeAttribute("aria-disabled");
  }
}

const message = (error: unknown) => (error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.");

function announce(status: HTMLElement | null, text: string): void {
  if (!status) return;
  status.textContent = "";
  requestAnimationFrame(() => { status.textContent = text; });
}

/** At or above --breakpoint-sm the bar starts open; below it, collapsed. Read from the token. */
function isWide(): boolean {
  const breakpoint = getComputedStyle(document.documentElement).getPropertyValue("--breakpoint-sm").trim();
  return breakpoint ? matchMedia(`(min-width: ${breakpoint})`).matches : true;
}
