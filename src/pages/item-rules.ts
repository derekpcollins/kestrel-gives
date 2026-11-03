// The item page's words (SPEC §7.3, §7.4, §7.5; DECISIONS #88). No DOM, so node:test covers it.
// The amount, detail and status come from the tile rules, so a tile and its page always agree.
import { formatDollars } from "../components/form-rules.ts";
import { tileText, type TileContext, type TileItem, type TileText } from "../components/item-tile-rules.ts";
import { when } from "../components/phase-banner-rules.ts";
import type { BidView, ItemAnswer, ItemDetail } from "../items-api.ts";

/** The id in /items/<id> (DECISIONS #86), if the path has one. */
export function itemIdFromPath(path: string): string | null {
  return /^\/items\/([1-9]\d{0,17})\/?$/.exec(path)?.[1] ?? null;
}

const dollars = (cents: number) => formatDollars(cents / 100);
const name = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

/** The item as the tile rules see it (cents to dollars). */
export function tileItemOf(item: ItemDetail): TileItem {
  const t: TileItem = {
    type: item.type, bidCount: item.bids.length, cancelled: item.cancelled,
    viewerIsTopBidder: item.viewerIsTopBidder, viewerHasBid: item.viewerHasBid,
  };
  if (item.startingBidCents !== null) t.startingBid = item.startingBidCents / 100;
  if (item.highBidCents !== null) t.topBid = item.highBidCents / 100;
  if (item.priceCents !== null) t.price = item.priceCents / 100;
  if (item.remaining !== null) t.remaining = item.remaining;
  return t;
}

export interface PanelText extends TileText {
  /** One sentence under the amount: the minimum, why the viewer can't act, or the result. */
  note: string | null;
  /** Instant sale: how many the viewer has bought. */
  bought: string | null;
}

export function panelText(answer: ItemAnswer, ctx: TileContext): PanelText {
  const { item } = answer;
  const text = tileText(tileItemOf(item), ctx);
  const bought = item.type === "instant" && item.viewerPurchases > 0
    ? item.viewerPurchases === 1 ? "You've bought 1." : `You've bought ${item.viewerPurchases}.`
    : null;
  return { ...text, note: noteFor(answer, ctx), bought };
}

function noteFor(answer: ItemAnswer, ctx: TileContext): string | null {
  const { item, blocked } = answer;
  // The cancelled banner says it all; nothing more under the amount.
  if (item.cancelled) return null;
  if (ctx.phase === "submission") return `${item.type === "auction" ? "Bidding" : "Buying"} opens ${when(ctx.biddingOpens, ctx.now, ctx.timeZone)}.`;
  if (ctx.phase === "ended") return item.type === "auction" ? auctionResult(item) : "The sale has ended.";
  if (blocked?.code === "own-item") return "This is your item.";
  if (blocked?.code === "high-bidder") return "You're the high bidder.";
  if (blocked?.code === "sold-out") return "Sold out.";
  return answer.bidHint;
}

/** After the close: who won, in words. The winner is the top bid (finalized from the same order). */
export function auctionResult(item: ItemDetail): string {
  const top = item.bids.find((b) => b.isTop);
  if (!top) return "Bidding has ended. No one bid on this item.";
  if (item.viewerIsTopBidder) return `You won this item for ${dollars(top.amountCents)}.`;
  return `Won by ${name(top)} for ${dollars(top.amountCents)}.`;
}

/** "Lakeside Cabin Weekend, donated by Theo Lindqvist" */
export function donatedBy(item: ItemDetail): string {
  return `Donated by ${name(item.submitter)}`;
}

export function backLink(item: Pick<ItemDetail, "type">): { href: string; label: string } {
  return item.type === "auction" ? { href: "/silent-auction", label: "Silent Auction" } : { href: "/instant-sale", label: "Instant Sale" };
}

/** A bid's time in the viewer's zone, zone labeled: "today at 3:14 PM EST", "yesterday at …", "Oct 31 at …". */
export function bidTime(iso: string, now: Date, timeZone?: string): string {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone }).format(date);
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(d);
  const daysAgo = Math.round((Date.parse(`${day(now)}T00:00:00Z`) - Date.parse(`${day(date)}T00:00:00Z`)) / 86_400_000);
  if (daysAgo === 0) return `today at ${time}`;
  if (daysAgo === 1) return `yesterday at ${time}`;
  const sameYear = day(date).slice(0, 4) === day(now).slice(0, 4);
  const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: sameYear ? undefined : "numeric", timeZone }).format(date);
  return `${short} at ${time}`;
}

export function bidderName(bid: BidView): string {
  return name(bid);
}

export function initialsOf(bid: Pick<BidView, "firstName" | "lastName">): string {
  return `${bid.firstName[0] ?? ""}${bid.lastName[0] ?? ""}`.toUpperCase();
}

/** "6 bids" in the history heading's count. */
export function bidCountWords(n: number): string {
  return n === 1 ? "1 bid" : `${n} bids`;
}

/** Where the viewer stands on an auction, for the 30-second refresh. */
export type ViewerStanding = "top" | "outbid" | "none";

export function standingOf(item: ItemDetail): ViewerStanding {
  if (item.type !== "auction") return "none";
  return item.viewerIsTopBidder ? "top" : item.viewerHasBid ? "outbid" : "none";
}

/**
 * What the refresh announces: only a change in the viewer's own standing (DECISIONS #88).
 * Someone else outbidding someone else, or a new bid when the viewer hasn't bid, says nothing.
 */
export function refreshAnnouncement(before: ItemDetail, after: ItemDetail): string | null {
  const was = standingOf(before);
  const now = standingOf(after);
  if (was === now || after.highBidCents === null) return null;
  if (was === "top" && now === "outbid") return `You've been outbid. The top bid is now ${dollars(after.highBidCents)}.`;
  if (now === "top") return `You're the high bidder at ${dollars(after.highBidCents)}.`;
  return null;
}
