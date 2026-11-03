// The item page's words (SPEC §7.3, §7.4, §7.5; DECISIONS #88). No DOM, so node:test covers it.
// The amount, detail and status come from the tile rules, so a tile and its page always agree.
import { formatDollars } from "../components/form-rules.ts";
import { beforeBidding, tileText, type TileContext, type TileItem, type TileText } from "../components/item-tile-rules.ts";
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
  /** The next step after winning: the proof upload lives in Your Items (SPEC §7.6). */
  link: { href: string; label: string } | null;
  /** What the panel offers: the bid form, the buy button, or nothing (the note says why). */
  action: "bid" | "buy" | null;
}

export function panelText(answer: ItemAnswer, ctx: TileContext): PanelText {
  const { item } = answer;
  const text = tileText(tileItemOf(item), ctx);
  const bought = item.type === "instant" && item.viewerPurchases > 0
    ? item.viewerPurchases === 1 ? "You've bought 1." : `You've bought ${item.viewerPurchases}.`
    : null;
  const won = item.type === "auction" && !item.cancelled && ctx.phase === "ended" && item.viewerIsTopBidder;
  const link = won ? { href: "/your-items", label: "Donate and upload proof in Your Items" } : null;
  const action = actionFor(answer, ctx);
  // With the bid form shown, the minimum is the field's help, so the note would repeat it.
  return { ...text, note: action === "bid" ? null : noteFor(answer, ctx), bought, link, action };
}

function actionFor({ item, blocked }: ItemAnswer, ctx: TileContext): PanelText["action"] {
  if (item.cancelled || beforeBidding(ctx.phase) || ctx.phase === "ended" || blocked) return null;
  return item.type === "auction" ? "bid" : "buy";
}

/** The bid dialog's title: "Place a $245 bid?" */
export function bidDialogTitle(amountCents: number): string {
  return `Place a ${dollars(amountCents)} bid?`;
}

/** The buy dialog's title: "Buy the Hand-knit scarf for $45?" */
export function buyDialogTitle(item: Pick<ItemDetail, "title" | "priceCents">): string {
  return `Buy the ${item.title} for ${dollars(item.priceCents ?? 0)}?`;
}

/** The item line in a dialog: "Top bid $240 · 6 bids", "Starting bid $150 · No bids yet", "6 left". */
export function dialogDetail(item: ItemDetail): string {
  if (item.type === "instant") return item.remaining === 1 ? "1 left" : `${item.remaining ?? 0} left`;
  if (item.highBidCents === null) return `Starting bid ${dollars(item.startingBidCents ?? 0)} · No bids yet`;
  return `Top bid ${dollars(item.highBidCents)} · ${bidCountWords(item.bids.length)}`;
}

/** Shown in the dialog when the request itself fails (no answer, or a server error); it stays open to try again. */
export function actionFailure(action: "bid" | "buy"): string {
  return action === "bid" ? "We couldn't place your bid. Check your connection and try again." : "We couldn't complete the purchase. Check your connection and try again.";
}

/** Refusals about the amount belong under the bid field; the rest (ended, sold out …) go to the panel. */
export function isAmountRefusal(code: string | undefined): boolean {
  return code === "too-low" || code === "outbid-race" || code === "not-whole-dollars";
}

function noteFor(answer: ItemAnswer, ctx: TileContext): string | null {
  const { item, blocked } = answer;
  // The cancelled banner says it all; nothing more under the amount.
  if (item.cancelled) return null;
  if (ctx.phase === "unscheduled") return `${item.type === "auction" ? "Bidding" : "Buying"} dates aren't set yet.`;
  if (beforeBidding(ctx.phase)) return `${item.type === "auction" ? "Bidding" : "Buying"} opens ${when(ctx.biddingOpens, ctx.now, ctx.timeZone)}.`;
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

/** The viewer's zone as a short name ("EST"), shown once beside the bid history heading. */
export function zoneName(at: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZoneName: "short", timeZone }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
}

/**
 * A bid's time in the viewer's zone: "today at 3:14 PM", "yesterday at …", "Oct 31 at …".
 * The zone is labeled once, beside the heading (`zoneName(now)`); a bid from the other side of
 * a clock change keeps its own zone ("Oct 31 at 7:00 PM EDT") so no time reads wrong.
 */
export function bidTime(iso: string, now: Date, timeZone?: string): string {
  const date = new Date(iso);
  const zone = zoneName(date, timeZone);
  const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(date);
  const time = zone === zoneName(now, timeZone) ? clock : `${clock} ${zone}`;
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
