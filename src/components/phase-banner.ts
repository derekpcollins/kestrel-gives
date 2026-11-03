// The phase banner under the header (SPEC §8): one at a time, role="status" so a change of
// phase is announced. Words come from phaseBanner() (phase-banner-rules.ts). The page's sale
// (`<body data-sale="instant">`) picks the live wording; the item page sets it once it knows
// the item's type, and redraws the banner with `refreshPhaseBanner()`.
import type { AppState } from "../app-state.ts";
import { el } from "./dom.ts";
import { icon } from "./icons.ts";
import { phaseBanner, type BannerSale } from "./phase-banner-rules.ts";

let lastState: AppState | null = null;

function pageSale(): BannerSale {
  return document.body.dataset.sale === "instant" ? "instant" : "auction";
}

/** Sets the page's sale (the item page, once it knows) and redraws the banner if it changed. */
export function setBannerSale(sale: BannerSale): void {
  if (pageSale() === sale) return;
  document.body.dataset.sale = sale;
  const slot = document.querySelector<HTMLElement>("[data-shell-banner]");
  if (slot && lastState) updatePhaseBanner(slot, lastState);
}

/** Fills (or empties) the banner slot. Updates the text in place, so screen readers hear the change. */
export function updatePhaseBanner(slot: HTMLElement, state: AppState): void {
  lastState = state;
  const words = phaseBanner(state.event, new Date(state.now), undefined, pageSale());
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
