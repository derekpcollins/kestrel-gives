// The item page (SPEC §7.3, §8; DECISIONS #86, #88): photos, details, the amount and status,
// the bid form or buy button (src/pages/item-actions.ts) or why the viewer can't act, and the
// public bid history with the crown. The id comes from the path (/items/12). While the tab is
// visible it refreshes every 30 seconds (SPEC §7.4), and announces only a change in the
// viewer's own standing. Bid and buy results are announced too.
import type { AppState } from "../app-state.ts";
import { renderAvatar } from "../components/avatar.ts";
import { enhanceCarousel } from "../components/carousel.ts";
import { el } from "../components/dom.ts";
import { formatDollars } from "../components/form-rules.ts";
import { hydrateIcons } from "../components/icons.ts";
import { enhanceTableScroll } from "../components/table.ts";
import type { ItemAnswer, ItemDetail } from "../items-api.ts";
import { tileContext } from "./browse-rules.ts";
import { createActions } from "./item-actions.ts";
import { backLink, bidCountWords, bidTime, bidderName, donatedBy, initialsOf, itemIdFromPath, panelText, refreshAnnouncement, zoneName } from "./item-rules.ts";

const REFRESH_MS = 30_000;

export function startItemPage(): void {
  const content = document.querySelector<HTMLElement>("[data-item-content]");
  const status = document.querySelector<HTMLElement>("[data-item-status]");
  const missing = document.querySelector<HTMLElement>("[data-item-missing]");
  const failed = document.querySelector<HTMLElement>("[data-item-error]");
  if (!content || !status || !missing || !failed) return;

  const id = itemIdFromPath(location.pathname);
  let state: AppState | null = null;
  let shown: ItemAnswer | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest = 0;
  let acting = false;

  const showMissing = () => {
    content.replaceChildren();
    content.removeAttribute("aria-busy");
    missing.hidden = false;
    document.title = "Item not found · Kestrel Gives";
  };
  if (!id) return showMissing();

  const schedule = () => {
    clearTimeout(timer);
    if (document.visibilityState === "visible") timer = setTimeout(() => void load("refresh"), REFRESH_MS);
  };

  const load = async (why: "first" | "state" | "refresh" | "action") => {
    if (!state) return;
    // While a bid or buy dialog is open, the refresh waits so the page doesn't move behind it.
    if (why === "refresh" && acting) return schedule();
    const request = ++latest;
    let response: Response;
    try {
      response = await fetch(`/api/items?id=${id}`, { headers: { Accept: "application/json" } });
    } catch {
      if (request === latest && why !== "refresh") showError();
      return schedule();
    }
    // An unread body keeps the response open (the page never goes idle), so error answers are read too.
    if (!response.ok) await response.text().catch(() => "");
    if (request !== latest) return;
    if (response.status === 404) return showMissing();
    if (!response.ok) {
      if (why !== "refresh") showError();
      return schedule();
    }
    const answer = (await response.json()) as ItemAnswer;
    if (request !== latest) return;
    // Only the viewer's own standing is announced, and only on a refresh: a redraw for a new
    // viewer or phase (from the demo bar) changes whose standing it is, so it stays quiet.
    const message = why === "refresh" && shown ? refreshAnnouncement(shown.item, answer.item) : null;
    render(answer);
    if (message) announce(message);
    schedule();
  };

  // Cleared first, so the same words twice in a row (two lost races) are still read.
  let announcing: ReturnType<typeof setTimeout> | undefined;
  const announce = (message: string) => {
    clearTimeout(announcing);
    status.textContent = "";
    announcing = setTimeout(() => { status.textContent = message; }, 50);
  };

  const actions = createActions({
    show: (answer) => { render(answer); schedule(); },
    reload: () => load("action"),
    announce,
    setActing: (on) => { acting = on; },
  });

  const showError = () => {
    if (shown) return; // keep showing what we have; the next refresh tries again
    content.removeAttribute("aria-busy");
    failed.hidden = false;
  };

  const render = (answer: ItemAnswer) => {
    const first = shown === null;
    const keep = first ? null : captureFocus(content);
    shown = answer;
    failed.hidden = true;
    missing.hidden = true;
    document.title = `${answer.item.title} · Kestrel Gives`;
    // Keep the carousel (and the photo the visitor is on) when the photos haven't changed.
    const oldCarousel = content.querySelector<HTMLElement>("[data-carousel]");
    content.replaceChildren(...renderItem(answer, state!, actions.render));
    content.removeAttribute("aria-busy");
    const newCarousel = content.querySelector<HTMLElement>("[data-carousel]");
    if (oldCarousel && newCarousel && oldCarousel.dataset.photosKey === newCarousel.dataset.photosKey) newCarousel.replaceWith(oldCarousel);
    else if (newCarousel) enhanceCarousel(newCarousel);
    content.querySelectorAll<HTMLElement>("[data-table-scroll]").forEach(enhanceTableScroll);
    hydrateIcons(content);
    if (keep) keep();
  };

  failed.querySelector("button")?.addEventListener("click", () => { failed.hidden = true; void load("first"); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void load("refresh");
    else clearTimeout(timer);
  });
  document.addEventListener("kg:state", (event) => {
    const firstState = state === null;
    state = (event as CustomEvent<AppState>).detail;
    void load(firstState ? "first" : "state");
  });
  hydrateIcons();
}

