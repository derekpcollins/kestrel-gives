// Placing bids and buying (SPEC §7.4, §7.5, DECISIONS #88). Each runs in the caller's
// transaction: lock the item row, read the database clock after the lock (so a request that
// waited can't land after the close), check the shared rules, then write. The first saved
// bid wins; the other is refused with the new minimum. Stock never goes below zero.
import type { Id, Tx } from "./db.ts";
import { currentEventIn, phaseOf, type CurrentEvent } from "./event.ts";
import { recheckProofsIn } from "./totals.ts";
import { buyBlock, checkBid, minimumBidCents, type SaleRefusal } from "../../src/components/sale-rules.ts";
import type { Phase } from "../../src/components/item-tile-rules.ts";

export type SaleOutcome<T> =
  | ({ ok: true } & T)
  | { ok: false; refusal: SaleRefusal | { code: "not-found"; message: string }; minimumBidCents?: number; highBidCents?: number | null };

const NOT_FOUND = { ok: false as const, refusal: { code: "not-found" as const, message: "That item doesn't exist." } };

interface LockedItem {
  id: Id;
  type: "auction" | "instant";
  status: string;
  submitterId: Id;
  startingBidCents: number | null;
  priceCents: number | null;
  remaining: number | null;
}

/** Locks the item for the rest of the transaction and reads the clock after the lock. */
async function lockItemIn(tx: Tx, event: CurrentEvent, itemId: Id): Promise<{ item: LockedItem; phase: Phase } | null> {
  const { rows } = await tx.query<{ id: Id; type: "auction" | "instant"; status: string; submitter_id: Id; starting: number | null; price: number | null; remaining: number | null }>(
    `SELECT id, type, status, submitter_id, starting_bid_cents AS starting, price_cents AS price, remaining
       FROM items WHERE id = $1 AND event_id = $2 FOR UPDATE`,
    [itemId, event.id],
  );
  const r = rows[0];
  if (!r) return null;
  const { rows: clock } = await tx.query<{ now: Date }>(`SELECT clock_timestamp() AS now`);
  return {
    item: {
      id: r.id, type: r.type, status: r.status, submitterId: r.submitter_id,
      startingBidCents: r.starting === null ? null : Number(r.starting),
      priceCents: r.price === null ? null : Number(r.price),
      remaining: r.remaining === null ? null : Number(r.remaining),
    },
    phase: phaseOf(event, clock[0]!.now),
  };
}

async function highBidIn(tx: Tx, itemId: Id): Promise<{ amountCents: number; bidderId: Id } | null> {
  const { rows } = await tx.query<{ amount_cents: number; bidder_id: Id }>(
    `SELECT amount_cents, bidder_id FROM bids WHERE item_id = $1 AND removed_at IS NULL
      ORDER BY amount_cents DESC, created_at ASC, id ASC LIMIT 1`,
    [itemId],
  );
  return rows[0] ? { amountCents: Number(rows[0].amount_cents), bidderId: rows[0].bidder_id } : null;
}

export interface PlaceBid {
  itemId: Id;
  bidderId: Id;
  amountCents: number;
  /** The high bid the bidder's page showed, so a lost race gets the new minimum (#88). */
  seenHighBidCents?: number | null;
}

export async function placeBidIn(tx: Tx, bid: PlaceBid): Promise<SaleOutcome<{ bidId: Id; amountCents: number }>> {
  const event = await currentEventIn(tx);
  if (!event) return NOT_FOUND;
  const locked = await lockItemIn(tx, event, bid.itemId);
  if (!locked || locked.item.type !== "auction") return NOT_FOUND;
  const { item, phase } = locked;

  const high = await highBidIn(tx, item.id);
  const state = {
    phase, cancelled: item.status === "cancelled", viewerIsSubmitter: item.submitterId === bid.bidderId,
    startingBidCents: item.startingBidCents!, incrementCents: event.bidIncrementCents,
    highBidCents: high?.amountCents ?? null, viewerIsHighBidder: high?.bidderId === bid.bidderId,
  };
  const refusal = checkBid(state, bid.amountCents, bid.seenHighBidCents);
  if (refusal) return { ok: false, refusal, minimumBidCents: minimumBidCents(state), highBidCents: state.highBidCents };

  const { rows } = await tx.query<{ id: Id }>(
    `INSERT INTO bids (item_id, bidder_id, amount_cents, created_at) VALUES ($1, $2, $3, clock_timestamp()) RETURNING id`,
    [item.id, bid.bidderId, bid.amountCents],
  );
  return { ok: true, bidId: rows[0]!.id, amountCents: bid.amountCents };
}

/** Buys one unit (SPEC §7.5). The buyer's total goes up, so their approved proof is re-checked (§7.6). */
export async function buyIn(tx: Tx, purchase: { itemId: Id; buyerId: Id }): Promise<SaleOutcome<{ purchaseId: Id; priceCents: number; remaining: number; proofsReopened: Id[] }>> {
  const event = await currentEventIn(tx);
  if (!event) return NOT_FOUND;
  const locked = await lockItemIn(tx, event, purchase.itemId);
  if (!locked || locked.item.type !== "instant") return NOT_FOUND;
  const { item, phase } = locked;

  const refusal = buyBlock({ phase, cancelled: item.status === "cancelled", viewerIsSubmitter: item.submitterId === purchase.buyerId, remaining: item.remaining! });
  if (refusal) return { ok: false, refusal };

  // The row lock makes this the only writer; `remaining > 0` (and the table's CHECK) is the floor anyway.
  const { rows: stock } = await tx.query<{ remaining: number }>(
    `UPDATE items SET remaining = remaining - 1, updated_at = now() WHERE id = $1 AND remaining > 0 RETURNING remaining`,
    [item.id],
  );
  if (!stock[0]) return { ok: false, refusal: { code: "sold-out", message: "Sold out." } };
  const { rows } = await tx.query<{ id: Id }>(
    `INSERT INTO purchases (item_id, buyer_id, price_cents, created_at) VALUES ($1, $2, $3, clock_timestamp()) RETURNING id`,
    [item.id, purchase.buyerId, item.priceCents],
  );
  const proofsReopened = await recheckProofsIn(tx, event.id, [purchase.buyerId]);
  return { ok: true, purchaseId: rows[0]!.id, priceCents: item.priceCents!, remaining: Number(stock[0].remaining), proofsReopened };
}
