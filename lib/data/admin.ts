// The Admin Dashboard's data (SPEC §7.1, §7.3–7.8, §8; DECISIONS #107–#111): Totals and People
// here, with the helpers the other sections share; proofs, items, and settings with templates
// and Reset in admin-proofs.ts, admin-items.ts and admin-settings.ts. Every write runs in the
// caller's transaction, locks the rows it decides on, and uses the database clock. Every path
// that changes a donation total ends in recheckProofsIn.
import type { Id, Tx } from "./db.ts";
import { currentEventIn, justResetIn, phaseOf, proofDeadlineOf, type CurrentEvent } from "./event.ts";
import { gapLine, type AdminRefusal, type AdminRefusalCode } from "../../src/components/admin-rules.ts";
import { nextEventName, resetUnlocksAt } from "../../src/components/settings-rules.ts";
import type { AdminEvent, AdminPeople, AdminSummary, AdminTotals } from "../../src/admin-api.ts";
import type { ProofStatus } from "../../src/components/proof-rules.ts";

export const iso = (d: Date | null) => (d ? d.toISOString() : null);
export const n = (v: number | string | null) => (v === null ? null : Number(v));
export const refuse = (code: AdminRefusalCode, message: string): AdminRefusal => ({ ok: false, code, message });

export async function dbNow(tx: Tx): Promise<Date> {
  const { rows } = await tx.query<{ now: Date }>(`SELECT now() AS now`);
  return rows[0]!.now;
}

export function adminEvent(event: CurrentEvent, now: Date): AdminEvent {
  return {
    id: event.id, name: event.name, timeZone: event.timeZone, phase: phaseOf(event, now),
    submissionsOpenAt: iso(event.submissionsOpenAt), biddingOpensAt: iso(event.biddingOpensAt), biddingClosesAt: iso(event.biddingClosesAt),
    proofDeadline: iso(proofDeadlineOf(event)),
  };
}

// ---------------------------------------------------------------------------------------------
// Totals and people

interface PersonMoney {
  id: Id; first_name: string; last_name: string; role: "admin" | "employee";
  auction: string; instant: string; bid_count: number; wins: number; purchases: number;
  proof_id: Id | null; proof_status: ProofStatus | null; proof_amount: number | null; proof_owed: number | null; proof_at: Date | null;
}

/** Everyone, with what they owe by sale type and their latest proof. */
async function peopleMoneyIn(tx: Tx, eventId: Id): Promise<PersonMoney[]> {
  const { rows } = await tx.query<PersonMoney>(
    `WITH won AS (
       SELECT b.bidder_id AS user_id, sum(b.amount_cents) AS cents, count(*)::int AS wins
         FROM items i JOIN bids b ON b.id = i.winning_bid_id
        WHERE i.event_id = $1 AND i.status = 'active'
        GROUP BY 1),
     bought AS (
       SELECT p.buyer_id AS user_id, sum(p.price_cents) AS cents, count(*)::int AS purchases
         FROM purchases p JOIN items i ON i.id = p.item_id
        WHERE i.event_id = $1 AND p.cancelled_at IS NULL
        GROUP BY 1),
     bid AS (
       SELECT b.bidder_id AS user_id, count(*)::int AS bid_count
         FROM bids b JOIN items i ON i.id = b.item_id
        WHERE i.event_id = $1 AND i.status = 'active' AND b.removed_at IS NULL
        GROUP BY 1),
     latest AS (
       SELECT DISTINCT ON (user_id) user_id, id, status, amount_cents, owed_cents, created_at
         FROM proofs WHERE event_id = $1
        ORDER BY user_id, created_at DESC, id DESC)
     SELECT u.id, u.first_name, u.last_name, u.role,
            COALESCE(won.cents, 0) AS auction, COALESCE(bought.cents, 0) AS instant,
            COALESCE(bid.bid_count, 0) AS bid_count, COALESCE(won.wins, 0) AS wins, COALESCE(bought.purchases, 0) AS purchases,
            latest.id AS proof_id, latest.status AS proof_status, latest.amount_cents AS proof_amount,
            latest.owed_cents AS proof_owed, latest.created_at AS proof_at
       FROM users u
       LEFT JOIN won ON won.user_id = u.id
       LEFT JOIN bought ON bought.user_id = u.id
       LEFT JOIN bid ON bid.user_id = u.id
       LEFT JOIN latest ON latest.user_id = u.id
      ORDER BY u.last_name, u.first_name, u.id`,
    [eventId],
  );
  return rows;
}

