// Your Items' words (SPEC §8, §7.6; DECISIONS #101). Each row is an item tile; these say what
// it shows, in the tile's shape (amount, detail, one status). No DOM, so node:test covers them.
// Money arrives in cents and is shown in whole dollars.
import { formatDollars } from "../components/form-rules.ts";
import { tileText, type TileContext, type TileItem, type TileText } from "../components/item-tile-rules.ts";
import { deadlineWords } from "../components/proof-rules.ts";
import type { Phase } from "../components/item-tile-rules.ts";
import type { BidStanding, MyBid, MyCancelled, MyDonated, MyWin, ProofView } from "../me-api.ts";

export type Tone = "success" | "warning" | "danger" | "neutral";
export interface PillWords {
  label: string;
  tone: Tone;
}
/** A tile's words, and whether it's faded (cancelled, lost). */
export type MineText = TileText & { muted: boolean };

const dollars = (cents: number) => formatDollars(cents / 100);

export const PROOF_LINK = "/your-items/proof";

// The browse tiles' labels and tones, so a status reads the same everywhere, except a lost
// auction: "Ended" is for items the viewer had no stake in, so theirs says "Didn't win".
const STANDING: Record<BidStanding, PillWords> = {
  winning: { label: "You're winning", tone: "success" },
  outbid: { label: "Outbid", tone: "danger" },
  won: { label: "You won", tone: "success" },
  lost: { label: "Didn't win", tone: "neutral" },
};

/** My bids: my best bid is the number; the detail says where it stands. */
export function bidText(bid: Pick<MyBid, "myTopCents" | "highBidCents" | "standing">): MineText {
  const detail =
    bid.standing === "winning" ? "Your bid · the high bid"
    : bid.standing === "won" ? "Your winning bid"
    : bid.standing === "outbid" ? `Your bid · High bid ${dollars(bid.highBidCents)}`
    : `Your bid · Winning bid ${dollars(bid.highBidCents)}`;
  return { amount: dollars(bid.myTopCents), detail, status: STANDING[bid.standing], muted: bid.standing === "lost" };
}

/** One tile per item: repeat purchases of the same item fold together. */
export interface WinGroup extends MyWin {
  /** Units bought (1 for a won auction). */
  count: number;
  /** The latest unit's price; amountCents is the combined amount. */
  unitCents: number;
}

/**
 * The API lists each unit bought; Your Items shows one tile per item, with the count, the
 * combined amount and the latest purchase's date (newest first). Totals are unchanged: they
 * come from the server, not from these tiles.
 */
