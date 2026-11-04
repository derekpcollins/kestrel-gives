// The Admin Dashboard page's words and choices (SPEC §8, v1.17; DECISIONS #107, #112). No DOM, so
// node:test covers them. Each section is its own URL (`/admin`, `/admin/people`, …), reached
// through a section nav of plain links (DECISIONS entry 59), not tabs.
import { formatDollars } from "../components/form-rules.ts";
import type { Phase, Tone } from "../components/item-tile-rules.ts";
import { deadlineWords } from "../components/proof-rules.ts";
import type { AdminBid, AdminItem, AdminPerson, AdminPurchase, AdminProof, AdminSummary } from "../admin-api.ts";
import { when } from "../components/phase-banner-rules.ts";
import { bidTime } from "./item-rules.ts";
import { reasonProblem, REASON_MAX } from "../components/admin-rules.ts";

const dollars = (cents: number) => formatDollars(cents / 100);

export type SectionKey = "totals" | "people" | "proofs" | "items";

export interface Section {
  key: SectionKey;
  label: string;
  href: string;
  description: string;
}

/** The sections built so far, in SPEC §8's order; later stages add theirs. */
export const SECTIONS: readonly Section[] = [
  { key: "totals", label: "Totals", href: "/admin", description: "Pledged and confirmed donations, by sale type." },
  { key: "people", label: "People", href: "/admin/people", description: "Everyone's bids, wins, purchases, donation total and proof." },
  { key: "proofs", label: "Proof review", href: "/admin/proofs", description: "Approve or reject each person's donation proof." },
  { key: "items", label: "Items", href: "/admin/items", description: "Every item with its bid history. Remove a bid or cancel an item." },
];

/** Which section a path shows; null for an admin path that isn't a section. */
export function sectionFor(pathname: string): Section | null {
  const path = pathname.replace(/\/+$/, "").replace(/\.html$/, "") || "/";
  if (path === "/admin") return SECTIONS[0]!;
  return SECTIONS.find((s) => s.href === path) ?? null;
}

export function pageTitle(section: Section): string {
  return `${section.label} · Admin Dashboard · Kestrel Gives`;
}

/** The page description when no section is shown (the not-admin state). */
export const GENERAL_DESCRIPTION = "Totals, people, proof review, items and event settings.";

export const NOT_ADMIN = {
  title: "For admins only",
  text: "Employees don't see the Admin Dashboard. To look around, choose Maya Okafor or Theo Lindqvist under Viewing as in the demo bar.",
} as const;

export interface TotalCard {
  key: "auction" | "instant" | "grand";
  title: string;
  pledged: string;
  confirmed: string;
  /** Zero amounts are drawn muted; green is only for confirmed amounts above $0 (owner, 6B review). */
  pledgedZero: boolean;
  confirmedZero: boolean;
}

/** Three cards: silent auction, instant sale, grand total; each pledged and confirmed. */
export function totalCards(summary: Pick<AdminSummary, "totals">): TotalCard[] {
  const { pledged, confirmed } = summary.totals;
  const card = (key: TotalCard["key"], title: string, p: number, c: number): TotalCard =>
    ({ key, title, pledged: dollars(p), confirmed: dollars(c), pledgedZero: p === 0, confirmedZero: c === 0 });
  return [
    card("auction", "Silent auction", pledged.auctionCents, confirmed.auctionCents),
    card("instant", "Instant sale", pledged.instantCents, confirmed.instantCents),
    card("grand", "Grand total", pledged.grandCents, confirmed.grandCents),
  ];
}

/** What pledged and confirmed mean, under the cards. */
export const TOTALS_KEY = {
  pledged: "Winning bids and purchases, on items that aren't cancelled.",
  confirmed: "Covered by approved proof. Sale types count what those people owe; the grand total counts the amounts on their proofs.",
} as const;

/** The gap between approved amounts and what those people owe, or a note that none is approved. */
export function gapText(summary: Pick<AdminSummary, "totals">): string {
  return summary.totals.gapLine ?? "No proofs are approved yet, so nothing is confirmed.";
}

