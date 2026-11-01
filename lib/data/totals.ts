// Donation totals and proof re-checks (SPEC §7.6, DECISIONS #69). The total is computed, never
// stored: the person's winning bids plus their non-cancelled purchases, in one event.
import type { Id, Tx } from "./db.ts";

export async function donationTotalIn(tx: Tx, eventId: Id, userId: Id): Promise<number> {
  const { rows } = await tx.query<{ total: number }>(
    `SELECT
       COALESCE((SELECT sum(b.amount_cents)
                   FROM items i JOIN bids b ON b.id = i.winning_bid_id
                  WHERE i.event_id = $1 AND i.status = 'active' AND b.bidder_id = $2 AND b.removed_at IS NULL), 0)
     + COALESCE((SELECT sum(p.price_cents)
                   FROM purchases p JOIN items i ON i.id = p.item_id
                  WHERE i.event_id = $1 AND p.buyer_id = $2 AND p.cancelled_at IS NULL), 0) AS total`,
    [eventId, userId],
  );
  return Number(rows[0]?.total ?? 0);
}

/**
 * For each person, if their latest proof was uploaded against a different total than they
 * owe now, it goes back to pending (and loses its review) so an admin looks again and the
 * banner asks them to check it. Returns the ids of proofs that changed.
 */
export async function recheckProofsIn(tx: Tx, eventId: Id, userIds: readonly Id[]): Promise<Id[]> {
  const changed: Id[] = [];
  for (const userId of new Set(userIds)) {
    const { rows } = await tx.query<{ id: Id; owed_cents: number; status: string }>(
      `SELECT id, owed_cents, status FROM proofs WHERE event_id = $1 AND user_id = $2
        ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      [eventId, userId],
    );
    const latest = rows[0];
    if (!latest || latest.status === "pending") continue;
    if (Number(latest.owed_cents) === (await donationTotalIn(tx, eventId, userId))) continue;
    await tx.query(
      `UPDATE proofs SET status = 'pending', rejection_reason = NULL, reviewed_by = NULL, reviewed_at = NULL WHERE id = $1`,
      [latest.id],
    );
    changed.push(latest.id);
  }
  return changed;
}