export function groupWins(wins: readonly MyWin[]): WinGroup[] {
  const groups = new Map<string, WinGroup>();
  for (const w of wins) {
    const key = `${w.kind}:${w.itemId}`;
    const seen = groups.get(key);
    if (!seen) {
      groups.set(key, { ...w, count: 1, unitCents: w.amountCents });
      continue;
    }
    seen.count += 1;
    seen.amountCents += w.amountCents;
    if (w.at > seen.at) Object.assign(seen, { at: w.at, unitCents: w.amountCents });
  }
  return [...groups.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Won & purchased: what it cost. The proof status is one for everything, in the summary. */
export function winText(win: Pick<WinGroup, "kind" | "amountCents" | "unitCents" | "count" | "at">, timeZone: string): MineText {
  if (win.kind === "won") return { amount: dollars(win.amountCents), detail: "Won", status: undefined, muted: false };
  const day = new Date(win.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
  if (win.count === 1) return { amount: dollars(win.amountCents), detail: `Bought ${day}`, status: undefined, muted: false };
  // The big number is the price, as on the item's tile; the detail has the count and the sum.
  return { amount: dollars(win.unitCents), detail: `Bought ${win.count} · ${dollars(win.amountCents)} · Last on ${day}`, status: undefined, muted: false };
}

/** Edit shows on donated items until bidding ends (SPEC §7.3, v1.16; DECISIONS #102). */
export function showsEdit(phase: Phase): boolean {
  return phase !== "ended";
}

/** My donated items: exactly what the item's own tile says in the browse grid. */
export function donatedText(item: Pick<MyDonated, "type" | "bidCount" | "highBidCents" | "startingBidCents" | "priceCents" | "remaining">, ctx: TileContext): MineText {
  const tile: TileItem = item.type === "auction"
    ? { type: "auction", startingBid: (item.startingBidCents ?? 0) / 100, bidCount: item.bidCount, ...(item.highBidCents === null ? {} : { topBid: item.highBidCents / 100 }) }
    : { type: "instant", price: (item.priceCents ?? 0) / 100, remaining: item.remaining ?? 0 };
  return { ...tileText(tile, ctx), muted: ctx.phase === "ended" };
}

/** Cancelled rows fold the same way: one tile per item and reason, purchases counted and summed. */
export function groupCancelled(items: readonly MyCancelled[]): (MyCancelled & { count: number })[] {
  const groups = new Map<string, MyCancelled & { count: number }>();
  for (const c of items) {
    const seen = groups.get(`${c.why}:${c.itemId}`);
    if (!seen) groups.set(`${c.why}:${c.itemId}`, { ...c, count: 1 });
    else {
      seen.count += 1;
      seen.amountCents = (seen.amountCents ?? 0) + (c.amountCents ?? 0);
    }
  }
  return [...groups.values()];
}

export function cancelledText(item: Pick<MyCancelled, "why" | "amountCents"> & { count?: number }): MineText {
  const status = { label: "Cancelled", tone: "danger" } as const;
  if (item.why === "bought") {
    const what = (item.count ?? 1) > 1 ? `${item.count} purchases cancelled` : "Purchase cancelled";
    return { amount: dollars(item.amountCents ?? 0), detail: `${what} · Not in your total`, status, muted: true };
  }
  if (item.why === "bid") return { amount: "", detail: "Your bid no longer counts", status, muted: true };
  return { amount: "", detail: "You donated this item", status, muted: true };
}

/** The proof summary at the top of Won & purchased: one combined proof per person (SPEC §7.6). */
export interface ProofSummary {
  total: string;
  status: PillWords | null;
  /** "6 days left", "2 days late"; null when nothing's due or before a close is set. */
  due: string | null;
  /** The line under the status: the rejection reason, or what happens next. */
  note: string;
  /** The upload link, when an upload is possible now. */
  action: { href: string; label: string } | null;
}

export function proofSummary(proof: ProofView, now: Date): ProofSummary {
  const total = dollars(proof.totalCents);
  const latest = proof.latest;
  const settled = latest?.status === "approved" && !proof.totalChanged;
  const due = proof.totalCents > 0 && !settled && latest?.status !== "pending"
    ? deadlineWords(proof.deadline ? new Date(proof.deadline) : null, now)
    : null;
  const action = proof.blocked ? null : { href: PROOF_LINK, label: latest ? "Upload a new proof" : "Donate and upload proof" };

  if (!latest) {
    if (proof.totalCents <= 0) return { total, status: null, due: null, note: "When you win or buy something, donate your total once and upload proof here.", action: null };
    return { total, status: { label: "Proof due", tone: "warning" }, due, note: "Donate your total once on the giving page, then upload a screenshot.", action };
  }
  if (latest.status === "pending") {
    return { total, status: { label: "Pending review", tone: "neutral" }, due, note: `You uploaded proof of ${dollars(latest.amountCents)}. An admin will review it.`, action };
  }
  if (latest.status === "rejected") {
    return { total, status: { label: "Rejected", tone: "danger" }, due, note: latest.rejectionReason ? `Reason: ${latest.rejectionReason}` : "Please upload a new proof.", action };
  }
  return { total, status: { label: "Approved", tone: "success" }, due, note: `Your proof of ${dollars(latest.amountCents)} was approved. Thank you!`, action };
}

/** SPEC §7.6 (v1.9): shown when the total moved after the latest proof was uploaded. */
export function totalChangedBanner(proof: ProofView): { title: string; text: string } | null {
  if (!proof.totalChanged || !proof.latest) return null;
  const was = dollars(proof.latest.owedCents);
  const now = dollars(proof.totalCents);
  const ask = proof.latest.status === "rejected" ? "Please upload a new proof for the new total." : "Please check that your proof still covers it.";
  return { title: "Your donation total changed", text: `It was ${was} when you uploaded proof and is now ${now}. ${ask}` };
}

/** Section headings and the empty message each list shows. Cancelled shows only when it has something. */
export const SECTIONS = {
  bids: { title: "My bids", empty: "You haven't bid on anything yet." },
  wins: { title: "Won & purchased", empty: "Nothing won or bought yet." },
  donated: { title: "My donated items", empty: "You haven't donated an item yet." },
  cancelled: { title: "Cancelled" },
} as const;