/** Pledged and confirmed, by sale type (DECISIONS #107). */
export function totalsFrom(people: readonly PersonMoney[], leadingBidsCents: number | null): AdminTotals {
  let pa = 0, pi = 0, ca = 0, ci = 0, approved = 0, count = 0;
  for (const p of people) {
    const a = Number(p.auction), i = Number(p.instant);
    pa += a;
    pi += i;
    if (p.proof_status === "approved") {
      ca += a;
      ci += i;
      approved += Number(p.proof_amount);
      count += 1;
    }
  }
  return {
    pledged: { auctionCents: pa, instantCents: pi, grandCents: pa + pi },
    confirmed: { auctionCents: ca, instantCents: ci, grandCents: approved },
    approvedOwedCents: ca + ci,
    approvedPeople: count,
    gapLine: gapLine(approved, ca + ci, count),
    leadingBidsCents,
  };
}

export async function adminSummaryIn(tx: Tx): Promise<AdminSummary | null> {
  const event = await currentEventIn(tx);
  if (!event) return null;
  const now = await dbNow(tx);
  const phase = phaseOf(event, now);
  let leading: number | null = null;
  if (phase === "live") {
    const { rows } = await tx.query<{ cents: string | null }>(
      `SELECT sum(t.amount_cents) AS cents FROM items i
         JOIN LATERAL (SELECT b.amount_cents FROM bids b WHERE b.item_id = i.id AND b.removed_at IS NULL
                        ORDER BY b.amount_cents DESC, b.created_at ASC, b.id ASC LIMIT 1) t ON true
        WHERE i.event_id = $1 AND i.type = 'auction' AND i.status = 'active'`,
      [event.id],
    );
    leading = Number(rows[0]?.cents ?? 0);
  }
  const people = await peopleMoneyIn(tx, event.id);
  // What Reset for next year would delete, for its dialog (SPEC §7.8).
  const { rows: counts } = await tx.query<{ active: number; items: number; photos: number; bids: number; purchases: number; proofs: number }>(
    `SELECT (SELECT count(*)::int FROM items WHERE event_id = $1 AND status = 'active') AS active,
            (SELECT count(*)::int FROM items WHERE event_id = $1) AS items,
            (SELECT count(*)::int FROM item_photos p JOIN items i ON i.id = p.item_id WHERE i.event_id = $1) AS photos,
            (SELECT count(*)::int FROM bids b JOIN items i ON i.id = b.item_id WHERE i.event_id = $1) AS bids,
            (SELECT count(*)::int FROM purchases p JOIN items i ON i.id = p.item_id WHERE i.event_id = $1) AS purchases,
            (SELECT count(*)::int FROM proofs WHERE event_id = $1) AS proofs`,
    [event.id],
  );
  const c = counts[0]!;
  const unlocksAt = resetUnlocksAt(event.biddingClosesAt);
  return {
    ok: true,
    now: now.toISOString(),
    event: adminEvent(event, now),
    totals: totalsFrom(people, leading),
    pendingProofs: people.filter((p) => p.proof_status === "pending").length,
    activeItems: c.active,
    reset: {
      unlocksAt: iso(unlocksAt), unlocked: unlocksAt !== null && now >= unlocksAt, nextName: nextEventName(event.name),
      counts: { items: c.items, photos: c.photos, bids: c.bids, purchases: c.purchases, proofs: c.proofs },
    },
    demoReset: await justResetIn(tx, event.id),
  };
}

export async function adminPeopleIn(tx: Tx): Promise<AdminPeople | null> {
  const event = await currentEventIn(tx);
  if (!event) return null;
  const now = await dbNow(tx);
  const rows = await peopleMoneyIn(tx, event.id);
  return {
    ok: true,
    now: now.toISOString(),
    phase: phaseOf(event, now),
    proofDeadline: iso(proofDeadlineOf(event)),
    people: rows.map((p) => ({
      id: p.id, firstName: p.first_name, lastName: p.last_name, role: p.role,
      bidCount: Number(p.bid_count), wins: Number(p.wins), purchases: Number(p.purchases),
      totalCents: Number(p.auction) + Number(p.instant),
      proof: p.proof_id
        ? { id: p.proof_id, status: p.proof_status!, amountCents: Number(p.proof_amount), owedCents: Number(p.proof_owed), createdAt: p.proof_at!.toISOString() }
        : null,
    })),
  };
}
