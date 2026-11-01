// What an item tile says (DESIGN-SYSTEM.md › Item tile). Computed from the item, the
// viewer and the event phase, never hard-coded (SPEC §7.4). No DOM here, so the server
// and node:test can load it. Amounts are whole dollars (SPEC §7.9).
import { formatDollars } from "./form-rules.ts";

export type Phase = "submission" | "live" | "ended";
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

export interface TileContext {
  phase: Phase;
  now: Date;
  biddingOpens: Date;
  biddingCloses: Date;
  /** The viewer's time zone for dates (SPEC §7.1); defaults to the runtime's. */
  timeZone?: string;
}

export interface TileText {
  amount: string; // "Top bid $240"
  detail: string; // "6 bids"
  status?: { label: string; tone: Tone };
}

/** "Ending soon" within this many hours of the close; "N left" at or below this stock.
    Provisional values (DECISIONS #61), kept here so every screen agrees. */
export const ENDING_SOON_HOURS = 24;
export const LOW_STOCK = 3;

export function tileText(item: TileItem, ctx: TileContext): TileText {
  return { ...amountLine(item, ctx.phase), status: tileStatus(item, ctx) };
}

function amountLine(item: TileItem, phase: Phase): Pick<TileText, "amount" | "detail"> {
  if (item.type === "auction") {
    const bids = item.bidCount ?? 0;
    if (item.topBid === undefined || bids === 0) {
      const start = formatDollars(item.startingBid ?? 0);
      return phase === "ended" ? { amount: `Starting bid ${start}`, detail: "No bids" } : { amount: `Starts at ${start}`, detail: "No bids yet" };
    }
    const label = phase === "ended" ? "Winning bid" : "Top bid";
    return { amount: `${label} ${formatDollars(item.topBid)}`, detail: bids === 1 ? "1 bid" : `${bids} bids` };
  }
  const remaining = item.remaining ?? 0;
  const detail = remaining === 0 ? "None left" : phase === "submission" ? `${remaining} available` : `${remaining} left`;
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
  if (ctx.phase === "submission") return { label: `Opens ${shortDate(ctx.biddingOpens, ctx.timeZone)}`, tone: "neutral" };
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
