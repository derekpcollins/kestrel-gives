// Winners, bid removal and cancellations: every change to who owes what (SPEC §7.1, §7.3,
// §7.4, DECISIONS #74). Each path that changes a donation total calls recheckProofsIn.
import type { Id, Tx } from "./db.ts";
import { recheckProofsIn } from "./totals.ts";

/** The highest bid that isn't removed; ties go to the earlier bid. */
const TOP_BID = `
  SELECT b.id FROM bids b
   WHERE b.item_id = i.id AND b.removed_at IS NULL
   ORDER BY b.amount_cents DESC, b.created_at ASC, b.id ASC
   LIMIT 1`;

/**
 * Finalizes winners once, on the first request after bidding closes, even if two arrive
 * together: only the request whose conditional update claims the event sets the winners.
 * Returns true if this call did it.
 */
export async function finalizeWinnersIn(tx: Tx, eventId: Id): Promise<boolean> {
  // Winning bids add to totals; someone may already have an approved proof for purchases.
  const claimed = await tx.query(
    `UPDATE events SET winners_finalized_at = now()
      WHERE id = $1 AND winners_finalized_at IS NULL AND bidding_closes_at <= now()
      RETURNING id`,
    [eventId],
  );
  if (claimed.rowCount === 0) return false;
  const { rows } = await tx.query<{ bidder_id: Id }>(
    `WITH won AS (
       UPDATE items i SET winning_bid_id = (${TOP_BID}), updated_at = now()
        WHERE i.event_id = $1 AND i.type = 'auction' AND i.status = 'active'
        RETURNING winning_bid_id)
     SELECT DISTINCT b.bidder_id FROM won JOIN bids b ON b.id = won.winning_bid_id`,
    [eventId],
  );
  await recheckProofsIn(tx, eventId, rows.map((r) => r.bidder_id));
  return true;
}

export interface RemovedBid {
  itemId: Id;
  /** The winning bid before and after; equal when the removed bid wasn't the winner. */
  previousWinner: Id | null;
  winner: Id | null;
  /** Proofs that went back to pending because a total changed. */
  proofsReopened: Id[];
}

/**
 * An admin removes a bid. In one transaction: lock the item, mark the bid removed, and if
 * winners are already final, recompute the winner from the remaining bids (or none) and
 * send the affected people's latest proofs back to pending. The database's deferred
 * items_winner_not_removed key fails the commit if the winner were left on a removed bid.
 */
export async function removeBidIn(tx: Tx, bidId: Id, adminId: Id): Promise<RemovedBid> {
  const { rows } = await tx.query<{ item_id: Id; event_id: Id; finalized: boolean; winning_bid_id: Id | null; status: string }>(
    `SELECT i.id AS item_id, i.event_id, e.winners_finalized_at IS NOT NULL AS finalized, i.winning_bid_id, i.status
       FROM bids b JOIN items i ON i.id = b.item_id JOIN events e ON e.id = i.event_id
      WHERE b.id = $1
      FOR UPDATE OF i`,
    [bidId],
  );
  const item = rows[0];
  if (!item) throw new Error("That bid doesn't exist.");

  const removed = await tx.query(
    `UPDATE bids SET removed_at = now(), removed_by = $2 WHERE id = $1 AND removed_at IS NULL RETURNING bidder_id`,
    [bidId, adminId],
  );
  if (removed.rowCount === 0) throw new Error("That bid was already removed.");

  const previousWinner = item.winning_bid_id;
  if (!item.finalized || item.status !== "active") {
    return { itemId: item.item_id, previousWinner, winner: previousWinner, proofsReopened: [] };
  }

  const { rows: updated } = await tx.query<{ winning_bid_id: Id | null }>(
    `UPDATE items i SET winning_bid_id = (${TOP_BID}), updated_at = now() WHERE i.id = $1 RETURNING winning_bid_id`,
    [item.item_id],
  );
  const winner = updated[0]?.winning_bid_id ?? null;
  if (winner === previousWinner) return { itemId: item.item_id, previousWinner, winner, proofsReopened: [] };

  const { rows: people } = await tx.query<{ bidder_id: Id }>(
    `SELECT bidder_id FROM bids WHERE id = ANY($1::bigint[])`,
    [[previousWinner, winner].filter((id): id is Id => id !== null)],
  );
  const proofsReopened = await recheckProofsIn(tx, item.event_id, people.map((p) => p.bidder_id));
  return { itemId: item.item_id, previousWinner, winner, proofsReopened };
}

/**
 * A purchase is cancelled. Its price leaves the buyer's total, so their approved proof is
 * re-checked. Stock is not changed here (see DECISIONS #74).
 */
export async function cancelPurchaseIn(tx: Tx, purchaseId: Id): Promise<{ proofsReopened: Id[] }> {
  const { rows } = await tx.query<{ buyer_id: Id; event_id: Id }>(
    `UPDATE purchases p SET cancelled_at = now()
       FROM items i
      WHERE p.id = $1 AND i.id = p.item_id AND p.cancelled_at IS NULL
      RETURNING p.buyer_id, i.event_id`,
    [purchaseId],
  );
  const purchase = rows[0];
  if (!purchase) throw new Error("That purchase doesn't exist or was already cancelled.");
  return { proofsReopened: await recheckProofsIn(tx, purchase.event_id, [purchase.buyer_id]) };
}

/**
 * An admin cancels an item (SPEC §7.3): it leaves listings, its purchases are cancelled, and
 * its winning bid no longer counts (cancelled items drop out of totals). Everyone whose
 * total changed has their approved proof re-checked.
 */
export async function cancelItemIn(tx: Tx, itemId: Id): Promise<{ proofsReopened: Id[] }> {
  const { rows: items } = await tx.query<{ event_id: Id; winning_bid_id: Id | null }>(
    `UPDATE items SET status = 'cancelled', cancelled_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'active'
      RETURNING event_id, winning_bid_id`,
    [itemId],
  );
  const item = items[0];
  if (!item) throw new Error("That item doesn't exist or was already cancelled.");
  const { rows: buyers } = await tx.query<{ buyer_id: Id }>(
    `UPDATE purchases SET cancelled_at = now() WHERE item_id = $1 AND cancelled_at IS NULL RETURNING buyer_id`,
    [itemId],
  );
  const affected = buyers.map((b) => b.buyer_id);
  if (item.winning_bid_id) {
    const { rows } = await tx.query<{ bidder_id: Id }>(`SELECT bidder_id FROM bids WHERE id = $1`, [item.winning_bid_id]);
    if (rows[0]) affected.push(rows[0].bidder_id);
  }
  return { proofsReopened: await recheckProofsIn(tx, item.event_id, affected) };
}