/** Live only: the current high bids, kept apart from pledged and confirmed (owner, 6A review). */
export function leadingBids(summary: Pick<AdminSummary, "totals">): { title: string; amount: string; text: string } | null {
  const cents = summary.totals.leadingBidsCents;
  if (cents === null) return null;
  return {
    title: "Leading bids so far, not final until bidding closes",
    amount: dollars(cents),
    text: "The current high bid on each silent auction item. They aren't pledges yet, so they're not in the totals above. When bidding closes, the winning bids join Pledged.",
  };
}

/** "1 proof waiting for review · 15 active items". */
export function glanceLine(summary: Pick<AdminSummary, "pendingProofs" | "activeItems">): string {
  const proofs = summary.pendingProofs === 0 ? "No proofs waiting for review" : summary.pendingProofs === 1 ? "1 proof waiting for review" : `${summary.pendingProofs} proofs waiting for review`;
  const items = summary.activeItems === 1 ? "1 active item" : `${summary.activeItems} active items`;
  return `${proofs} · ${items}`;
}

export interface ProofCell {
  label: string;
  tone: Tone;
  /** "$60 of $65", or null. */
  detail: string | null;
}

export interface ProofTiming {
  phase: Phase;
  /** The proof deadline (ISO), or null before a close is set. */
  deadline: string | null;
  now: Date;
}

/**
 * The People table's Proof column: the latest proof's status and amount, or why there's none.
 * With no proof, it follows the phase like Your Items (owner, 6B review): neutral before
 * bidding closes, a warning after, and Late (danger) past the proof deadline.
 */
