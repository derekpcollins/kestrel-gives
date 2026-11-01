// Disclosure (DESIGN-SYSTEM.md › Site header, Profile menu): a button with aria-expanded
// that shows and hides a panel of links. Not role="menu": it's navigation, so Tab moves
// through the links as usual and there are no arrow-key menu rules (WAI-ARIA disclosure
// pattern). Escape or a click outside closes it. Escape returns focus to the button; so
// does an outside click that would otherwise leave focus nowhere.
import { icon } from "./icons.ts";

export interface DisclosureOptions {
  /** Element that gets .is-open; also the boundary for "outside". Defaults to the button's parent. */
  root?: HTMLElement;
  /** Show and hide the panel with the hidden attribute (default) or leave it to CSS via .is-open. */
  useHidden?: boolean;
  /** Close when focus moves out of the root (the profile menu); off for the nav panel. */
  closeOnFocusOut?: boolean;
  /** Called after every open or close. */
  onChange?: (open: boolean) => void;
}

export interface Disclosure {
  open(): void;
  close(options?: { returnFocus?: boolean }): void;
  readonly isOpen: boolean;
}

export function disclosure(button: HTMLButtonElement, panel: HTMLElement, { root = button.parentElement!, useHidden = true, closeOnFocusOut = false, onChange }: DisclosureOptions = {}): Disclosure {
  let isOpen = false;

  const set = (open: boolean) => {
    isOpen = open;
    button.setAttribute("aria-expanded", String(open));
    root.classList.toggle("is-open", open);
    if (useHidden) panel.hidden = !open;
    onChange?.(open);
  };

  const api: Disclosure = {
    open: () => set(true),
    close: ({ returnFocus = false } = {}) => {
      if (!isOpen) return;
      set(false);
      if (returnFocus) button.focus();
    },
    get isOpen() { return isOpen; },
  };

  button.setAttribute("aria-controls", panel.id);
  set(false);

  button.addEventListener("click", () => (isOpen ? api.close() : api.open()));

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen) {
      event.stopPropagation();
      api.close({ returnFocus: true });
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!isOpen || root.contains(event.target as Node)) return;
    api.close();
    // If the click lands on nothing you could Tab to, focus falls to <body> (or to
    // <main tabindex="-1">); put it back on the button. If it lands on another control,
    // that control keeps focus.
    requestAnimationFrame(() => {
      if (!isTabbable(document.activeElement)) button.focus();
    });
  });

  if (closeOnFocusOut) {
    root.addEventListener("focusout", (event) => {
      const next = event.relatedTarget as Node | null;
      if (isOpen && next && !root.contains(next)) api.close();
    });
  }

  return api;
}

/** Wires a site header: the collapsed nav's Menu button and, for admins, the profile menu. */
export function enhanceSiteHeader(header: HTMLElement): void {
  const nav = header.querySelector<HTMLElement>(".site-header__nav");
  const menuButton = nav?.querySelector<HTMLButtonElement>(".site-header__menu-button");
  const links = nav?.querySelector<HTMLElement>(".site-header__links");
  if (nav && menuButton && links) {
    nav.classList.add("is-enhanced");
    // CSS shows the links when the header is wide, whatever the state. The button keeps
    // one accessible name ("Menu") and shows its state with aria-expanded and the icon.
    const iconSlot = menuButton.querySelector<HTMLElement>(".site-header__menu-icon");
    disclosure(menuButton, links, {
      root: nav,
      useHidden: false,
      onChange: (open) => iconSlot?.replaceChildren(icon(open ? "close" : "menu")),
    });
  }
  const profile = header.querySelector<HTMLElement>(".profile-menu");
  const profileButton = profile?.querySelector<HTMLButtonElement>(".profile-menu__button");
  const panel = profile?.querySelector<HTMLElement>(".profile-menu__panel");
  if (profile && profileButton && panel) disclosure(profileButton, panel, { root: profile, closeOnFocusOut: true });
}

function isTabbable(el: Element | null): boolean {
  if (!(el instanceof HTMLElement) || el === document.body) return false;
  if (el.tabIndex < 0) return false;
  return el.matches("a[href], button, input, select, textarea, summary, [tabindex], [contenteditable='true']");
}
