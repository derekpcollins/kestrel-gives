// Jump to (SPEC §3.1, DECISIONS #81): moves the current event's dates relative to now so a
// visitor can see each phase. The clock is never faked; the real time-window rules run.
import type { Id, Tx } from "../data/db.ts";
import { setEventDatesIn, type DatesResult } from "../data/event-dates.ts";
import { ENDING_SOON_HOURS } from "../../src/components/thresholds.ts";
import { cooldownLeftIn, tryDemoLockIn } from "./restore.ts";

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

/**
 * Clears the current event's activity for "Submissions open" (owner, 7A review; DECISIONS #124):
 * that phase can't have bids, purchases or proofs. Items, their photos and cancellations stay;
 * instant-sale stock goes back to full. Returns the uploaded proof files to delete after the
 * commit (lib/api/files.ts keeps to this environment's own; seed images are never listed).
 */
export async function clearActivityIn(tx: Tx, eventId: Id): Promise<string[]> {
  const { rows: files } = await tx.query<{ path: string }>(
    `SELECT pathname AS path FROM uploads WHERE purpose = 'proof'
     UNION SELECT image_path FROM proofs WHERE event_id = $1 AND image_path NOT LIKE '/seed/%' AND image_path NOT LIKE 'seed/%'`,
    [eventId],
  );
  await tx.query(`UPDATE items SET winning_bid_id = NULL WHERE event_id = $1 AND winning_bid_id IS NOT NULL`, [eventId]);
  await tx.query(`DELETE FROM proofs WHERE event_id = $1`, [eventId]);
  await tx.query(`DELETE FROM purchases p USING items i WHERE i.id = p.item_id AND i.event_id = $1`, [eventId]);
  await tx.query(`DELETE FROM bids b USING items i WHERE i.id = b.item_id AND i.event_id = $1`, [eventId]);
  await tx.query(`UPDATE items SET remaining = quantity WHERE event_id = $1 AND type = 'instant'`, [eventId]);
  await tx.query(`DELETE FROM uploads WHERE purpose = 'proof'`);
  return files.map((f) => f.path);
}

export type JumpOutcome =
  | { status: "jumped"; cleared: boolean; files: string[] }
  | { status: "busy" } // someone else holds the demo lock: a restore, a jump, a reset or a deploy
  | { status: "cooldown"; retryAfterSeconds: number };

/**
 * One Jump to, as the demo bar asks for it, under the demo lock. "Submissions open" also clears
 * activity, so it follows Restore's rules too: refused within the global cooldown, and logged so
 * it starts one. Other jumps only move the dates, as before (#81).
 */
export async function tryJumpIn(tx: Tx, target: JumpTarget, now: Date): Promise<JumpOutcome> {
  if (!(await tryDemoLockIn(tx))) return { status: "busy" };
  if (target !== "submission") {
    await jumpIn(tx, target, now);
    return { status: "jumped", cleared: false, files: [] };
  }
  const wait = await cooldownLeftIn(tx, now);
  if (wait > 0) return { status: "cooldown", retryAfterSeconds: wait };
  const { rows } = await tx.query<{ id: Id }>(`SELECT id FROM events WHERE is_current FOR UPDATE`);
  if (!rows[0]) throw new Error("There is no current event to move.");
  const files = await clearActivityIn(tx, rows[0].id);
  await jumpIn(tx, target, now);
  await tx.query(`INSERT INTO demo_restores (source, restored_at) VALUES ('jump', $1)`, [now]);
  return { status: "jumped", cleared: true, files };
}
