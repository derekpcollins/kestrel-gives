// Changing the current event's dates (SPEC §7.1, §3.1). Shared by Jump to (the demo bar) and
// the admin's event settings, so both treat winners the same way (DECISIONS #81, #111):
// - Bidding open again, or the dates cleared, after winners were set: the winners are cleared
//   and the proofs of everyone who had won are re-checked, since their totals drop.
// - Bidding closed by the new dates: winners are finalized at once (they'd be on the next read).
import type { Id, Tx } from "./db.ts";
import { recheckProofsIn } from "./totals.ts";
import { finalizeWinnersIn } from "./winners.ts";

export interface EventDateValues {
  submissionsOpenAt: Date;
  biddingOpensAt: Date;
  biddingClosesAt: Date;
}

export interface DatesResult {
  /** Winners were cleared because bidding is open again (or no longer scheduled). */
  winnersCleared: boolean;
  /** Winners were set now because bidding is closed. */
  winnersFinalized: boolean;
}

/** Sets (or, with null, clears) the event's three dates. The caller holds the event row lock. */
export async function setEventDatesIn(tx: Tx, eventId: Id, dates: EventDateValues | null, now: Date): Promise<DatesResult> {
  const { rows } = await tx.query<{ finalized: boolean }>(
    `SELECT winners_finalized_at IS NOT NULL AS finalized FROM events WHERE id = $1 FOR UPDATE`,
    [eventId],
  );
  if (!rows[0]) throw new Error("That event doesn't exist.");
  const open = !dates || dates.biddingClosesAt.getTime() > now.getTime();

  let winnersCleared = false;
  if (open && rows[0].finalized) {
    const cleared = await tx.query<{ bidder_id: Id }>(
      `WITH old AS (
         SELECT i.id, i.winning_bid_id FROM items i WHERE i.event_id = $1 AND i.winning_bid_id IS NOT NULL FOR UPDATE),
       cleared AS (
         UPDATE items i SET winning_bid_id = NULL, updated_at = now() FROM old WHERE i.id = old.id RETURNING old.winning_bid_id)
       SELECT DISTINCT b.bidder_id FROM cleared JOIN bids b ON b.id = cleared.winning_bid_id`,
      [eventId],
    );
    await tx.query(`UPDATE events SET winners_finalized_at = NULL WHERE id = $1`, [eventId]);
    await recheckProofsIn(tx, eventId, cleared.rows.map((r) => r.bidder_id));
    winnersCleared = true;
  }

  // Each CHECK compares two dates, so set all three in one statement.
  await tx.query(
    `UPDATE events SET submissions_open_at = $2, bidding_opens_at = $3, bidding_closes_at = $4 WHERE id = $1`,
    [eventId, dates?.submissionsOpenAt ?? null, dates?.biddingOpensAt ?? null, dates?.biddingClosesAt ?? null],
  );
  const winnersFinalized = open ? false : await finalizeWinnersIn(tx, eventId);
  return { winnersCleared, winnersFinalized };
}
