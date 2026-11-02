// The shape of the items, bids and purchases API answers (DECISIONS #87, #88). Types only:
// shared by the server (lib/data/items.ts, api/*.ts) and the pages, so the two can't drift.
// Money is in cents, as stored; ids are strings (Postgres bigint).
import type { Phase } from "./components/item-tile-rules.ts";
import type { SaleRefusalCode } from "./components/sale-rules.ts";

export type ItemType = "auction" | "instant";
export type BrowseSort = "newest" | "price" | "bids";

/** One tile on a browse page. Cancelled items are never listed (SPEC §7.3). */
export interface ItemSummary {
  id: string;
  type: ItemType;
  title: string;
  coverUrl: string;
  startingBidCents: number | null;
  topBidCents: number | null;
  bidCount: number;
  priceCents: number | null;
  remaining: number | null;
  viewerIsTopBidder: boolean;
  viewerHasBid: boolean;
}

export interface BrowseAnswer {
  ok: true;
  type: ItemType;
  sort: BrowseSort;
  phase: Phase;
  items: ItemSummary[];
}

export interface BidView {
  id: string;
  bidderId: string;
  firstName: string;
  lastName: string;
  amountCents: number;
  /** ISO time from the database clock. */
  createdAt: string;
  /** The current high bid (the crown, SPEC §7.4). */
  isTop: boolean;
}

export interface ItemDetail {
  id: string;
  type: ItemType;
  title: string;
  description: string;
  submitter: { id: string; firstName: string; lastName: string };
  photos: { url: string; position: number }[];
  cancelled: boolean;
  startingBidCents: number | null;
  priceCents: number | null;
  quantity: number | null;
  remaining: number | null;
  /** Newest first. Removed bids are left out. */
  bids: BidView[];
  highBidCents: number | null;
  viewerIsTopBidder: boolean;
  viewerHasBid: boolean;
  /** How many units the viewer has bought (instant sale), not counting cancelled ones. */
  viewerPurchases: number;
}

export interface ItemAnswer {
  ok: true;
  /** The server's time and the event state the rules used. */
  now: string;
  phase: Phase;
  incrementCents: number;
  item: ItemDetail;
  /** For auctions: the lowest bid that counts now, and its hint. Null for instant sale. */
  minimumBidCents: number | null;
  bidHint: string | null;
  /** Why the viewer can't bid or buy right now, or null if they can. */
  blocked: { code: SaleRefusalCode; message: string } | null;
}

/** A successful bid or purchase answers with the updated item and a message to announce. */
export interface ActionAnswer extends ItemAnswer {
  message: string;
}

/** A refused bid or purchase. `minimumBidCents` and `highBidCents` come with bid refusals. */
export interface RefusalAnswer {
  ok: false;
  error: string;
  code?: SaleRefusalCode | "not-found";
  minimumBidCents?: number;
  highBidCents?: number | null;
}
