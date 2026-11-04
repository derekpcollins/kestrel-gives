// Admin Dashboard words (SPEC §8, v1.17; DECISIONS #107). No DOM, so node:test covers them.
import { formatDollars } from "./form-rules.ts";

const dollars = (cents: number) => formatDollars(cents / 100);

/**
 * The line under the totals comparing approved proof amounts with what those people owe:
 * "Approved proofs: $1,240 against $1,300 owed by those people, $60 short." Null when no
 * proof is approved.
 */
export function gapLine(approvedCents: number, owedCents: number, people: number): string | null {
  if (people === 0) return null;
  const who = people === 1 ? "that person" : "those people";
  const base = `Approved proofs: ${dollars(approvedCents)} against ${dollars(owedCents)} owed by ${who}`;
  if (approvedCents === owedCents) return `${base}, an exact match.`;
  const diff = Math.abs(approvedCents - owedCents);
  return `${base}, ${dollars(diff)} ${approvedCents < owedCents ? "short" : "over"}.`;
}

/** Refusal codes the admin API answers with, and their HTTP status. */
export const ADMIN_REFUSALS = {
  "not-found": 404,
  "already-reviewed": 409,
  superseded: 409,
  "total-changed": 409,
  "already-removed": 409,
  "already-cancelled": 409,
  cancelled: 409,
  locked: 409,
  "wrong-name": 422,
  busy: 409,
  invalid: 422,
} as const;
export type AdminRefusalCode = keyof typeof ADMIN_REFUSALS;

export interface AdminRefusal {
  ok: false;
  code: AdminRefusalCode;
  message: string;
}

export const REASON_MAX = 300;

/** A rejection needs a reason (SPEC §7.6), shown to the person. */
export function reasonProblem(reason: string): string | null {
  const r = reason.trim();
  if (!r) return "Enter a reason. The person will see it.";
  if (r.length > REASON_MAX) return `Keep the reason to ${REASON_MAX} characters.`;
  return null;
}
