// The Admin Dashboard's Items section: every item with its bids and purchases, and removing a
// bid, cancelling a purchase or an item (SPEC §7.3–7.5, §8; DECISIONS #110, #115). Split from
// lib/data/admin.ts. Every path that changes a donation total ends in recheckProofsIn.

import type { Id, Tx } from "./db.ts";
import { currentEventIn, phaseOf } from "./event.ts";
import type { ResolvePhoto } from "./items.ts";
import { cancelItemIn, cancelPurchaseIn, removeBidIn } from "./winners.ts";
import type { AdminRefusal } from "../../src/components/admin-rules.ts";
import type { AdminBid, AdminItem, AdminItems, AdminPurchase, PersonName } from "../../src/admin-api.ts";
import type { ProofStatus } from "../../src/components/proof-rules.ts";
import { dbNow, iso, n, refuse } from "./admin.ts";

// Items

export async function adminItemsIn(tx: Tx, resolve: ResolvePhoto): Promise<AdminItems | null> {
  const event = await currentEventIn(tx);
  if (!event) return null;
  const now = await dbNow(tx);
  const { rows } = await tx.query<{
    id: Id; type: "auction" | "instant"; title: string; status: string; cancelled_at: Date | null;
    submitter_id: Id; first_name: string; last_name: string; cover: string | null;
    starting: number | null; price: number | null; quantity: number | null; remaining: number | null; winning_bid_id: Id | null; purchases: number;
  }>(
    `SELECT i.id, i.type, i.title, i.status, i.cancelled_at, u.id AS submitter_id, u.first_name, u.last_name,
            i.starting_bid_cents AS starting, i.price_cents AS price, i.quantity, i.remaining, i.winning_bid_id,
            (SELECT p.path FROM item_photos p WHERE p.item_id = i.id ORDER BY p.position LIMIT 1) AS cover,
            (SELECT count(*)::int FROM purchases p WHERE p.item_id = i.id AND p.cancelled_at IS NULL) AS purchases
       FROM items i JOIN users u ON u.id = i.submitter_id
      WHERE i.event_id = $1
      ORDER BY (i.status = 'active') DESC, i.type, i.created_at DESC, i.id DESC`,
    [event.id],
  );
  const { rows: bidRows } = await tx.query<{
    id: Id; item_id: Id; bidder_id: Id; first_name: string; last_name: string; amount_cents: number; created_at: Date;
    removed_at: Date | null; remover_id: Id | null; remover_first: string | null; remover_last: string | null;
  }>(
    `SELECT b.id, b.item_id, b.bidder_id, u.first_name, u.last_name, b.amount_cents, b.created_at, b.removed_at,
            r.id AS remover_id, r.first_name AS remover_first, r.last_name AS remover_last
       FROM bids b JOIN items i ON i.id = b.item_id JOIN users u ON u.id = b.bidder_id LEFT JOIN users r ON r.id = b.removed_by
      WHERE i.event_id = $1
      ORDER BY b.created_at DESC, b.id DESC`,
    [event.id],
  );
  const { rows: buyRows } = await tx.query<{
    id: Id; item_id: Id; buyer_id: Id; first_name: string; last_name: string; price_cents: number; created_at: Date; cancelled_at: Date | null; proof: ProofStatus | null;
  }>(
    `SELECT p.id, p.item_id, p.buyer_id, u.first_name, u.last_name, p.price_cents, p.created_at, p.cancelled_at,
            (SELECT pr.status FROM proofs pr WHERE pr.event_id = i.event_id AND pr.user_id = p.buyer_id ORDER BY pr.created_at DESC, pr.id DESC LIMIT 1) AS proof
       FROM purchases p JOIN items i ON i.id = p.item_id JOIN users u ON u.id = p.buyer_id
      WHERE i.event_id = $1
      ORDER BY p.created_at DESC, p.id DESC`,
    [event.id],
  );
  const buysByItem = new Map<Id, AdminPurchase[]>();
  for (const p of buyRows) {
    buysByItem.set(p.item_id, [...(buysByItem.get(p.item_id) ?? []), {
      id: p.id, buyer: { id: p.buyer_id, firstName: p.first_name, lastName: p.last_name }, priceCents: Number(p.price_cents),
      createdAt: p.created_at.toISOString(), cancelledAt: iso(p.cancelled_at), buyerProof: p.proof,
    }]);
  }
  const byItem = new Map<Id, typeof bidRows>();
  for (const b of bidRows) byItem.set(b.item_id, [...(byItem.get(b.item_id) ?? []), b]);

  const items: AdminItem[] = rows.map((r) => {
    const own = byItem.get(r.id) ?? [];
    const standing = own.filter((b) => !b.removed_at);
    // The same order as winners (lib/data/winners.ts): largest, then earliest, then lowest id.
    const top = [...standing].sort((a, b) =>
      Number(b.amount_cents) - Number(a.amount_cents) || a.created_at.getTime() - b.created_at.getTime() || (BigInt(a.id) < BigInt(b.id) ? -1 : 1))[0];
    const crowned = r.status === "cancelled" ? null : (r.winning_bid_id ?? top?.id ?? null);
    const bids: AdminBid[] = own.map((b) => ({
      id: b.id, bidder: { id: b.bidder_id, firstName: b.first_name, lastName: b.last_name },
      amountCents: Number(b.amount_cents), createdAt: b.created_at.toISOString(), removedAt: iso(b.removed_at),
      removedBy: b.remover_id ? { id: b.remover_id, firstName: b.remover_first!, lastName: b.remover_last! } : null,
      isTop: b.id === crowned,
    }));
    return {
      id: r.id, type: r.type, title: r.title, coverUrl: r.cover ? resolve(r.cover) : "", cancelled: r.status === "cancelled", cancelledAt: iso(r.cancelled_at),
      submitter: { id: r.submitter_id, firstName: r.first_name, lastName: r.last_name } satisfies PersonName,
      startingBidCents: n(r.starting), priceCents: n(r.price), quantity: n(r.quantity), remaining: n(r.remaining),
      purchases: Number(r.purchases), purchaseList: buysByItem.get(r.id) ?? [], highBidCents: top ? Number(top.amount_cents) : null, bids,
    };
  });
  return { ok: true, now: now.toISOString(), phase: phaseOf(event, now), items };
}

