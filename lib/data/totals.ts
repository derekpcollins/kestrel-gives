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
 * The one re-check, called by every path that changes a donation total (DECISIONS #74):
 * finalizeWinnersIn, removeBidIn, cancelPurchaseIn and cancelItemIn today; buying (Milestone 4)
 * must call it too. For each person, only an **approved** latest proof that was uploaded
 * against a different total than they owe now goes back to pending, with its review
 * cleared. A pending proof is left alone (the amount warning covers a mismatch). A rejected
 * proof stays rejected with its reason; the banner shows the new total and still asks for
 * a new upload. Returns the ids of proofs that went back to pending.
 */
export async function recheckProofsIn(tx: Tx, eventId: Id, userIds: readonly Id[]): Promise<Id[]> {
  const reopened: Id[] = [];
  for (const userId of new Set(userIds)) {
    const { rows } = await tx.query<{ id: Id; owed_cents: number; status: string }>(
      `SELECT id, owed_cents, status FROM proofs WHERE event_id = $1 AND user_id = $2
        ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      [eventId, userId],
    );
    const latest = rows[0];
    if (!latest || latest.status !== "approved") continue;
    if (Number(latest.owed_cents) === (await donationTotalIn(tx, eventId, userId))) continue;
    await tx.query(`UPDATE proofs SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL WHERE id = $1`, [latest.id]);
    reopened.push(latest.id);
  }
  return reopened;
}
