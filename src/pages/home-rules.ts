// Home's computed words (SPEC §7.6, §8): how many days after the close proof is due, and the
// line under each How to participate card (B3). From the event's dates and the viewer, never
// hard-coded. Pure, so node:test covers it.
import type { EventView } from "../app-state.ts";
import { dateWords } from "../components/phase-banner-rules.ts";

const DAY = 86_400_000;

/** "7 days" (or "1 day") between the close and the proof deadline; null if either is unknown. */
export function proofDaysWords(event: Pick<EventView, "biddingClosesAt" | "proofDeadline"> | null): string | null {
  if (!event?.biddingClosesAt || !event.proofDeadline) return null;
  const days = Math.round((Date.parse(event.proofDeadline) - Date.parse(event.biddingClosesAt)) / DAY);
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * One part of a How to participate card's last line (owner, visible changes B3): a link when
 * the step is open to this person now, muted text when it isn't.
 */
export type StepPart = { link: string; href: string } | { text: string };

/** The four cards' lines, in order: submit, bid or buy, donate, proof. Empty while waiting for /api/me. */
export type StepLines = [StepPart[], StepPart[], StepPart[], StepPart[]];

/** What Home knows about the viewer's donation once bidding has ended (from GET /api/me). */
export interface StepProof {
  totalCents: number;
  /** Approved and still matching the total (proofBlock's "approved"). */
  approved: boolean;
  deadline: string | null;
}

/** null while loading; "failed" if /api/me couldn't be read. */
export type StepProofState = StepProof | null | "failed";

export const STEP_LINKS = {
  submit: "/submit",
  auction: "/silent-auction",
  instant: "/instant-sale",
  yourItems: "/your-items",
  proof: "/your-items/proof",
} as const;

/** Home fetches the viewer's totals only once bidding has ended, never before (B3). */
export function needsProof(event: Pick<EventView, "phase"> | null): boolean {
  return event?.phase === "ended";
}

/**
 * The line under each How to participate card, for this viewer and phase (SPEC v1.27 §8).
 * Admins submit at any time (SPEC §7.3) and otherwise follow the employee rules. Dates use the
 * phase banner's words ("Wednesday, November 4"), in the viewer's zone unless one is given.
 */
export function stepLines(
  event: Pick<EventView, "phase" | "submissionsOpenAt" | "biddingOpensAt" | "biddingClosesAt"> | null,
  role: "admin" | "employee" | null,
  proof: StepProofState,
  now: Date,
  timeZone?: string,
): StepLines {
  const on = (iso: string | null | undefined) => (iso ? dateWords(new Date(iso), now, timeZone) : null);
  const muted = (text: string): StepPart[] => [{ text }];
  const noDates = muted("Dates aren't set yet");
  const phase = event?.phase ?? "unscheduled";
  const opens = on(event?.biddingOpensAt);
  const closes = on(event?.biddingClosesAt);

  // 1. Submit an item: open in the submission window, and always for admins.
  let submit: StepPart[];
  if (role === "admin" || phase === "submission") submit = [{ link: "Submit an item", href: STEP_LINKS.submit }];
  else if (phase === "unscheduled") submit = noDates;
  else if (phase === "upcoming") submit = on(event?.submissionsOpenAt) ? muted(`Submissions open on ${on(event?.submissionsOpenAt)}`) : noDates;
  else submit = opens ? muted(`Submissions closed on ${opens}`) : muted("Submissions are closed");

  // 2. Bid or buy: both sales while bidding is live.
  let bid: StepPart[];
  if (phase === "live") bid = [{ link: "Silent auction", href: STEP_LINKS.auction }, { link: "Instant sale", href: STEP_LINKS.instant }];
  else if (phase === "ended") bid = muted(closes ? `Bidding ended on ${closes}` : "Bidding has ended");
  else bid = opens ? muted(`Opens when bidding starts on ${opens}`) : noDates;

  // 3 and 4 wait for bidding to end, then follow what the viewer owes.
  if (phase !== "ended") {
    const later = closes ? muted(`Opens when bidding ends on ${closes}`) : noDates;
    return [submit, bid, later, later];
  }
  if (proof === null) return [submit, bid, [], []];
  if (proof === "failed") {
    const fallback: StepPart[] = [{ link: "See Your Items", href: STEP_LINKS.yourItems }];
    return [submit, bid, fallback, fallback];
  }
  if (proof.totalCents <= 0) return [submit, bid, muted("Nothing to donate"), muted("Nothing to donate")];
  const owe: StepPart[] = [{ link: "See what you owe", href: STEP_LINKS.yourItems }];
  if (proof.approved) return [submit, bid, owe, muted("Proof approved")];
  // Late uploads are still accepted (SPEC §7.6; owner, B3), so the link stays after the deadline.
  const deadline = proof.deadline ? new Date(proof.deadline) : null;
  const upload: StepPart = { link: "Upload proof", href: STEP_LINKS.proof };
  const late = deadline && deadline.getTime() <= now.getTime();
  return [submit, bid, owe, late ? [upload, { text: `Was due ${dateWords(deadline, now, timeZone)}` }] : [upload]];
}
