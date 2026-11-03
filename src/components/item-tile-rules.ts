// What an item tile says (DESIGN-SYSTEM.md › Item tile). Computed from the item, the
// viewer and the event phase, never hard-coded (SPEC §7.4). No DOM here, so the server
// and node:test can load it. Amounts are whole dollars (SPEC §7.9).
import { formatDollars } from "./form-rules.ts";
import { ENDING_SOON_HOURS, LOW_STOCK } from "./thresholds.ts";

/**
 * The event's phase (SPEC §7.1). `unscheduled`: a date is missing (as after Reset for next year);
 * `upcoming`: dates set, submissions not open yet (v1.17; DECISIONS entry 108).
 */
export type Phase = "unscheduled" | "upcoming" | "submission" | "live" | "ended";

/** Before bidding opens: nobody bids or buys yet. */
export function beforeBidding(phase: Phase): boolean {
  return phase === "unscheduled" || phase === "upcoming" || phase === "submission";
}
export type Tone = "neutral" | "success" | "warning" | "danger";

export interface TileItem {
  type: "auction" | "instant";
  startingBid?: number; // auction, dollars
  topBid?: number; // auction, dollars; undefined when there are no bids
  bidCount?: number; // auction
  price?: number; // instant, dollars
  remaining?: number; // instant, units left
  cancelled?: boolean;
  viewerIsTopBidder?: boolean;
  viewerHasBid?: boolean;
}

/** A tile's data plus what it links to. */
export interface TileView extends TileItem {
  title: string;
  href: string;
  /** Cover photo URL; omitted for the placeholder. */
  photo?: string;
}

export interface TileContext {
  phase: Phase;
  now: Date;
  biddingOpens: Date;
  biddingCloses: Date;
  /** The viewer's time zone for dates (SPEC §7.1); defaults to the runtime's. */
  timeZone?: string;
}

export interface TileText {
  amount: string; // "$240"
  detail: string; // "Top bid · 6 bids"
  status?: { label: string; tone: Tone };
}

export function tileText(item: TileItem, ctx: TileContext): TileText {
  return { ...amountLine(item, ctx.phase), status: tileStatus(item, ctx) };
}

/** Only the number takes the amount style; its label goes on the detail line ("Top bid · 2 bids"). */
function amountLine(item: TileItem, phase: Phase): Pick<TileText, "amount" | "detail"> {
  if (item.type === "auction") {
    const bids = item.bidCount ?? 0;
    if (item.topBid === undefined || bids === 0) {
      return { amount: formatDollars(item.startingBid ?? 0), detail: phase === "ended" ? "Starting bid · No bids" : "Starting bid · No bids yet" };
    }
    const label = phase === "ended" ? "Winning bid" : "Top bid";
    return { amount: formatDollars(item.topBid), detail: `${label} · ${bids === 1 ? "1 bid" : `${bids} bids`}` };
  }
  const remaining = item.remaining ?? 0;
  const detail =
    remaining === 0 ? "None left"
    : phase === "ended" ? "Sale ended"
    : beforeBidding(phase) ? `${remaining} available`
    : `${remaining} left`;
  return { amount: formatDollars(item.price ?? 0), detail };
}

/** One status per tile, most important first (DESIGN-SYSTEM.md lists the order). */
export function tileStatus(item: TileItem, ctx: TileContext): TileText["status"] {
  if (item.cancelled) return { label: "Cancelled", tone: "danger" };
  const remaining = item.remaining ?? 0;
  if (ctx.phase === "ended") {
    if (item.type === "auction") return item.viewerIsTopBidder ? { label: "You won", tone: "success" } : { label: "Ended", tone: "neutral" };
    return remaining === 0 ? { label: "Sold out", tone: "neutral" } : { label: "Ended", tone: "neutral" };
  }
  if (ctx.phase === "unscheduled") return { label: "Dates not set", tone: "neutral" };
  if (beforeBidding(ctx.phase)) return { label: `Opens ${shortDate(ctx.biddingOpens, ctx.timeZone)}`, tone: "neutral" };
  // Live.
  const endingSoon = ctx.biddingCloses.getTime() - ctx.now.getTime() <= ENDING_SOON_HOURS * 3_600_000;
  if (item.type === "auction") {
    if (item.viewerIsTopBidder) return { label: "You're winning", tone: "success" };
    if (item.viewerHasBid) return { label: "Outbid", tone: "danger" };
  } else {
    if (remaining === 0) return { label: "Sold out", tone: "neutral" };
    if (remaining <= LOW_STOCK) return { label: `${remaining} left`, tone: "warning" };
  }
  return endingSoon ? { label: "Ending soon", tone: "warning" } : undefined;
}

function shortDate(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(date);
}