/**
 * Removes a bid (SPEC §7.4), before or after the close (DECISIONS #110). The item row is
 * locked first; after the close removeBidIn re-chooses the winner and re-checks proofs.
 */
export async function adminRemoveBidIn(tx: Tx, bidId: Id, adminId: Id): Promise<{ ok: true; itemId: Id; proofsReopened: Id[] } | AdminRefusal> {
  const event = await currentEventIn(tx);
  if (!event) return refuse("not-found", "There's no current event.");
  const { rows } = await tx.query<{ item_id: Id; status: string; removed: boolean }>(
    `SELECT i.id AS item_id, i.status, b.removed_at IS NOT NULL AS removed
       FROM bids b JOIN items i ON i.id = b.item_id
      WHERE b.id = $1 AND i.event_id = $2
      FOR UPDATE OF i`,
    [bidId, event.id],
  );
  const bid = rows[0];
  if (!bid) return refuse("not-found", "That bid doesn't exist.");
  if (bid.status !== "active") return refuse("cancelled", "That item is cancelled, so its bids no longer count.");
  if (bid.removed) return refuse("already-removed", "That bid was already removed.");
  const result = await removeBidIn(tx, bidId, adminId);
  return { ok: true, itemId: result.itemId, proofsReopened: result.proofsReopened };
}

/**
 * Cancels one purchase (owner, 6D review; SPEC v1.18 §7.5; DECISIONS #74, #115). The item row is
 * locked first, as buying does, so two admins cancelling the same purchase run one after the
 * other and the second is refused; the purchase is then read afresh. The buyer's total drops
 * and their approved proof is re-checked (cancelPurchaseIn). The unit goes back into stock only
 * while the sale is live, not after the close: the results are final then.
 */
export async function adminCancelPurchaseIn(tx: Tx, purchaseId: Id): Promise<{ ok: true; restocked: boolean; proofsReopened: Id[] } | AdminRefusal> {
  const event = await currentEventIn(tx);
  if (!event) return refuse("not-found", "There's no current event.");
  const { rows: found } = await tx.query<{ item_id: Id }>(
    `SELECT p.item_id FROM purchases p JOIN items i ON i.id = p.item_id WHERE p.id = $1 AND i.event_id = $2`,
    [purchaseId, event.id],
  );
  if (!found[0]) return refuse("not-found", "That purchase doesn't exist.");
  const { rows: items } = await tx.query<{ status: string }>(`SELECT status FROM items WHERE id = $1 FOR UPDATE`, [found[0].item_id]);
  // A new statement after the lock, so it sees a cancellation committed while this one waited.
  const { rows } = await tx.query<{ cancelled: boolean }>(`SELECT cancelled_at IS NOT NULL AS cancelled FROM purchases WHERE id = $1 FOR UPDATE`, [purchaseId]);
  if (items[0]!.status !== "active") return refuse("cancelled", "That item is cancelled, so its purchases are already cancelled.");
  if (rows[0]!.cancelled) return refuse("already-cancelled", "That purchase was already cancelled.");
  const { proofsReopened } = await cancelPurchaseIn(tx, purchaseId);
  const restocked = phaseOf(event, await dbNow(tx)) === "live";
  if (restocked) await tx.query(`UPDATE items SET remaining = remaining + 1, updated_at = now() WHERE id = $1`, [found[0].item_id]);
  return { ok: true, restocked, proofsReopened };
}

/** Cancels an item (SPEC §7.3), before or after the close (DECISIONS #110). */
export async function adminCancelItemIn(tx: Tx, itemId: Id): Promise<{ ok: true; proofsReopened: Id[] } | AdminRefusal> {
  const event = await currentEventIn(tx);
  if (!event) return refuse("not-found", "There's no current event.");
  const { rows } = await tx.query<{ status: string }>(`SELECT status FROM items WHERE id = $1 AND event_id = $2 FOR UPDATE`, [itemId, event.id]);
  if (!rows[0]) return refuse("not-found", "That item doesn't exist.");
  if (rows[0].status !== "active") return refuse("cancelled", "That item is already cancelled.");
  const result = await cancelItemIn(tx, itemId);
  return { ok: true, proofsReopened: result.proofsReopened };
}
