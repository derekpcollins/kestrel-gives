// Jump to (SPEC §3.1, DECISIONS #81): moves the current event's dates relative to now so a
// visitor can see each phase. The clock is never faked; the real time-window rules run.
import type { Id, Tx } from "../data/db.ts";
import { recheckProofsIn } from "../data/totals.ts";
import { finalizeWinnersIn } from "../data/winners.ts";
import { ENDING_SOON_HOURS } from "../../src/components/thresholds.ts";

export const JUMP_TARGETS = ["submission", "live", "ending-soon", "ended", "after"] as const;
export type JumpTarget = (typeof JUMP_TARGETS)[number];

export function isJumpTarget(value: unknown): value is JumpTarget {
  return typeof value === "string" && (JUMP_TARGETS as readonly string[]).includes(value);
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The seed's shape (lib/seed/data.ts): a 12-day submission window, then 4 days of bidding. */
const SUBMISSION_WINDOW = 12 * DAY;
const BIDDING = 4 * DAY;

/** Hours from now until bidding closes, for each target that has already opened bidding. */
const CLOSES_IN: Record<Exclude<JumpTarget, "submission">, number> = {
  live: 48, // as seeded: opened two days ago, closes in two
  "ending-soon": 20, // under ENDING_SOON_HOURS
  ended: -1,
  after: -31 * 24, // 30+ days after: past the proof deadline
};
if (CLOSES_IN["ending-soon"] >= ENDING_SOON_HOURS) throw new Error("ending-soon must close inside ENDING_SOON_HOURS");

export interface JumpDates {
  submissionsOpenAt: Date;
  biddingOpensAt: Date;
  biddingClosesAt: Date;
}

/** The event's new dates. Rounded to the hour, like the seed, so shown times are round. */
export function jumpDates(target: JumpTarget, now: Date): JumpDates {
  const base = Math.floor(now.getTime() / HOUR) * HOUR;
  if (target === "submission") {
    // Submissions opened three days ago; bidding opens in four.
    const opens = base + 4 * DAY;
    return { submissionsOpenAt: new Date(base - 3 * DAY), biddingOpensAt: new Date(opens), biddingClosesAt: new Date(opens + BIDDING) };
  }
  const closes = base + CLOSES_IN[target] * HOUR;
  const opens = closes - BIDDING;
  return { submissionsOpenAt: new Date(opens - SUBMISSION_WINDOW), biddingOpensAt: new Date(opens), biddingClosesAt: new Date(closes) };
}

export interface JumpResult {
  /** Winners were cleared because bidding is open again. */
  winnersCleared: boolean;
  /** Winners were set now because bidding is closed. */
  winnersFinalized: boolean;
}

/**
 * Moves the current event to the target's dates. Going back to before the close clears the
 * winners and re-checks the proofs of everyone who had won, since their totals drop; going
 * to an ended target finalizes winners at once (they'd be finalized on the next read anyway).
 */
export async function jumpIn(tx: Tx, target: JumpTarget, now: Date): Promise<JumpResult> {
  const { rows } = await tx.query<{ id: Id; finalized: boolean }>(
    `SELECT id, winners_finalized_at IS NOT NULL AS finalized FROM events WHERE is_current FOR UPDATE`,
  );
  const event = rows[0];
  if (!event) throw new Error("There is no current event to move.");
  const dates = jumpDates(target, now);
  const open = dates.biddingClosesAt.getTime() > now.getTime();

  let winnersCleared = false;
  if (open && event.finalized) {
    const cleared = await tx.query<{ bidder_id: Id }>(
      `WITH old AS (
         SELECT i.id, i.winning_bid_id FROM items i WHERE i.event_id = $1 AND i.winning_bid_id IS NOT NULL FOR UPDATE),
       cleared AS (
         UPDATE items i SET winning_bid_id = NULL, updated_at = now() FROM old WHERE i.id = old.id RETURNING old.winning_bid_id)
       SELECT DISTINCT b.bidder_id FROM cleared JOIN bids b ON b.id = cleared.winning_bid_id`,
      [event.id],
    );
    await tx.query(`UPDATE events SET winners_finalized_at = NULL WHERE id = $1`, [event.id]);
    await recheckProofsIn(tx, event.id, cleared.rows.map((r) => r.bidder_id));
    winnersCleared = true;
  }

  // Each CHECK compares two dates, so set all three in one statement.
  await tx.query(
    `UPDATE events SET submissions_open_at = $2, bidding_opens_at = $3, bidding_closes_at = $4 WHERE id = $1`,
    [event.id, dates.submissionsOpenAt, dates.biddingOpensAt, dates.biddingClosesAt],
  );
  const winnersFinalized = open ? false : await finalizeWinnersIn(tx, event.id);
  return { winnersCleared, winnersFinalized };
}
