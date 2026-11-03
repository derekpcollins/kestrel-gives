// The shape of GET /api/me (Your Items, SPEC §8) and POST /api/proofs (SPEC §7.6). Types only,
// shared by the server and the pages. Money is in cents; ids are strings; times are ISO.
import type { Phase } from "./components/item-tile-rules.ts";
import type { ProofStatus } from "./components/proof-rules.ts";
import type { ItemType } from "./items-api.ts";

/** Live: winning or outbid. After the close: won or lost. */
export type BidStanding = "winning" | "outbid" | "won" | "lost";

export interface MyBid {
  itemId: string;
  title: string;
  coverUrl: string;
  myTopCents: number;
  highBidCents: number;
  standing: BidStanding;
}

/** One row of Won & purchased: an auction won, or one unit bought. */
export interface MyWin {
  kind: "won" | "bought";
  itemId: string;
  title: string;
  coverUrl: string;
  amountCents: number;
  at: string;
}

export interface MyDonated {
  itemId: string;
  type: ItemType;
  title: string;
  coverUrl: string;
  /** Sale type and money are locked: the item has a bid or purchase (SPEC §7.3). */
  locked: boolean;
  canDelete: boolean;
  bidCount: number;
  highBidCents: number | null;
  startingBidCents: number | null;
  priceCents: number | null;
  quantity: number | null;
  remaining: number | null;
}

/** Something of the viewer's that an admin cancelled (SPEC §7.3): shown only when there is one. */
export interface MyCancelled {
  itemId: string;
  title: string;
  coverUrl: string;
  why: "bid" | "bought" | "donated";
  /** For a cancelled purchase: what it cost. */
  amountCents: number | null;
}

export interface ProofView {
  totalCents: number;
  latest: { status: ProofStatus; amountCents: number; owedCents: number; rejectionReason: string | null; createdAt: string; imageUrl: string } | null;
  /** Close time plus the event's proof days; null until a close is set. */
  deadline: string | null;
  totalChanged: boolean;
  /** Why the viewer can't upload proof now, or null. */
  blocked: { code: string; message: string } | null;
}

export interface MeAnswer {
  ok: true;
  now: string;
  phase: Phase;
  viewer: { id: string; firstName: string; lastName: string; role: "admin" | "employee" };
  givingPlatformUrl: string | null;
  bids: MyBid[];
  wins: MyWin[];
  donated: MyDonated[];
  cancelled: MyCancelled[];
  proof: ProofView;
}
