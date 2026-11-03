// Reading items for the browse pages and the item page (SPEC §8, DECISIONS #87). Only items of
// the current event. The high bid is the highest bid that isn't removed, ties to the earlier
// bid: the same order winners are finalized with (lib/data/winners.ts).
import type { Id, Tx } from "./db.ts";
import type { BidView, BrowseSort, ItemDetail, ItemSummary, ItemType } from "../../src/items-api.ts";

/** Turns a stored photo path into a URL the browser can load (lib/seed/photo-url.ts). */
export type ResolvePhoto = (stored: string) => string;

export const BROWSE_SORTS: readonly BrowseSort[] = ["newest", "price", "bids"];

/** Newest first; price low to high (an auction by its top bid, else its starting bid); most bids. */
const ORDER: Record<BrowseSort, string> = {
  newest: "i.created_at DESC, i.id DESC",
  price: "COALESCE(t.amount_cents, i.starting_bid_cents, i.price_cents) ASC, i.created_at DESC, i.id DESC",
  bids: "bid_count DESC, i.created_at DESC, i.id DESC",
};

const TOP_BID = `
  LEFT JOIN LATERAL (
    SELECT b.amount_cents, b.bidder_id FROM bids b
     WHERE b.item_id = i.id AND b.removed_at IS NULL
     ORDER BY b.amount_cents DESC, b.created_at ASC, b.id ASC
     LIMIT 1) t ON true`;

export async function listItemsIn(tx: Tx, eventId: Id, type: ItemType, sort: BrowseSort, viewerId: Id, resolve: ResolvePhoto): Promise<ItemSummary[]> {
  const { rows } = await tx.query<{
    id: Id; type: ItemType; title: string; cover: string | null; starting: number | null; price: number | null; remaining: number | null;
    top: number | null; bid_count: number; viewer_top: boolean; viewer_bid: boolean;
  }>(
    `SELECT i.id, i.type, i.title, i.starting_bid_cents AS starting, i.price_cents AS price, i.remaining,
            (SELECT p.path FROM item_photos p WHERE p.item_id = i.id ORDER BY p.position LIMIT 1) AS cover,
            t.amount_cents AS top,
            (SELECT count(*)::int FROM bids b WHERE b.item_id = i.id AND b.removed_at IS NULL) AS bid_count,
            COALESCE(t.bidder_id = $3, false) AS viewer_top,
            EXISTS (SELECT 1 FROM bids b WHERE b.item_id = i.id AND b.bidder_id = $3 AND b.removed_at IS NULL) AS viewer_bid
       FROM items i ${TOP_BID}
      WHERE i.event_id = $1 AND i.type = $2 AND i.status = 'active'
      ORDER BY ${ORDER[sort]}`,
    [eventId, type, viewerId],
  );
  return rows.map((r) => ({
    id: r.id, type: r.type, title: r.title, coverUrl: r.cover ? resolve(r.cover) : "",
    startingBidCents: num(r.starting), topBidCents: num(r.top), bidCount: Number(r.bid_count),
    priceCents: num(r.price), remaining: num(r.remaining),
    viewerIsTopBidder: r.viewer_top, viewerHasBid: r.viewer_bid,
  }));
}

/** One item with its photos and public bid history, or null if it isn't in the current event. */
export async function itemDetailIn(tx: Tx, eventId: Id, itemId: Id, viewerId: Id, resolve: ResolvePhoto): Promise<ItemDetail | null> {
  const { rows } = await tx.query<{
    id: Id; type: ItemType; title: string; description: string; status: string;
    starting: number | null; price: number | null; quantity: number | null; remaining: number | null;
    submitter_id: Id; first_name: string; last_name: string; viewer_purchases: number; activity: boolean;
  }>(
    `SELECT i.id, i.type, i.title, i.description, i.status, i.starting_bid_cents AS starting, i.price_cents AS price,
            i.quantity, i.remaining, u.id AS submitter_id, u.first_name, u.last_name,
            (SELECT count(*)::int FROM purchases p WHERE p.item_id = i.id AND p.buyer_id = $3 AND p.cancelled_at IS NULL) AS viewer_purchases,
            (EXISTS (SELECT 1 FROM bids b WHERE b.item_id = i.id) OR EXISTS (SELECT 1 FROM purchases p WHERE p.item_id = i.id)) AS activity
       FROM items i JOIN users u ON u.id = i.submitter_id
      WHERE i.id = $2 AND i.event_id = $1`,
    [eventId, itemId, viewerId],
  );
  const r = rows[0];
  if (!r) return null;

  const { rows: photos } = await tx.query<{ id: Id; path: string; position: number }>(
    `SELECT id, path, position FROM item_photos WHERE item_id = $1 ORDER BY position`,
    [itemId],
  );
  const { rows: bidRows } = await tx.query<{ id: Id; bidder_id: Id; first_name: string; last_name: string; amount_cents: number; created_at: Date }>(
    `SELECT b.id, b.bidder_id, u.first_name, u.last_name, b.amount_cents, b.created_at
       FROM bids b JOIN users u ON u.id = b.bidder_id
      WHERE b.item_id = $1 AND b.removed_at IS NULL
      ORDER BY b.created_at DESC, b.id DESC`,
    [itemId],
  );
  const top = topOf(bidRows);
  // A cancelled item has no winner, so no bid wears the crown (the amounts still show).
  const crowned = r.status === "cancelled" ? undefined : top;
  const bids: BidView[] = bidRows.map((b) => ({
    id: b.id, bidderId: b.bidder_id, firstName: b.first_name, lastName: b.last_name,
    amountCents: Number(b.amount_cents), createdAt: b.created_at.toISOString(), isTop: b.id === crowned?.id,
  }));

  return {
    id: r.id, type: r.type, title: r.title, description: r.description,
    submitter: { id: r.submitter_id, firstName: r.first_name, lastName: r.last_name },
    photos: photos.map((p) => ({ id: p.id, url: resolve(p.path), position: Number(p.position) })),
    cancelled: r.status === "cancelled",
    startingBidCents: num(r.starting), priceCents: num(r.price), quantity: num(r.quantity), remaining: num(r.remaining),
    bids,
    highBidCents: top ? Number(top.amount_cents) : null,
    viewerIsTopBidder: top?.bidder_id === viewerId,
    viewerHasBid: bidRows.some((b) => b.bidder_id === viewerId),
    viewerPurchases: Number(r.viewer_purchases),
    hasActivity: r.activity,
  };
}

/** The high bid: largest amount, then earliest, then lowest id (matches TOP_BID). */
function topOf<T extends { id: Id; amount_cents: number; created_at: Date }>(bids: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const b of bids) {
    if (
      !best ||
      Number(b.amount_cents) > Number(best.amount_cents) ||
      (Number(b.amount_cents) === Number(best.amount_cents) &&
        (b.created_at < best.created_at || (b.created_at.getTime() === best.created_at.getTime() && BigInt(b.id) < BigInt(best.id))))
    ) best = b;
  }
  return best;
}

const num = (v: number | null) => (v === null ? null : Number(v));
