// Demo bar (DESIGN-SYSTEM.md › Demo bar; SPEC §3.1). Remembers whether it's collapsed,
// announces who you're viewing as and where the event moved, and removes itself for
// ?demo=off. On the gallery page it only raises demo:viewing-as, demo:jump and demo:restore
// events. On app pages renderDemoBar() builds it from the app state and passes actions that
// call the API; each control shows the button loading state while its request runs, and
// updateDemoBar() refreshes it in place so focus stays where it was.
import type { AppState } from "../app-state.ts";
import { JUMPS, SHARED_NOTE, currentJump, type JumpValue } from "./shell-rules.ts";
import { confirmDialog } from "./dialog.ts";
import { el } from "./dom.ts";
import { icon } from "./icons.ts";
import { showToast } from "./toast.ts";

const COLLAPSED_KEY = "kestrel-demo-bar-collapsed";

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
        el("span", { className: "demo-bar__note", text: SHARED_NOTE }),
        icon("chevron-down", { size: "sm" }),
      ),
      el("div", { className: "demo-bar__controls" },
        el("div", { className: "field demo-bar__viewing" },
          el("label", { className: "field__label", text: "Viewing as", attrs: { for: "demo-viewing-as" } }),
          el("div", { className: "select" }, select, icon("chevron-down")),
        ),
        el("fieldset", { className: "demo-bar__jump" },
          el("legend", { className: "demo-bar__group-label", text: "Jump to" }),
          el("div", { className: "demo-bar__jump-buttons" },
            ...JUMPS.map((j) => el("button", { className: "btn btn--secondary", text: j.label, attrs: { type: "button", value: j.value, "aria-pressed": "false" } })),
          ),
        ),
        el("button", { className: "btn btn--secondary", attrs: { type: "button", "data-demo-restore": "" } }, icon("trash", { size: "sm" }), "Restore demo data"),
      ),
    ),
    el("p", { className: "visually-hidden demo-bar__status", attrs: { role: "status" } }),
  );
  updateDemoBar(bar, state);
  enhanceDemoBar(bar, actions);
  return bar;
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
    if (localStorage.getItem(COLLAPSED_KEY) === "true") details.open = false;
    details.addEventListener("toggle", () => localStorage.setItem(COLLAPSED_KEY, String(!details.open)));
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
      if (actions) {
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
    const restored = await confirmDialog({
      variant: "danger",
      title: "Restore demo data?",
      body: "Every item, bid, purchase, proof and email template goes back to the seeded demo, with bidding live. The demo is shared, so this resets it for everyone.",
      confirmLabel: "Restore demo data",
      busyLabel: "Restoring…",
      onConfirm: actions.restore,
    });
    if (restored) {
      announce(status, "Demo data restored");
      showToast("Demo data restored.", { tone: "success" });
    }
  });
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