export function proofCell(person: Pick<AdminPerson, "totalCents" | "proof">, timing: ProofTiming): ProofCell {
  const p = person.proof;
  if (!p) {
    if (person.totalCents <= 0) return { label: "Nothing owed", tone: "neutral", detail: null };
    if (timing.phase !== "ended") return { label: "Not uploaded", tone: "neutral", detail: null };
    const due = deadlineWords(timing.deadline ? new Date(timing.deadline) : null, timing.now);
    if (due?.endsWith("late")) return { label: "Late", tone: "danger", detail: due };
    return { label: "Not uploaded", tone: "warning", detail: due };
  }
  const label = p.status === "approved" ? "Approved" : p.status === "pending" ? "Waiting for review" : "Rejected";
  const tone: Tone = p.status === "approved" ? "success" : p.status === "pending" ? "warning" : "danger";
  const detail = p.amountCents === person.totalCents ? dollars(p.amountCents) : `${dollars(p.amountCents)} of ${dollars(person.totalCents)}`;
  return { label, tone, detail };
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export const money = dollars;

// ---------------------------------------------------------------------------------------------
// Proof review (SPEC §7.6; DECISIONS #113)

/** Waiting for review first (oldest first, as the API sends them), then the rest. */
export function groupProofs(proofs: readonly AdminProof[]): { waiting: AdminProof[]; reviewed: AdminProof[] } {
  return { waiting: proofs.filter((p) => p.status === "pending"), reviewed: proofs.filter((p) => p.status !== "pending") };
}

/** "1 waiting for review · 2 reviewed". */
export function queueLine(proofs: readonly AdminProof[]): string {
  const { waiting, reviewed } = groupProofs(proofs);
  return `${waiting.length} waiting for review · ${reviewed.length} reviewed`;
}

/** "Proof deadline: Tuesday, November 10 at 6:00 PM EST", in the viewer's zone. */
export function deadlineLine(deadline: string | null, now: Date, timeZone?: string): string {
  if (!deadline) return "There's no proof deadline yet: it's set when bidding closes.";
  const d = new Date(deadline);
  return `Proof deadline: ${when(d, now, timeZone, false)}${d.getTime() < now.getTime() ? " (passed)" : ""}.`;
}

export interface Note {
  tone: "warning" | "info";
  text: string;
}

export interface ProofReviewText {
  name: string;
  status: { label: string; tone: Tone };
  uploaded: string;
  amount: string;
  total: string;
  /** Short, over, a changed total, a late upload: most important first. */
  notes: Note[];
  /** "Approved by Maya Okafor today at 2:00 PM EST." */
  reviewed: string | null;
  reason: string | null;
  /** Approve and Reject show only while it's waiting. */
  canReview: boolean;
  /**
   * A reviewed proof can be reversed (owner, 6C review): "Reject instead" when approved,
   * "Approve instead" when rejected. The queue lists only each person's latest proof, and the
   * server refuses one that's been superseded.
   */
  instead: "approve" | "reject" | null;
  /** For the screenshot's alt text and the buttons' hidden labels. */
  shotAlt: string;
}

export function proofReview(p: AdminProof, ctx: { now: Date; deadline: string | null; timeZone?: string }): ProofReviewText {
  const name = `${p.person.firstName} ${p.person.lastName}`;
  const notes: Note[] = [];
  if (p.amountCents < p.totalCents) {
    notes.push({ tone: "warning", text: `${dollars(p.totalCents - p.amountCents)} short of their ${dollars(p.totalCents)} donation total.${p.status === "pending" ? " You can still approve it." : ""}` });
  } else if (p.amountCents > p.totalCents) {
    notes.push({ tone: "info", text: `${dollars(p.amountCents - p.totalCents)} more than their ${dollars(p.totalCents)} donation total.` });
  }
  if (p.totalChanged) notes.push({ tone: "info", text: `Their total was ${dollars(p.owedCents)} when they uploaded this proof. It's ${dollars(p.totalCents)} now.` });
  if (ctx.deadline && new Date(p.createdAt).getTime() > new Date(ctx.deadline).getTime()) {
    notes.push({ tone: "info", text: "Uploaded after the proof deadline. Late proofs are allowed; you decide." });
  }
  const uploadedAt = new Date(p.createdAt);
  const status = p.status === "pending" ? { label: "Waiting for review", tone: "warning" as const }
    : p.status === "approved" ? { label: "Approved", tone: "success" as const } : { label: "Rejected", tone: "danger" as const };
  const by = p.reviewer ? ` by ${p.reviewer.firstName} ${p.reviewer.lastName}` : "";
  const reviewed = p.status === "pending" || !p.reviewedAt ? null : `${status.label}${by} ${when(new Date(p.reviewedAt), ctx.now, ctx.timeZone)}.`;
  return {
    name, status,
    uploaded: `Uploaded ${when(uploadedAt, ctx.now, ctx.timeZone)}`,
    amount: dollars(p.amountCents), total: dollars(p.totalCents), notes, reviewed,
    reason: p.status === "rejected" && p.rejectionReason ? `Reason: ${p.rejectionReason}` : null,
    canReview: p.status === "pending",
    instead: p.status === "approved" ? "reject" : p.status === "rejected" ? "approve" : null,
    shotAlt: `Donation screenshot from ${name}`,
  };
}

/**
 * The reject dialog's words; the reason is required and shown to the person (SPEC §7.6).
 * Rejecting an approved proof ("Reject instead") says it leaves the confirmed totals.
 */
export function rejectDialog(p: Pick<AdminProof, "person" | "status" | "amountCents">): { title: string; body: string; confirmLabel: string; label: string; help: string; maxLength: number; check: (v: string) => string | null } {
  const name = `${p.person.firstName} ${p.person.lastName}`;
  const instead = p.status === "approved";
  return {
    title: instead ? `Reject ${name}'s approved proof?` : `Reject ${name}'s proof?`,
    body: instead
      ? `It's approved now. Rejecting it takes its ${dollars(p.amountCents)} out of the confirmed totals. ${p.person.firstName} will see your reason on Your Items and can upload a new proof.`
      : `${p.person.firstName} will see your reason on Your Items and can upload a new proof.`,
    confirmLabel: instead ? "Reject instead" : "Reject proof",
    label: `Reason (shown to ${p.person.firstName})`,
    help: `For example, "The screenshot doesn't show the amount." Up to ${REASON_MAX} characters.`,
    maxLength: REASON_MAX,
    check: reasonProblem,
  };
}

// ---------------------------------------------------------------------------------------------
// Items (SPEC §7.3, §7.4, §8; DECISIONS #110, #114)

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