/** Redraws replace the content; this puts focus back on the same control (by its data-focus-key). */
function captureFocus(root: HTMLElement): (() => void) | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  const key = active.closest<HTMLElement>("[data-focus-key]")?.dataset.focusKey;
  return key ? () => root.querySelector<HTMLElement>(`[data-focus-key="${key}"]`)?.focus() : null;
}

type RenderActions = (answer: ItemAnswer, action: "bid" | "buy" | null) => HTMLElement | null;

function renderItem(answer: ItemAnswer, state: AppState, renderActions: RenderActions): Node[] {
  const { item } = answer;
  const ctx = tileContext(state);
  const text = panelText(answer, ctx);
  const back = backLink(item);

  const header = el("header", { className: "page-header" },
    el("a", { className: "link link--quiet page-header__back", attrs: { href: back.href, "data-focus-key": "back" } },
      el("span", { attrs: { "data-icon": "chevron-left" } }), back.label),
    el("div", { className: "page-header__row" },
      el("div", { className: "page-header__text" },
        el("h1", { className: "page-header__title", text: item.title }),
        el("p", { className: "page-header__description", text: donatedBy(item) }))));

  const nodes: Node[] = [header];
  if (item.cancelled) {
    nodes.push(el("div", { className: "banner banner--danger" },
      el("span", { attrs: { "data-icon": "alert" } }),
      el("div", { className: "banner__body" },
        el("p", { className: "banner__title", text: "This item has been cancelled" }),
        el("p", { className: "banner__text", text: "It's no longer offered. Bids and purchases on it don't count toward anyone's donation." }))));
  }

  const panel = el("section", { className: "card card--flat item-panel" + (item.cancelled || ctx.phase === "ended" ? " item-panel--muted" : ""), attrs: { "aria-labelledby": "item-amount-label", "data-item-panel": "", tabindex: "-1" } },
    el("h2", { className: "visually-hidden", attrs: { id: "item-amount-label" }, text: item.type === "auction" ? "Bidding" : "Buying" }),
    text.status ? el("p", { className: `pill item-panel__status${text.status.tone === "neutral" ? "" : ` pill--${text.status.tone}`}`, text: text.status.label }) : null,
    el("p", { className: "item-panel__amount", text: text.amount }),
    el("p", { className: "item-panel__detail", text: text.detail }),
    text.note ? el("p", { className: "item-panel__note", text: text.note }) : null,
    text.bought ? el("p", { className: "item-panel__note", text: text.bought }) : null,
    text.link ? el("a", { className: "link item-panel__link", attrs: { href: text.link.href, "data-focus-key": "next-step" }, text: text.link.label }) : null,
    el("div", { className: "item-panel__actions", attrs: { "data-item-actions": "" } }, renderActions(answer, text.action)));

  nodes.push(el("div", { className: "item-layout" }, carousel(item), panel));
  nodes.push(el("section", { className: "item-section", attrs: { "aria-labelledby": "about-title" } },
    el("h2", { className: "item-section__title", attrs: { id: "about-title" }, text: "About this item" }),
    el("p", { className: "item-section__text", text: item.description })));
  if (item.type === "auction") nodes.push(bidHistory(item, new Date(state.now)));
  return nodes;
}

