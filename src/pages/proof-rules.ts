// The proof page's decisions (SPEC §7.6; DECISIONS #95, #103). No DOM, so node:test covers
// them. One combined proof per person: the amount they donated and one screenshot.
import { dollarsToCents, formatDollars, parseWholeDollars } from "../components/form-rules.ts";
import { amountWarning, deadlineWords } from "../components/proof-rules.ts";
import type { ProofView } from "../me-api.ts";

export const PROOF_PAGE_LINK = "/your-items/proof";

const dollars = (cents: number) => formatDollars(cents / 100);

export interface Note {
  tone: "info" | "warning" | "danger";
  title: string;
  text: string;
}

/** What the page says above the form about the latest proof, most important first. */
export function proofNotes(proof: ProofView): Note[] {
  const notes: Note[] = [];
  const latest = proof.latest;
  if (latest && proof.totalChanged) {
    notes.push({ tone: "warning", title: "Your donation total changed", text: `It was ${dollars(latest.owedCents)} when you uploaded proof and is now ${dollars(proof.totalCents)}.` });
  }
  if (latest?.status === "rejected") {
    notes.push({ tone: "danger", title: "Your last proof was rejected", text: latest.rejectionReason ? `Reason: ${latest.rejectionReason}` : "Please upload a new one." });
  } else if (latest?.status === "pending") {
    notes.push({ tone: "info", title: "Your proof is waiting for review", text: `You uploaded proof of ${dollars(latest.amountCents)}. A new upload replaces it.` });
  } else if (latest?.status === "approved") {
    notes.push({ tone: "info", title: "Your last proof was approved", text: `It covered ${dollars(latest.amountCents)}. Upload a new one for your new total.` });
  }
  return notes;
}

/** "Your donation total is $125. Due in 6 days." */
export function totalLine(proof: ProofView, now: Date): string {
  const due = deadlineWords(proof.deadline ? new Date(proof.deadline) : null, now);
  const when = due === null ? "" : due === "Due today" ? " It's due today." : due.endsWith("late") ? ` It's ${due}.` : ` ${due} to upload proof.`;
  return `Your donation total is ${dollars(proof.totalCents)}.${when}`;
}

/** The amount field starts at the total, in whole dollars. */
export function startingAmount(proof: ProofView): string {
  return proof.totalCents > 0 ? String(proof.totalCents / 100) : "";
}

/** The warning under the amount while typing: below the total is allowed, but said (SPEC §7.6). */
export function amountNote(raw: string, totalCents: number): string | null {
  const parsed = parseWholeDollars(raw);
  return parsed === null || parsed <= 0 ? null : amountWarning(dollarsToCents(parsed), totalCents);
}

export function amountCents(raw: string): number | null {
  const parsed = parseWholeDollars(raw);
  return parsed === null ? null : dollarsToCents(parsed);
}

/** The blocked state's icon: a check mark only for an approved proof (owner, 5D review). */
export function blockedIcon(code: string): "check" | "info" {
  return code === "approved" ? "check" : "info";
}

export interface GivingView {
  /** "Your total: $35", or null while it's loading or couldn't load. */
  total: string | null;
  /** Nothing owed yet: no Upload proof button, and the line below says why. */
  owesNothing: boolean;
}

export const OWES_NOTHING = "You don't owe anything yet. Bid or buy to have a total.";

/** The giving stub's personal part, from the viewer's proof view (5D review). */
export function givingView(proof: ProofView | null): GivingView {
  if (!proof) return { total: null, owesNothing: false };
  return { total: `Your total: ${dollars(proof.totalCents)}`, owesNothing: proof.blocked?.code === "nothing-owed" || proof.totalCents === 0 };
}
