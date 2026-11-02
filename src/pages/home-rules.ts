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

/** The seed's shared placeholder logo (lib/seed/data.ts PLACEHOLDER_LOGO; a unit test keeps them equal). */
export const PLACEHOLDER_LOGO = "/seed/charities/placeholder-logo.png";

/**
 * A charity logo's alt text. The name is beside it, so a real logo is decorative (""); the
 * placeholder says what it is, so nobody mistakes it for the charity's mark (SPEC §7.2).
 */
export function logoAlt(logoUrl: string): string {
  return new URL(logoUrl, "https://kestrel.invalid").pathname === PLACEHOLDER_LOGO ? "Placeholder logo" : "";
}
