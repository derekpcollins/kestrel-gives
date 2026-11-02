// The phase banner under the header (SPEC §8): one at a time, role="status" so a change of
// phase is announced. Words come from phaseBanner() (phase-banner-rules.ts).
import type { AppState } from "../app-state.ts";
import { el } from "./dom.ts";
import { icon } from "./icons.ts";
import { phaseBanner } from "./phase-banner-rules.ts";

/** Fills (or empties) the banner slot. Updates the text in place, so screen readers hear the change. */
export function updatePhaseBanner(slot: HTMLElement, state: AppState): void {
  const words = phaseBanner(state.event, new Date(state.now));
  if (!words) {
    slot.replaceChildren();
    return;
  }
  let banner = slot.querySelector<HTMLElement>(".banner");
  if (!banner) {
    banner = el("div", { className: "banner banner--phase", attrs: { role: "status" } },
      el("span", { className: "phase-banner__icon" }),
      el("div", { className: "banner__body" }, el("p", { className: "banner__title" }), el("p", { className: "banner__text" })),
    );
    slot.replaceChildren(el("div", { className: "phase-banner" }, banner));
  }
  banner.classList.toggle("banner--urgent", words.urgent === true);
  banner.querySelector(".phase-banner__icon, .icon")?.replaceWith(icon(words.icon));
  banner.querySelector(".banner__title")!.textContent = words.title;
  banner.querySelector(".banner__text")!.textContent = words.text;
}
