// The Admin Dashboard's Items section (SPEC §7.3–7.5, §8; DECISIONS #110, #115): every item with
// its bid history and, for instant sale, its purchases. A drawing only: src/pages/admin.ts
// supplies what Remove bid, Cancel purchase and Cancel item do.
import type { AdminBid, AdminItem, AdminItems, AdminPurchase } from "../admin-api.ts";
import { renderAvatar } from "../components/avatar.ts";
import { el } from "../components/dom.ts";
import { pill } from "../components/pill.ts";
import { enhanceTableScroll } from "../components/table.ts";
import { initials } from "./admin-rules.ts";
import { bidRow, purchaseRow, groupItems, itemRow, itemsLine } from "./admin-items-rules.ts";

/** What an item row's buttons do. `open` holds the items whose bid history is showing, kept across redraws. */
export interface ItemActions {
  removeBid(item: AdminItem, bid: AdminBid, phase: AdminItems["phase"]): void;
  cancel(item: AdminItem, phase: AdminItems["phase"]): void;
  cancelPurchase(item: AdminItem, purchase: AdminPurchase, phase: AdminItems["phase"]): void;
  open: Set<string>;
}

function bidTable(item: AdminItem, answer: AdminItems, actions: ItemActions): HTMLElement {
  const ctx = { phase: answer.phase, now: new Date(answer.now) };
  const rows = item.bids.length
    ? item.bids.map((b) => {
        const t = bidRow(b, item, ctx);
        const remove = el("button", { className: "btn btn--secondary btn--sm", attrs: { type: "button" } }, "Remove", el("span", { className: "visually-hidden", text: t.removeLabel }));
        remove.addEventListener("click", () => actions.removeBid(item, b, answer.phase));
        return el("tr", { className: t.removed ? "admin-bid--removed" : "" },
          el("th", { attrs: { scope: "row" } },
            el("span", { className: "admin-person" },
              renderAvatar(initials(b.bidder.firstName, b.bidder.lastName), { size: "sm", crowned: Boolean(t.top) }),
              el("span", { className: "admin-bid__who" },
                el("span", { className: "admin-person__name", text: t.name }),
                ...(t.top ? [pill(t.top, "success")] : []),
                ...(t.removed ? [pill("Removed", "neutral"), el("span", { className: "admin-bid__note", text: t.removed })] : []),
                // Below 40rem the Time column hides and the time shows here instead (only one is ever displayed).
                el("span", { className: "admin-bid__note admin-bid__when-inline", text: t.when })))),
          el("td", { className: "table__num admin-bid__amount", text: t.amount }),
          el("td", { className: "admin-bid__when", text: t.when }),
          el("td", { className: "admin-bid__action" }, ...(t.canRemove ? [remove] : [])));
      })
    : [el("tr", {}, el("td", { className: "table__empty", attrs: { colspan: "4" }, text: "No bids yet." }))];
  const captionId = `item-${item.id}-history`;
  const wrap = el("div", { className: "table-wrap", attrs: { role: "region", "aria-labelledby": captionId, "data-table-scroll": "" } },
    el("table", { className: "table admin-bids", attrs: { "aria-labelledby": captionId } },
      el("thead", {}, el("tr", {},
        el("th", { attrs: { scope: "col" }, text: "Bidder" }),
        el("th", { className: "table__num", attrs: { scope: "col" }, text: "Amount" }),
        el("th", { className: "admin-bid__when", attrs: { scope: "col" }, text: "Time" }),
        el("th", { attrs: { scope: "col" } }, el("span", { className: "visually-hidden", text: "Actions" })))),
      el("tbody", {}, ...rows)));
  enhanceTableScroll(wrap);
  return el("div", { className: "admin-item__history" },
    el("p", { className: "visually-hidden", attrs: { id: captionId }, text: `Bid history for ${item.title}, newest first` }), wrap);
}

