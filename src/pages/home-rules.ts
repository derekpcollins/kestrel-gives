// Home's one computed value (SPEC §7.6): how many days after the close proof is due, from
// the event's dates, never hard-coded. Pure, so node:test covers it.
import type { EventView } from "../app-state.ts";

const DAY = 86_400_000;

/** "7 days" (or "1 day") between the close and the proof deadline; null if either is unknown. */
export function proofDaysWords(event: Pick<EventView, "biddingClosesAt" | "proofDeadline"> | null): string | null {
  if (!event?.biddingClosesAt || !event.proofDeadline) return null;
  const days = Math.round((Date.parse(event.proofDeadline) - Date.parse(event.biddingClosesAt)) / DAY);
  return days === 1 ? "1 day" : `${days} days`;
}
