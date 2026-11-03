// Jump to (SPEC §3.1, DECISIONS #81): moves the current event's dates relative to now so a
// visitor can see each phase. The clock is never faked; the real time-window rules run.
import type { Id, Tx } from "../data/db.ts";
import { setEventDatesIn, type DatesResult } from "../data/event-dates.ts";
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

export type JumpResult = DatesResult;

/**
 * Moves the current event to the target's dates (lib/data/event-dates.ts clears or sets the
 * winners to match).
 */
export async function jumpIn(tx: Tx, target: JumpTarget, now: Date): Promise<JumpResult> {
  const { rows } = await tx.query<{ id: Id }>(`SELECT id FROM events WHERE is_current FOR UPDATE`);
  const event = rows[0];
  if (!event) throw new Error("There is no current event to move.");
  return setEventDatesIn(tx, event.id, jumpDates(target, now), now);
}
