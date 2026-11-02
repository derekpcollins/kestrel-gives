// Bidding and buying rules (SPEC §7.4, §7.5, DECISIONS #88), shared by the API and the item
// page so both say the same thing. No DOM, so the server and node:test can load it. Amounts
// are cents here, as stored; copy shows whole dollars. Every amount in copy is computed from
// the event settings and the item, never typed in (SPEC §7.4).
import { formatDollars } from "./form-rules.ts";
import type { Phase } from "./item-tile-rules.ts";

export type SaleRefusalCode =
  | "not-open" | "ended" | "cancelled" | "own-item" | "high-bidder"
  | "not-whole-dollars" | "too-low" | "outbid-race" | "sold-out";

export interface SaleRefusal {
  code: SaleRefusalCode;
  message: string;
}

export interface BidState {
  phase: Phase;
  cancelled: boolean;
  viewerIsSubmitter: boolean;
  startingBidCents: number;
  incrementCents: number;
  /** The current high bid, or null with no bids. */
  highBidCents: number | null;
  viewerIsHighBidder: boolean;
}

export interface BuyState {
  phase: Phase;
  cancelled: boolean;
  viewerIsSubmitter: boolean;
  remaining: number;
}

const dollars = (cents: number) => formatDollars(cents / 100);

/** The lowest bid that counts now: the starting bid, or the high bid plus the increment. */
export function minimumBidCents(s: Pick<BidState, "startingBidCents" | "incrementCents" | "highBidCents">): number {
  return s.highBidCents === null ? s.startingBidCents : s.highBidCents + s.incrementCents;
}

/** "At least $50. Bids go up by $5." */
export function bidHint(s: Pick<BidState, "startingBidCents" | "incrementCents" | "highBidCents">): string {
  return `At least ${dollars(minimumBidCents(s))}. Bids go up by ${dollars(s.incrementCents)}.`;
}

/** Why this viewer can't bid or buy at all right now; shared by both. Null if nothing stops them. */
function blockedBy(s: { phase: Phase; cancelled: boolean; viewerIsSubmitter: boolean }, verb: "Bidding" | "Buying"): SaleRefusal | null {
  if (s.cancelled) return { code: "cancelled", message: "This item has been cancelled." };
  if (s.phase === "submission") return { code: "not-open", message: `${verb} hasn't opened yet.` };
  if (s.phase === "ended") return { code: "ended", message: `${verb} has ended.` };
  if (s.viewerIsSubmitter) return { code: "own-item", message: "This is your item." };
  return null;
}

/** Why the bid form isn't offered: phase, cancelled, own item, or already the high bidder. */
export function bidBlock(s: BidState): SaleRefusal | null {
  const blocked = blockedBy(s, "Bidding");
  if (blocked) return blocked;
  if (s.viewerIsHighBidder) return { code: "high-bidder", message: "You're already the high bidder." };
  return null;
}

/**
 * Checks one bid. `seenHighBidCents` is the high bid the bidder's page showed (undefined when
 * unknown): if it has moved since and the amount no longer clears the minimum, they lost a
 * race and get the new minimum rather than a plain "too low".
 */
export function checkBid(s: BidState, amountCents: number, seenHighBidCents?: number | null): SaleRefusal | null {
  const blocked = bidBlock(s);
  if (blocked) return blocked;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents % 100 !== 0) {
    return { code: "not-whole-dollars", message: "Whole dollars only." };
  }
  const minimum = minimumBidCents(s);
  if (amountCents >= minimum) return null;
  if (seenHighBidCents !== undefined && seenHighBidCents !== s.highBidCents && s.highBidCents !== null) {
    return { code: "outbid-race", message: raceMessage(s.highBidCents, minimum) };
  }
  return { code: "too-low", message: `Bids must be at least ${dollars(minimum)}.` };
}

/** "Someone just bid $55. The minimum is now $60." */
export function raceMessage(highBidCents: number, minimumCents: number): string {
  return `Someone just bid ${dollars(highBidCents)}. The minimum is now ${dollars(minimumCents)}.`;
}

/** Why the buy button isn't offered (or a purchase is refused). One unit per purchase. */
export function buyBlock(s: BuyState): SaleRefusal | null {
  const blocked = blockedBy(s, "Buying");
  if (blocked) return blocked;
  if (s.remaining <= 0) return { code: "sold-out", message: "Sold out." };
  return null;
}

/** HTTP status for each refusal: 422 for a bad amount, 403 for your own item, 409 for state. */
export function refusalStatus(code: SaleRefusalCode): number {
  if (code === "not-whole-dollars" || code === "too-low") return 422;
  if (code === "own-item") return 403;
  return 409;
}
