// The current event and its phase (SPEC §7.1, DECISIONS #81). Phases come from the stored
// dates only, compared with the real time; there is no close button and no scheduled job.
import type { Id, Tx } from "./db.ts";
import { finalizeWinnersIn } from "./winners.ts";
import type { Phase } from "../../src/components/item-tile-rules.ts";

export type { Phase };

export interface EventDates {
  submissionsOpenAt: Date | null;
  biddingOpensAt: Date | null;
  biddingClosesAt: Date | null;
}

export interface CurrentEvent extends EventDates {
  id: Id;
  name: string;
  timeZone: string;
  minStartingBidCents: number;
  bidIncrementCents: number;
  proofDeadlineDays: number;
  givingPlatformUrl: string | null;
  winnersFinalizedAt: Date | null;
}

/**
 * Not scheduled while any date is missing (as after Reset for next year), upcoming until
 * submissions open, submission until bidding opens, live until it closes, ended after
 * (SPEC v1.17 §7.1, DECISIONS #108).
 */
export function phaseOf(event: EventDates, now: Date): Phase {
  if (!event.submissionsOpenAt || !event.biddingOpensAt || !event.biddingClosesAt) return "unscheduled";
  const t = now.getTime();
  if (t < event.submissionsOpenAt.getTime()) return "upcoming";
  if (t < event.biddingOpensAt.getTime()) return "submission";
  if (t < event.biddingClosesAt.getTime()) return "live";
  return "ended";
}

/** The proof deadline: the close time plus the event's number of days, or null before a close is set. */
export function proofDeadlineOf(event: Pick<CurrentEvent, "biddingClosesAt" | "proofDeadlineDays">): Date | null {
  if (!event.biddingClosesAt) return null;
  return new Date(event.biddingClosesAt.getTime() + event.proofDeadlineDays * 86_400_000);
}

const SELECT_CURRENT = `
  SELECT id, name, time_zone, submissions_open_at, bidding_opens_at, bidding_closes_at,
         min_starting_bid_cents, bid_increment_cents, proof_deadline_days, giving_platform_url, winners_finalized_at
    FROM events WHERE is_current`;

async function readCurrentIn(tx: Tx): Promise<CurrentEvent | null> {
  const { rows } = await tx.query<{
    id: Id; name: string; time_zone: string; submissions_open_at: Date | null; bidding_opens_at: Date | null; bidding_closes_at: Date | null;
    min_starting_bid_cents: number; bid_increment_cents: number; proof_deadline_days: number; giving_platform_url: string | null; winners_finalized_at: Date | null;
  }>(SELECT_CURRENT);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, name: r.name, timeZone: r.time_zone,
    submissionsOpenAt: r.submissions_open_at, biddingOpensAt: r.bidding_opens_at, biddingClosesAt: r.bidding_closes_at,
    minStartingBidCents: Number(r.min_starting_bid_cents), bidIncrementCents: Number(r.bid_increment_cents),
    proofDeadlineDays: Number(r.proof_deadline_days), givingPlatformUrl: r.giving_platform_url, winnersFinalizedAt: r.winners_finalized_at,
  };
}

/**
 * The current event, with winners finalized first if bidding has closed. Safe on a GET:
 * finalizing happens once, by whichever request claims the event first (finalizeWinnersIn),
 * and every later read finds it done. Returns null if there is no current event.
 */
export async function currentEventIn(tx: Tx): Promise<CurrentEvent | null> {
  const event = await readCurrentIn(tx);
  if (!event || event.winnersFinalizedAt || !event.biddingClosesAt) return event;
  // The database clock decides, so the app server's clock can't finalize early. Re-read
  // either way: if another request finalized first, its commit is visible now.
  await finalizeWinnersIn(tx, event.id);
  return readCurrentIn(tx);
}

/**
 * The shared demo was just reset for next year (SPEC v1.17 §7.8, DECISIONS #109): an earlier
 * event exists and this one has no items yet. Home and the Admin Dashboard then offer Restore.
 */
export async function justResetIn(tx: Tx, eventId: string): Promise<boolean> {
  const { rows } = await tx.query<{ reset: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM events WHERE id <> $1 AND created_at <= (SELECT created_at FROM events WHERE id = $1))
        AND NOT EXISTS (SELECT 1 FROM items WHERE event_id = $1) AS reset`,
    [eventId],
  );
  return rows[0]?.reset ?? false;
}
