// Home (SPEC §8): the hero, description and How to participate are in the HTML; this fills
// in the event's name, the proof deadline's length and the charities from the app state, and
// after a Reset on the shared demo, the offer to restore it.
import type { AppState } from "../app-state.ts";
import { el } from "../components/dom.ts";
import { renderResetOffer } from "../components/reset-offer.ts";
import { logoAlt, proofDaysWords } from "./home-rules.ts";

export function showHome(state: AppState): void {
  const name = document.querySelector<HTMLElement>("[data-event-name]");
  if (name && state.event) {
    name.textContent = state.event.name;
    name.hidden = false;
  }
  const days = proofDaysWords(state.event);
  const daysSlot = document.querySelector<HTMLElement>("[data-proof-days]");
  if (daysSlot && days) daysSlot.textContent = days;
  showCharities(state);
  showResetOffer(state);
}

/** After a Reset on the shared demo, offer Restore right away, above the hero (SPEC v1.17 §7.8). */
function showResetOffer(state: AppState): void {
  const main = document.querySelector<HTMLElement>("main");
  const current = main?.querySelector<HTMLElement>("[data-reset-offer]");
  if (!state.demoReset) return current?.remove();
  if (!main || current) return;
  const offer = renderResetOffer({ eventName: state.event?.name ?? null, forAdmin: false, level: 2, focusAfter: () => document.getElementById("home-title") });
  main.prepend(offer);
}

/** The three charities as cards, in `[data-charities]` (Home and the giving stub). */
export function showCharities(state: AppState): void {
  const list = document.querySelector<HTMLElement>("[data-charities]");
  if (!list) return;
  list.replaceChildren(
    ...state.charities.map((c) =>
      el("li", {},
        el("article", { className: "card card--flat charity-card" },
          el("img", { className: "charity-card__logo", attrs: { src: c.logoUrl, alt: logoAlt(c.logoUrl), width: "80", height: "80", loading: "lazy" } }),
          el("div", { className: "charity-card__text" },
            el("h3", { className: "charity-card__name", text: c.name }),
            el("p", { className: "charity-card__description", text: c.description }),
          ),
        ),
      ),
    ),
  );
  list.removeAttribute("aria-busy");
  // The charities' own loading line (Home has nothing else waiting; giving waits on /api/me too).
  const loading = list.parentElement?.querySelector<HTMLElement>("[data-page-loading]");
  if (loading) loading.hidden = true;
}