/** Instant sale: each purchase (owner, 6D review; DECISIONS #115), laid out like the bid history. */
function purchaseTable(item: AdminItem, answer: AdminItems, actions: ItemActions): HTMLElement {
  const ctx = { now: new Date(answer.now) };
  const rows = item.purchaseList.length
    ? item.purchaseList.map((p) => {
        const t = purchaseRow(p, item, ctx);
        const cancel = el("button", { className: "btn btn--secondary btn--sm", attrs: { type: "button" } }, "Cancel purchase", el("span", { className: "visually-hidden", text: t.cancelLabel }));
        cancel.addEventListener("click", () => actions.cancelPurchase(item, p, answer.phase));
        return el("tr", { className: t.cancelled ? "admin-bid--removed" : "" },
          el("th", { attrs: { scope: "row" } },
            el("span", { className: "admin-person" },
              renderAvatar(initials(p.buyer.firstName, p.buyer.lastName), { size: "sm" }),
              el("span", { className: "admin-bid__who" },
                el("span", { className: "admin-person__name", text: t.name }),
                ...(t.cancelled ? [pill("Cancelled", "neutral"), el("span", { className: "admin-bid__note", text: t.cancelled })] : []),
                // Phones: price and date as a caption, so Cancel purchase fits.
                el("span", { className: "admin-bid__note admin-bid__when-inline", text: `${t.amount} · ${t.when}` })))),
          el("td", { className: "table__num admin-bid__amount admin-purchase__price", text: t.amount }),
          el("td", { className: "admin-bid__when", text: t.when }),
          el("td", { className: "admin-bid__action" }, ...(t.canCancel ? [cancel] : [])));
      })
    : [el("tr", {}, el("td", { className: "table__empty", attrs: { colspan: "4" }, text: "No purchases yet." }))];
  const captionId = `item-${item.id}-purchases`;
  const wrap = el("div", { className: "table-wrap", attrs: { role: "region", "aria-labelledby": captionId, "data-table-scroll": "" } },
    el("table", { className: "table admin-bids admin-purchases", attrs: { "aria-labelledby": captionId } },
      el("thead", {}, el("tr", {},
        el("th", { attrs: { scope: "col" }, text: "Buyer" }),
        el("th", { className: "table__num admin-purchase__price", attrs: { scope: "col" }, text: "Price" }),
        el("th", { className: "admin-bid__when", attrs: { scope: "col" }, text: "Bought" }),
        el("th", { attrs: { scope: "col" } }, el("span", { className: "visually-hidden", text: "Actions" })))),
      el("tbody", {}, ...rows)));
  enhanceTableScroll(wrap);
  return el("div", { className: "admin-item__history" },
    el("p", { className: "visually-hidden", attrs: { id: captionId }, text: `Purchases of ${item.title}, newest first` }), wrap);
}

function itemCard(item: AdminItem, answer: AdminItems, actions: ItemActions): HTMLLIElement {
  const t = itemRow(item, { phase: answer.phase, now: new Date(answer.now) });
  const headingId = `item-${item.id}-title`;
  const card = el("li", { className: `card card--flat admin-item${item.cancelled ? " admin-item--cancelled" : ""}`, attrs: { "aria-labelledby": headingId, "data-item-id": item.id } },
    el("div", { className: "admin-item__main" },
      item.coverUrl ? el("img", { className: "admin-item__thumb", attrs: { src: item.coverUrl, alt: "", loading: "lazy" } }) : el("span", { className: "admin-item__thumb", attrs: { "aria-hidden": "true" } }),
      el("div", { className: "admin-item__text" },
        el("div", { className: "admin-item__head" },
          el("h4", { className: "admin-item__title", attrs: { id: headingId, tabindex: "-1" } }, el("a", { attrs: { href: `/items/${item.id}` }, text: item.title })),
          ...(t.status ? [pill(t.status.label, t.status.tone)] : [])),
        el("p", { className: "admin-item__figures", text: t.figures }),
        el("p", { className: "admin-item__donor", text: t.donor }),
        ...(t.cancelled ? [el("p", { className: "admin-item__donor", text: t.cancelled })] : []),
      ),
    ),
  );
  const buttons: HTMLElement[] = [];
  let panel: HTMLElement | null = null;
  const label = t.history ?? t.purchasesLabel;
  if (label) {
    const panelId = `item-${item.id}-panel`;
    const isOpen = actions.open.has(item.id);
    const toggle = el("button", { className: "btn btn--secondary admin-item__toggle", attrs: { type: "button", "aria-expanded": String(isOpen), "aria-controls": panelId } },
      el("span", { text: `${isOpen ? "Hide" : "Show"} ${label}` }), el("span", { className: "visually-hidden", text: ` for ${item.title}` }));
    const shown = el("div", { className: "admin-item__panel", attrs: { id: panelId, ...(isOpen ? {} : { hidden: "" }) } },
      item.type === "auction" ? bidTable(item, answer, actions) : purchaseTable(item, answer, actions));
    panel = shown;
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      toggle.firstChild!.textContent = `${open ? "Hide" : "Show"} ${label}`;
      shown.hidden = !open;
      if (open) actions.open.add(item.id); else actions.open.delete(item.id);
    });
    buttons.push(toggle);
  }
  if (t.canCancel) {
    const cancel = el("button", { className: "btn btn--secondary", attrs: { type: "button" } }, "Cancel item", el("span", { className: "visually-hidden", text: ` (${item.title})` }));
    cancel.addEventListener("click", () => actions.cancel(item, answer.phase));
    buttons.push(cancel);
  }
  if (buttons.length) card.append(el("div", { className: "admin-item__actions" }, ...buttons));
  if (panel) card.append(panel);
  return card;
}

export function items(answer: AdminItems, actions: ItemActions): Node[] {
  const { auction, instant } = groupItems(answer.items);
  const group = (id: string, title: string, list: AdminItem[]) =>
    el("section", { className: "admin-items", attrs: { "aria-labelledby": id } },
      el("h3", { className: "proof-queue__title", text: `${title} (${list.length})`, attrs: { id } }),
      list.length ? el("ul", { className: "admin-items__list" }, ...list.map((i) => itemCard(i, answer, actions))) : el("p", { className: "admin-glance", text: "No items yet." }));
  return [
    el("p", { className: "admin-glance", text: `${itemsLine(answer.items)}. Removing a bid or cancelling a purchase or item asks first, and can't be undone.` }),
    el("div", { className: "admin-alert", attrs: { "data-admin-alert": "" } }),
    group("items-auction", "Silent auction", auction),
    group("items-instant", "Instant sale", instant),
  ];
}
