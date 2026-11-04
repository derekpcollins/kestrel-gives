// The Admin Dashboard page's words and choices (SPEC §8, v1.17; DECISIONS #107, #112). No DOM, so
// node:test covers them. Each section is its own URL (`/admin`, `/admin/people`, …), reached
// through a section nav of plain links (DECISIONS entry 59), not tabs.
import { formatDollars } from "../components/form-rules.ts";
import type { Tone } from "../components/item-tile-rules.ts";
import type { AdminPerson, AdminSummary } from "../admin-api.ts";

const dollars = (cents: number) => formatDollars(cents / 100);

export type SectionKey = "totals" | "people";

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
}

/** Three cards: silent auction, instant sale, grand total; each pledged and confirmed. */
export function totalCards(summary: Pick<AdminSummary, "totals">): TotalCard[] {
  const { pledged, confirmed } = summary.totals;
  return [
    { key: "auction", title: "Silent auction", pledged: dollars(pledged.auctionCents), confirmed: dollars(confirmed.auctionCents) },
    { key: "instant", title: "Instant sale", pledged: dollars(pledged.instantCents), confirmed: dollars(confirmed.instantCents) },
    { key: "grand", title: "Grand total", pledged: dollars(pledged.grandCents), confirmed: dollars(confirmed.grandCents) },
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

/** The People table's Proof column: the latest proof's status and amount, or why there's none. */
export function proofCell(person: Pick<AdminPerson, "totalCents" | "proof">): ProofCell {
  const p = person.proof;
  if (!p) return person.totalCents > 0 ? { label: "Not uploaded", tone: "warning", detail: null } : { label: "Nothing owed", tone: "neutral", detail: null };
  const label = p.status === "approved" ? "Approved" : p.status === "pending" ? "Waiting for review" : "Rejected";
  const tone: Tone = p.status === "approved" ? "success" : p.status === "pending" ? "warning" : "danger";
  const detail = p.amountCents === person.totalCents ? dollars(p.amountCents) : `${dollars(p.amountCents)} of ${dollars(person.totalCents)}`;
  return { label, tone, detail };
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export const money = dollars;
