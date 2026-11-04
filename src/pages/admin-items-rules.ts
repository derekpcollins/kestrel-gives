// The Admin Dashboard Items section's words (SPEC §7.3, §7.4, §7.5, §8; DECISIONS #110, #114, #115):
// rows for items, bids and purchases, and the confirmation dialogs. No DOM, so node:test covers
// them. Split from admin-rules.ts.
import { formatDollars } from "../components/form-rules.ts";
import type { Phase, Tone } from "../components/item-tile-rules.ts";
import type { AdminBid, AdminItem, AdminPurchase } from "../admin-api.ts";
import { when } from "../components/phase-banner-rules.ts";
import { bidTime } from "./item-rules.ts";

const dollars = (cents: number) => formatDollars(cents / 100);


const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Silent auction, then instant sale; within each, as the API sends them (active first, newest). */
export function groupItems(items: readonly AdminItem[]): { auction: AdminItem[]; instant: AdminItem[] } {
  return { auction: items.filter((i) => i.type === "auction"), instant: items.filter((i) => i.type === "instant") };
}

/** "8 items · 1 cancelled". */
export function itemsLine(items: readonly AdminItem[]): string {
  const cancelled = items.filter((i) => i.cancelled).length;
  return `${plural(items.length, "item")}${cancelled ? ` · ${cancelled} cancelled` : ""}`;
}

