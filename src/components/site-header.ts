// Builds the site header and profile menu (DESIGN-SYSTEM.md › Site header and nav, Profile
// menu; SPEC §8) from the app state. Submit an Item shows only in the submission window;
// the Admin Dashboard link exists only in an admin's profile menu.
import type { AppState, PersonView } from "../app-state.ts";
import { enhanceSiteHeader } from "./disclosure.ts";
import { el } from "./dom.ts";
import { icon } from "./icons.ts";
import { navLinks, type PageKey } from "./shell-rules.ts";

export type { PageKey };

export const fullName = (p: PersonView) => `${p.firstName} ${p.lastName}`;
export const initials = (p: PersonView) => `${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`.toUpperCase();
const roleWord = (p: PersonView) => (p.role === "admin" ? "admin" : "employee");

export function renderSiteHeader(state: AppState | null, page: PageKey): HTMLElement {
  const links = el("ul", { className: "site-header__links", attrs: { id: "site-nav-links" } },
    ...navLinks(state?.event?.phase).map((link) =>
      el("li", {}, el("a", { className: "site-header__link", text: link.label, attrs: { href: link.href, ...(link.key === page ? { "aria-current": "page" } : {}) } })),
    ),
  );
  const menuButton = el("button", { className: "btn btn--quiet site-header__menu-button", attrs: { type: "button", "aria-expanded": "false" } },
    el("span", { className: "site-header__menu-icon" }, icon("menu")),
    el("span", { className: "site-header__menu-label", text: "Menu" }),
  );
  const mark = el("img", { attrs: { src: "/brand/kestrel-org-mark-64.png", srcset: "/brand/kestrel-org-mark-64.png 1x, /brand/kestrel-org-mark-128.png 2x", width: "64", height: "64", alt: "" } });

  const header = el("header", { className: "site-header" },
    el("div", { className: "site-header__inner" },
      el("a", { className: "site-header__brand", attrs: { href: "/" } }, el("span", { className: "site-header__mark" }, mark), el("span", { className: "site-header__name", text: "Kestrel Gives" })),
      el("nav", { className: "site-header__nav", attrs: { "aria-label": "Main" } }, menuButton, links),
      el("div", { className: "site-header__end" }, state?.viewer ? renderProfile(state.viewer) : null),
    ),
  );
  enhanceSiteHeader(header);
  return header;
}

function renderProfile(viewer: PersonView): HTMLElement {
  const avatar = el("span", { className: "avatar", text: initials(viewer), attrs: { "aria-hidden": "true" } });
  if (viewer.role !== "admin") {
    return el("span", { className: "profile-menu__static" }, avatar, el("span", { className: "visually-hidden", text: `Signed in as ${fullName(viewer)}` }));
  }
  const chevron = icon("chevron-down", { size: "sm" });
  return el("div", { className: "profile-menu" },
    el("button", { className: "profile-menu__button", attrs: { type: "button", "aria-expanded": "false" } },
      avatar, el("span", { className: "visually-hidden", text: `${fullName(viewer)}, ${roleWord(viewer)}` }), chevron),
    el("div", { className: "profile-menu__panel", attrs: { id: "profile-menu-panel", hidden: "" } },
      el("p", { className: "profile-menu__who" }, el("span", { className: "profile-menu__name", text: fullName(viewer) }), el("span", { className: "profile-menu__role", text: "Admin" })),
      el("ul", { className: "profile-menu__links" }, el("li", {}, el("a", { className: "profile-menu__link", text: "Admin Dashboard", attrs: { href: "/admin" } }))),
    ),
  );
}
