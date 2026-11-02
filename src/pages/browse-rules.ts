// Browse pages (SPEC §8, DECISIONS #88): which sorts each page offers, reading the sort from
// the URL, and the words around the grid. No DOM, so node:test covers it.
import type { TileContext, TileView } from "../components/item-tile-rules.ts";
import type { AppState } from "../app-state.ts";
import type { BrowseSort, ItemSummary, ItemType } from "../items-api.ts";

export const SORT_LABELS: Record<BrowseSort, string> = {
  newest: "Newest",
  price: "Price: low to high",
  bids: "Most bids",
};

/** Most bids only makes sense for the silent auction. */
export function sortsFor(type: ItemType): BrowseSort[] {
  return type === "auction" ? ["newest", "price", "bids"] : ["newest", "price"];
}

/** The sort in `?sort=`, if this page offers it; otherwise Newest. */
export function sortFromSearch(search: string, type: ItemType): BrowseSort {
  const sort = new URLSearchParams(search).get("sort");
  return sortsFor(type).find((s) => s === sort) ?? "newest";
}

/** The query string for a sort: Newest is the default, so it has none. */
export function searchForSort(search: string, sort: BrowseSort): string {
  const params = new URLSearchParams(search);
  if (sort === "newest") params.delete("sort");
  else params.set("sort", sort);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function countWords(n: number): string {
  return n === 1 ? "1 item" : `${n} items`;
}

/** Announced after the visitor changes the sort (never on load or refresh). */
export function sortedMessage(sort: BrowseSort, n: number): string {
  return `Sorted by ${SORT_LABELS[sort].toLowerCase()}. ${countWords(n)}.`;
}

export function emptyWords(type: ItemType): { title: string; text: string } {
  return type === "auction"
    ? { title: "No silent auction items yet", text: "Items donated for the silent auction will show up here." }
    : { title: "No instant sale items yet", text: "Items donated for instant sale will show up here." };
}

/** The tile rules' context from the app state. Missing dates fall far in the future. */
export function tileContext(state: AppState): TileContext {
  const now = new Date(state.now);
  const later = new Date(now.getTime() + 365 * 86_400_000);
  const date = (iso: string | null | undefined) => (iso ? new Date(iso) : later);
  return {
    phase: state.event?.phase ?? "submission",
    now,
    biddingOpens: date(state.event?.biddingOpensAt),
    biddingCloses: date(state.event?.biddingClosesAt),
  };
}

/** An API item as a tile: cents to dollars, and its link (DECISIONS #86). */
export function tileView(item: ItemSummary): TileView {
  const dollars = (cents: number | null) => (cents === null ? undefined : cents / 100);
  const view: TileView = {
    type: item.type,
    title: item.title,
    href: `/items/${item.id}`,
    bidCount: item.bidCount,
    viewerIsTopBidder: item.viewerIsTopBidder,
    viewerHasBid: item.viewerHasBid,
  };
  if (item.coverUrl) view.photo = item.coverUrl;
  const starting = dollars(item.startingBidCents);
  const top = dollars(item.topBidCents);
  const price = dollars(item.priceCents);
  if (starting !== undefined) view.startingBid = starting;
  if (top !== undefined) view.topBid = top;
  if (price !== undefined) view.price = price;
  if (item.remaining !== null) view.remaining = item.remaining;
  return view;
}