/** Standing (not removed) bids, top first: largest, then earliest, as winners are chosen. */
export function standingBids(item: Pick<AdminItem, "bids">): AdminBid[] {
  return item.bids.filter((b) => !b.removedAt)
    .sort((a, b) => b.amountCents - a.amountCents || Date.parse(a.createdAt) - Date.parse(b.createdAt) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

export interface ItemRowText {
  /** "Donated by Theo Lindqvist". */
  donor: string;
  /** "Top bid $240 · 6 bids", "Winning bid $310 · 9 bids", "Starting bid $40 · No bids", "$45 each · 3 sold · 7 left". */
  figures: string;
  status: { label: string; tone: Tone } | null;
  /** "Cancelled today at 3:00 PM EST." */
  cancelled: string | null;
  /** "bid history (6 bids)"; null for instant sale. */
  history: string | null;
  /** "purchases (3)"; null for silent auction. */
  purchasesLabel: string | null;
  canCancel: boolean;
}

export function itemRow(item: AdminItem, ctx: { phase: Phase; now: Date; timeZone?: string }): ItemRowText {
  const standing = standingBids(item);
  let figures: string;
  if (item.type === "auction") {
    const count = standing.length === 0 ? (ctx.phase === "ended" ? "No bids" : "No bids yet") : plural(standing.length, "bid");
    const top = standing[0];
    figures = top ? `${ctx.phase === "ended" && !item.cancelled ? "Winning bid" : "Top bid"} ${dollars(top.amountCents)} · ${count}` : `Starting bid ${dollars(item.startingBidCents ?? 0)} · ${count}`;
  } else {
    // Sold counts purchases that stand: one cancelled after the close isn't restocked, so
    // quantity minus remaining would overcount (DECISIONS #115).
    figures = `${dollars(item.priceCents ?? 0)} each · ${item.purchases} sold · ${item.remaining ?? 0} left`;
  }
  const soldOut = item.type === "instant" && (item.remaining ?? 0) === 0;
  return {
    donor: `Donated by ${fullName(item.submitter)}`,
    figures,
    status: item.cancelled ? { label: "Cancelled", tone: "danger" } : soldOut ? { label: "Sold out", tone: "neutral" } : null,
    cancelled: item.cancelled && item.cancelledAt ? `Cancelled ${when(new Date(item.cancelledAt), ctx.now, ctx.timeZone)}.` : null,
    history: item.type === "auction" ? `bid history (${item.bids.length === 0 ? "no bids" : plural(item.bids.length, "bid")})` : null,
    purchasesLabel: item.type === "instant" ? `purchases (${item.purchaseList.length})` : null,
    canCancel: !item.cancelled,
  };
}

export interface BidRowText {
  name: string;
  amount: string;
  when: string;
  /** "Top bid" or, after the close, "Winning bid"; null otherwise. */
  top: string | null;
  /** "Removed by Maya Okafor today at 6:20 PM." */
  removed: string | null;
  canRemove: boolean;
  /** The Remove button's hidden words: " Priya Natarajan's $310 bid". */
  removeLabel: string;
}

export function bidRow(bid: AdminBid, item: Pick<AdminItem, "cancelled">, ctx: { phase: Phase; now: Date; timeZone?: string }): BidRowText {
  const name = fullName(bid.bidder);
  const by = bid.removedBy ? ` by ${fullName(bid.removedBy)}` : "";
  return {
    name, amount: dollars(bid.amountCents), when: bidTime(bid.createdAt, ctx.now, ctx.timeZone),
    top: bid.isTop && !bid.removedAt ? (ctx.phase === "ended" ? "Winning bid" : "Top bid") : null,
    removed: bid.removedAt ? `Removed${by} ${when(new Date(bid.removedAt), ctx.now, ctx.timeZone)}.` : null,
    canRemove: !bid.removedAt && !item.cancelled,
    removeLabel: ` ${name}'s ${dollars(bid.amountCents)} bid`,
  };
}

export interface ConfirmWords { title: string; body: string; confirmLabel: string; cancelLabel: string }

/** The Remove bid dialog: what happens to the top bid (or the winner) is computed from the bids. */
export function removeBidDialog(item: Pick<AdminItem, "title" | "bids" | "startingBidCents">, bid: AdminBid, phase: Phase): ConfirmWords {
  const standing = standingBids(item);
  const name = fullName(bid.bidder);
  const ended = phase === "ended";
  const isTop = standing[0]?.id === bid.id;
  const next = standing.filter((b) => b.id !== bid.id)[0];
  let effect: string;
  if (!isTop) {
    const top = standing[0]!;
    effect = `The ${ended ? "winning" : "top"} bid stays ${dollars(top.amountCents)} from ${fullName(top.bidder)}.`;
  } else if (next && ended) {
    effect = `${fullName(next.bidder)} becomes the winner at ${dollars(next.amountCents)}. Both donation totals change, and an approved proof for either goes back to review.`;
  } else if (next) {
    effect = `The top bid goes back to ${dollars(next.amountCents)} from ${fullName(next.bidder)}.`;
  } else if (ended) {
    effect = `No one wins this item. ${bid.bidder.firstName}'s donation total drops by ${dollars(bid.amountCents)}, and an approved proof goes back to review.`;
  } else {
    effect = `No bids will be left, so the next bid starts at ${dollars(item.startingBidCents ?? 0)}.`;
  }
  return {
    title: `Remove ${name}'s ${dollars(bid.amountCents)} bid?`,
    body: `On ${item.title}. ${effect} The bid stays in the history, marked removed. This can't be undone.`,
    confirmLabel: "Remove bid", cancelLabel: "Keep bid",
  };
}

/** The Cancel item dialog (SPEC §7.3), saying whose totals change. */
export function cancelItemDialog(item: AdminItem, phase: Phase): ConfirmWords {
  const parts = [`It comes off the listings. Its page stays up, marked as cancelled, and everyone who bid or bought sees it on Your Items.`];
  const standing = standingBids(item);
  let totalsChange = false;
  if (item.type === "auction" && standing.length) {
    if (phase === "ended") {
      const winner = standing[0]!;
      parts.push(`${fullName(winner.bidder)} no longer wins it, so their donation total drops by ${dollars(winner.amountCents)}.`);
      totalsChange = true;
    } else parts.push(`Its ${plural(standing.length, "bid")} stop counting.`);
  }
  if (item.type === "instant" && item.purchases > 0) {
    parts.push(`${item.purchases === 1 ? "Its 1 purchase is" : `Its ${item.purchases} purchases are`} cancelled and come off those donation totals.`);
    totalsChange = true;
  }
  if (totalsChange) parts.push("An approved proof for a changed total goes back to review.");
  parts.push("This can't be undone.");
  return { title: `Cancel ${item.title}?`, body: parts.join(" "), confirmLabel: "Cancel item", cancelLabel: "Keep item" };
}

export interface PurchaseRowText {
  name: string;
  amount: string;
  when: string;
  /** "Cancelled today at 6:20 PM EST." */
  cancelled: string | null;
  canCancel: boolean;
  /** The button's hidden words: " (Jules Ferreira's purchase, today at 2:10 PM)". */
  cancelLabel: string;
}

export function purchaseRow(p: AdminPurchase, item: Pick<AdminItem, "cancelled">, ctx: { now: Date; timeZone?: string }): PurchaseRowText {
  const name = fullName(p.buyer);
  const at = bidTime(p.createdAt, ctx.now, ctx.timeZone);
  return {
    name, amount: dollars(p.priceCents), when: at,
    cancelled: p.cancelledAt ? `Cancelled ${when(new Date(p.cancelledAt), ctx.now, ctx.timeZone)}.` : null,
    canCancel: !p.cancelledAt && !item.cancelled,
    cancelLabel: ` (${name}'s purchase, ${at})`,
  };
}

/**
 * The Cancel purchase dialog (owner, 6D review; DECISIONS entry 115) says whose total changes, whether an
 * approved proof goes back to review, and whether the unit returns to stock (only while live).
 */
export function cancelPurchaseDialog(item: Pick<AdminItem, "title" | "remaining">, p: AdminPurchase, phase: Phase): ConfirmWords {
  const name = fullName(p.buyer);
  const parts = [`${name}'s donation total drops by ${dollars(p.priceCents)}, and they'll see the cancellation on Your Items.`];
  if (p.buyerProof === "approved") parts.push("Their approved proof goes back to review, since it no longer matches their total.");
  else if (p.buyerProof === "pending") parts.push("Their proof waiting for review will be checked against the new total.");
  if (phase === "live") parts.push(`The unit goes back into stock (${(item.remaining ?? 0) + 1} left).`);
  else if (phase === "ended") parts.push("Bidding has closed, so the unit doesn't go back into stock.");
  else parts.push("The sale isn't open, so the unit doesn't go back into stock.");
  parts.push("This can't be undone.");
  return {
    title: `Cancel ${name}'s purchase of ${item.title}?`,
    body: parts.join(" "),
    confirmLabel: "Cancel purchase", cancelLabel: "Keep purchase",
  };
}
