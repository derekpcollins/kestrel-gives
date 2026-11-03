// Your Items (SPEC §8): the viewer's bids, wins and purchases, donated items, cancellations and
// proof, for the current event. Removed bids are left out. Reading the event finalizes winners
// first if bidding has closed, so "won" and "lost" are settled before they're shown.
import type { Id, Tx } from "./db.ts";
import { currentEventIn, phaseOf, proofDeadlineOf, type CurrentEvent } from "./event.ts";
import { donationTotalIn } from "./totals.ts";
import type { ResolvePhoto } from "./items.ts";
import { proofBlock, totalChanged, type ProofStatus } from "../../src/components/proof-rules.ts";
import type { BidStanding, MeAnswer, MyBid, MyCancelled, MyDonated, MyWin, ProofView } from "../../src/me-api.ts";
import type { ItemType } from "../../src/items-api.ts";

const COVER = `(SELECT p.path FROM item_photos p WHERE p.item_id = i.id ORDER BY p.position LIMIT 1)`;
const num = (v: number | null) => (v === null ? null : Number(v));

export interface LatestProof {
  status: ProofStatus;
  amountCents: number;
  owedCents: number;
  rejectionReason: string | null;
  createdAt: Date;
  imagePath: string;
}

export async function latestProofIn(tx: Tx, eventId: Id, userId: Id, lock = false): Promise<LatestProof | null> {
  const { rows } = await tx.query<{ status: ProofStatus; amount_cents: number; owed_cents: number; rejection_reason: string | null; created_at: Date; image_path: string }>(
    `SELECT status, amount_cents, owed_cents, rejection_reason, created_at, image_path FROM proofs
      WHERE event_id = $1 AND user_id = $2 ORDER BY created_at DESC, id DESC LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [eventId, userId],
  );
  const r = rows[0];
  return r ? { status: r.status, amountCents: Number(r.amount_cents), owedCents: Number(r.owed_cents), rejectionReason: r.rejection_reason, createdAt: r.created_at, imagePath: r.image_path } : null;
}

export async function proofViewIn(tx: Tx, event: CurrentEvent, userId: Id, resolve: ResolvePhoto): Promise<ProofView> {
  const totalCents = await donationTotalIn(tx, event.id, userId);
  const latest = await latestProofIn(tx, event.id, userId);
  const facts = { totalCents, latest: latest && { status: latest.status, owedCents: latest.owedCents } };
  const deadline = proofDeadlineOf(event);
  return {
    totalCents,
    latest: latest && {
      status: latest.status, amountCents: latest.amountCents, owedCents: latest.owedCents,
      rejectionReason: latest.rejectionReason, createdAt: latest.createdAt.toISOString(), imageUrl: resolve(latest.imagePath),
    },
    deadline: deadline ? deadline.toISOString() : null,
    totalChanged: totalChanged(facts),
    blocked: proofBlock(facts),
  };
}

export async function meAnswerIn(
  tx: Tx,
  viewer: { id: Id; firstName: string; lastName: string; role: "admin" | "employee" },
  resolve: ResolvePhoto,
): Promise<MeAnswer | null> {
  const event = await currentEventIn(tx);
  if (!event) return null;
  const { rows: clock } = await tx.query<{ now: Date }>(`SELECT now() AS now`);
  const now = clock[0]!.now;
  const phase = phaseOf(event, now);
  const cover = (path: string | null) => (path ? resolve(path) : "");
  const cancelled: MyCancelled[] = [];

  // Items the viewer bid on: their best bid, the high bid, and who holds it or won.
  const { rows: bidRows } = await tx.query<{
    id: Id; title: string; cover: string | null; status: string; mine: number; high: number; top_bidder: Id; winner: Id | null;
  }>(
    `SELECT i.id, i.title, ${COVER} AS cover, i.status,
            max(b.amount_cents) FILTER (WHERE b.bidder_id = $2) AS mine,
            t.amount_cents AS high, t.bidder_id AS top_bidder, w.bidder_id AS winner
       FROM items i
       JOIN bids b ON b.item_id = i.id AND b.removed_at IS NULL
       JOIN LATERAL (SELECT amount_cents, bidder_id FROM bids x WHERE x.item_id = i.id AND x.removed_at IS NULL
                      ORDER BY x.amount_cents DESC, x.created_at ASC, x.id ASC LIMIT 1) t ON true
       LEFT JOIN bids w ON w.id = i.winning_bid_id
      WHERE i.event_id = $1
      GROUP BY i.id, t.amount_cents, t.bidder_id, w.bidder_id
     HAVING bool_or(b.bidder_id = $2)
      ORDER BY max(b.created_at) FILTER (WHERE b.bidder_id = $2) DESC`,
    [event.id, viewer.id],
  );
  const bids: MyBid[] = [];
  for (const r of bidRows) {
    if (r.status === "cancelled") {
      cancelled.push({ itemId: r.id, title: r.title, coverUrl: cover(r.cover), why: "bid", amountCents: null });
      continue;
    }
    const standing: BidStanding = phase === "ended"
      ? (r.winner === viewer.id ? "won" : "lost")
      : (r.top_bidder === viewer.id ? "winning" : "outbid");
    bids.push({ itemId: r.id, title: r.title, coverUrl: cover(r.cover), myTopCents: Number(r.mine), highBidCents: Number(r.high), standing });
  }

  // Won & purchased: winning bids on active items, and each unit bought.
  const { rows: winRows } = await tx.query<{ kind: "won" | "bought"; id: Id; title: string; cover: string | null; amount: number; at: Date; item_status: string; cancelled_at: Date | null }>(
    `SELECT 'won' AS kind, i.id, i.title, ${COVER} AS cover, b.amount_cents AS amount, b.created_at AS at, i.status AS item_status, NULL::timestamptz AS cancelled_at
       FROM items i JOIN bids b ON b.id = i.winning_bid_id
      WHERE i.event_id = $1 AND b.bidder_id = $2 AND b.removed_at IS NULL AND i.status = 'active'
     UNION ALL
     SELECT 'bought', i.id, i.title, ${COVER}, p.price_cents, p.created_at, i.status, p.cancelled_at
       FROM purchases p JOIN items i ON i.id = p.item_id
      WHERE i.event_id = $1 AND p.buyer_id = $2
      ORDER BY at DESC`,
    [event.id, viewer.id],
  );
  const wins: MyWin[] = [];
  for (const r of winRows) {
    if (r.kind === "bought" && (r.cancelled_at || r.item_status === "cancelled")) {
      cancelled.push({ itemId: r.id, title: r.title, coverUrl: cover(r.cover), why: "bought", amountCents: Number(r.amount) });
      continue;
    }
    wins.push({ kind: r.kind, itemId: r.id, title: r.title, coverUrl: cover(r.cover), amountCents: Number(r.amount), at: r.at.toISOString() });
  }

  // My donated items. Activity counts removed bids and cancelled purchases too (#94).
  const { rows: donatedRows } = await tx.query<{
    id: Id; type: ItemType; title: string; cover: string | null; status: string; activity: boolean; bid_count: number; high: number | null;
    starting: number | null; price: number | null; quantity: number | null; remaining: number | null;
  }>(
    `SELECT i.id, i.type, i.title, ${COVER} AS cover, i.status,
            (EXISTS (SELECT 1 FROM bids b WHERE b.item_id = i.id) OR EXISTS (SELECT 1 FROM purchases p WHERE p.item_id = i.id)) AS activity,
            (SELECT count(*)::int FROM bids b WHERE b.item_id = i.id AND b.removed_at IS NULL) AS bid_count,
            (SELECT max(b.amount_cents) FROM bids b WHERE b.item_id = i.id AND b.removed_at IS NULL) AS high,
            i.starting_bid_cents AS starting, i.price_cents AS price, i.quantity, i.remaining
       FROM items i WHERE i.event_id = $1 AND i.submitter_id = $2
      ORDER BY i.created_at DESC, i.id DESC`,
    [event.id, viewer.id],
  );
  const donated: MyDonated[] = [];
  for (const r of donatedRows) {
    if (r.status === "cancelled") {
      cancelled.push({ itemId: r.id, title: r.title, coverUrl: cover(r.cover), why: "donated", amountCents: null });
      continue;
    }
    donated.push({
      itemId: r.id, type: r.type, title: r.title, coverUrl: cover(r.cover), locked: r.activity, canDelete: !r.activity,
      bidCount: Number(r.bid_count), highBidCents: num(r.high), startingBidCents: num(r.starting),
      priceCents: num(r.price), quantity: num(r.quantity), remaining: num(r.remaining),
    });
  }

  return {
    ok: true, now: now.toISOString(), phase,
    viewer: { id: viewer.id, firstName: viewer.firstName, lastName: viewer.lastName, role: viewer.role },
    givingPlatformUrl: event.givingPlatformUrl,
    bids, wins, donated, cancelled,
    proof: await proofViewIn(tx, event, viewer.id, resolve),
  };
}