function carousel(item: ItemDetail): HTMLElement {
  const total = item.photos.length;
  const label = (i: number) => `Photo ${i + 1} of ${total}`;
  const root = el("section", { className: `carousel${total <= 1 ? " carousel--single" : ""}`, attrs: { "aria-label": `Photos of ${item.title}`, "data-carousel": "", "data-photos-key": item.photos.map((p) => p.url).join(" ") } });
  const stage = el("div", { className: "carousel__stage" });
  item.photos.forEach((p, i) => {
    const slide = el("figure", { className: "carousel__slide" },
      el("img", { attrs: { src: p.url, alt: total > 1 ? `${item.title}, ${label(i).toLowerCase()}` : item.title, ...(i === 0 ? {} : { loading: "lazy" }) } }));
    slide.hidden = i !== 0;
    stage.append(slide);
  });
  if (total > 1) {
    stage.append(
      el("button", { className: "btn btn--secondary btn--icon carousel__nav carousel__nav--prev", attrs: { type: "button", "data-carousel-prev": "", "aria-label": "Previous photo", "data-focus-key": "prev" } }, el("span", { attrs: { "data-icon": "chevron-left" } })),
      el("button", { className: "btn btn--secondary btn--icon carousel__nav carousel__nav--next", attrs: { type: "button", "data-carousel-next": "", "aria-label": "Next photo", "data-focus-key": "next" } }, el("span", { attrs: { "data-icon": "chevron-right" } })),
      el("p", { className: "carousel__count", attrs: { "aria-live": "polite" }, text: label(0) }));
  }
  root.append(stage);
  if (total > 1) {
    root.append(el("ul", { className: "carousel__thumbs" },
      ...item.photos.map((p, i) => el("li", {},
        el("button", { className: "carousel__thumb", attrs: { type: "button", "aria-label": label(i), "data-focus-key": `thumb-${i}`, ...(i === 0 ? { "aria-current": "true" } : {}) } },
          el("img", { attrs: { src: p.url, alt: "", loading: "lazy" } }))))));
  }
  return root;
}

function bidHistory(item: ItemDetail, now: Date): HTMLElement {
  // Below 40rem the Time column hides and the time shows as a line under the name instead
  // (only one of the two is ever displayed, so nothing is read twice).
  const rows = item.bids.length
    ? item.bids.map((b) => el("tr", {},
        el("th", { attrs: { scope: "row" } },
          el("span", { className: "bid-history__bidder" },
            renderAvatar(initialsOf(b), { size: "sm", crowned: b.isTop }),
            el("span", { className: "bid-history__who" },
              el("span", {}, bidderName(b), b.isTop ? el("span", { className: "visually-hidden", text: " (top bidder)" }) : null),
              el("span", { className: "bid-history__when", text: bidTime(b.createdAt, now) })))),
        el("td", { className: "table__num", text: formatDollars(b.amountCents / 100) }),
        el("td", { className: "bid-history__time", text: bidTime(b.createdAt, now) })))
    : [el("tr", {}, el("td", { className: "table__empty", attrs: { colspan: "3" }, text: "No bids yet." }))];
  const zone = zoneName(now);

  return el("section", { className: "item-section", attrs: { "aria-labelledby": "history-title" } },
    el("h2", { className: "item-section__title", attrs: { id: "history-title" } }, "Bid history ", el("span", { className: "item-section__count", text: `(${bidCountWords(item.bids.length)})` }),
      zone ? el("span", { className: "item-section__count", text: ` · times in ${zone}` }) : null),
    el("p", { className: "visually-hidden", attrs: { id: "history-order" }, text: "Newest first." }),
    // Named by the visible heading rather than a hidden caption: a <caption> keeps a line of
    // height and its full width even when visually hidden, which shows and fails reflow.
    el("div", { className: "table-wrap", attrs: { role: "region", "aria-labelledby": "history-title", "data-table-scroll": "" } },
      el("table", { className: "table bid-history", attrs: { "aria-labelledby": "history-title", "aria-describedby": "history-order" } },
        el("thead", {}, el("tr", {},
          el("th", { attrs: { scope: "col" }, text: "Bidder" }),
          el("th", { className: "table__num", attrs: { scope: "col" }, text: "Amount" }),
          el("th", { className: "bid-history__time", attrs: { scope: "col" }, text: "Time" }))),
        el("tbody", {}, ...rows))));
}
