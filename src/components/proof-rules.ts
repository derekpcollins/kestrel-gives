// Donation proof (SPEC §7.6; DECISIONS #95). Shared by the API and the pages. No DOM. Money is
// cents, as stored. One combined proof per person per event; the latest one counts.
import { formatDollars } from "./form-rules.ts";

export type ProofStatus = "pending" | "approved" | "rejected";

export interface ProofFacts {
  /** The person's donation total now (winning bids plus non-cancelled purchases). */
  totalCents: number;
  /** Their latest proof, if any. */
  latest: { status: ProofStatus; owedCents: number } | null;
}

export const PROOF_DEMO_NOTE = "This is a demo. Don't upload a real receipt or personal details.";

/**
 * Why the person can't upload proof now, or null. Anyone who owes something may upload, from
 * their first purchase on: buyers needn't wait for the close. Late proofs are allowed; the
 * dashboard shows they're late and an admin decides (#95). An approved proof that still
 * matches the total has nothing left to do.
 */
export function proofBlock(facts: ProofFacts): { code: "nothing-owed" | "approved"; message: string } | null {
  if (facts.totalCents <= 0) return { code: "nothing-owed", message: "You haven't won or bought anything yet, so there's nothing to donate." };
  if (facts.latest?.status === "approved" && facts.latest.owedCents === facts.totalCents) {
    return { code: "approved", message: "Your proof has been approved. There's nothing more to upload." };
  }
  return null;
}

/** The warning under the amount when it's below the total (the person may still submit). */
export function amountWarning(amountCents: number, totalCents: number): string | null {
  if (amountCents >= totalCents) return null;
  return `That's less than your ${formatDollars(totalCents / 100)} donation total. You can still submit; an admin will review it.`;
}

/** True when the total has changed since the latest proof was uploaded (SPEC §7.6 banner). */
export function totalChanged(facts: ProofFacts): boolean {
  return facts.latest !== null && facts.latest.owedCents !== facts.totalCents;
}

const DAY = 86_400_000;

/** "6 days left", "1 day left", "Due today", "2 days late"; null before a deadline is set. */
export function deadlineWords(deadline: Date | null, now: Date): string | null {
  if (!deadline) return null;
  const ms = deadline.getTime() - now.getTime();
  if (ms >= 0) {
    const days = Math.floor(ms / DAY);
    if (days === 0) return "Due today";
    return days === 1 ? "1 day left" : `${days} days left`;
  }
  const late = Math.ceil(-ms / DAY);
  return late === 1 ? "1 day late" : `${late} days late`;
}
