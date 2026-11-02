// Home (SPEC §8): the hero, description and How to participate are in the HTML; this fills
// in the event's name, the proof deadline's length and the charities from the app state.
import type { AppState } from "../app-state.ts";
import { el } from "../components/dom.ts";
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
}
