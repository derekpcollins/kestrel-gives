// Builds an item tile (DESIGN-SYSTEM.md › Item tile) from data. Every word on it comes from
// tileText(), so tiles can't drift from the rules.
import { tileText, type TileContext, type TileText, type TileView } from "./item-tile-rules.ts";

export type { TileView };

/**
 * Your Items passes its own words (`words`, from src/pages/your-items-rules.ts) in the same
 * shape, so a row there is the same tile with what that list needs to say.
 */
export function renderItemTile(item: TileView, ctx: TileContext, words?: TileText & { muted: boolean }): HTMLLIElement {
  const text = words ?? tileText(item, ctx);
  const muted = words ? words.muted : item.cancelled || ctx.phase === "ended";
  const li = document.createElement("li");
  const tile = document.createElement("article");
  tile.className = "card card--link item-tile" + (muted ? " item-tile--muted" : "");

  const media = document.createElement("div");
  media.className = "card__media";
  if (item.photo) {
    const img = document.createElement("img");
    img.src = item.photo;
    img.alt = "";
    img.loading = "lazy";
    media.append(img);
  }
  if (text.status) {
    const pill = document.createElement("span");
    pill.className = `pill item-tile__status${text.status.tone === "neutral" ? "" : ` pill--${text.status.tone}`}`;
    pill.textContent = text.status.label;
    media.append(pill);
  }

  const header = document.createElement("div");
  header.className = "card__header";
  const title = document.createElement("h3");
  title.className = "card__title";
  const link = document.createElement("a");
  link.href = item.href;
  link.textContent = item.title;
  title.append(link);
  header.append(title);

  const body = document.createElement("div");
  body.className = "card__body";
  const amount = document.createElement("p");
  amount.className = "item-tile__amount";
  amount.textContent = text.amount;
  const detail = document.createElement("p");
  detail.className = "item-tile__detail";
  detail.textContent = text.detail;
  if (text.amount) body.append(amount);
  body.append(detail);

  // The status pill sits over the photo, which comes before the title; screen readers get
  // it after the title instead, where it makes sense ("Lakeside Cabin Weekend, Outbid").
  if (text.status) {
    media.querySelector(".item-tile__status")?.setAttribute("aria-hidden", "true");
    const hidden = document.createElement("span");
    hidden.className = "visually-hidden";
    hidden.textContent = `, ${text.status.label}`;
    link.append(hidden);
  }

  tile.append(media, header, body);
  li.append(tile);
  return li;
}
