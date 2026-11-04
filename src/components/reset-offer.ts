// The "demo was reset" offer (DESIGN-SYSTEM.md › Reset offer; SPEC v1.17 §7.8): an info banner
// with Restore demo data, on Home and the Admin Dashboard while the shared demo is just reset.
// The button asks the shell for the demo bar's own Restore (its confirmation and cooldown),
// so it works with the bar hidden too. After a Restore the offer is gone, so focus moves to
// `focusAfter` (the page's heading) instead of being dropped.
import { el } from "./dom.ts";
import { icon } from "./icons.ts";
import { RESET_OFFER_TITLE, resetOfferText } from "./reset-offer-rules.ts";

export interface ResetOfferOptions {
  eventName: string | null;
  forAdmin: boolean;
  /** The heading level inside the page (h2 on Home, h3 inside an admin section). */
  level: 2 | 3;
  /** Where focus goes once the demo is restored. */
  focusAfter: () => HTMLElement | null;
}

export function renderResetOffer(options: ResetOfferOptions): HTMLElement {
  const titleId = `reset-offer-title-${options.level}`;
  const restore = el("button", { className: "btn", attrs: { type: "button", "data-reset-offer-restore": "" } }, "Restore demo data");
  restore.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("kg:restore", {
      detail: {
        done: (restored: boolean) => {
          if (!restored) return;
          const target = options.focusAfter();
          if (!target) return;
          if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
          target.focus();
        },
      },
    }));
  });
  return el("section", { className: "banner banner--info reset-offer", attrs: { "aria-labelledby": titleId, "data-reset-offer": "" } },
    icon("info"),
    el("div", { className: "banner__body" },
      el(`h${options.level}`, { className: "banner__title", text: RESET_OFFER_TITLE, attrs: { id: titleId } }),
      el("p", { className: "banner__text", text: resetOfferText(options.eventName, options.forAdmin) }),
    ),
    el("div", { className: "banner__action" }, restore),
  );
}
