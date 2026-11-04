// The Admin Dashboard's reads and writes (SPEC §7.1, §7.3–7.8, §8; DECISIONS #107–#111). Every
// write runs in the caller's transaction, locks the rows it decides on, and uses the
// database clock. Every path that changes a donation total ends in recheckProofsIn.
import type { Id, Tx } from "./db.ts";
import { currentEventIn, phaseOf, proofDeadlineOf, type CurrentEvent } from "./event.ts";
import { setEventDatesIn } from "./event-dates.ts";
import type { ResolvePhoto } from "./items.ts";
import { donationTotalIn } from "./totals.ts";
import { cancelItemIn, removeBidIn } from "./winners.ts";
import { isTemplateKey, TEMPLATE_DEFAULTS, TEMPLATE_KEYS } from "../email-templates.ts";
import { gapLine, reasonProblem, type AdminRefusal, type AdminRefusalCode } from "../../src/components/admin-rules.ts";
import { checkSettings, nextEventName, resetNameMatches, resetUnlocksAt, toZonedLocal, type SettingsInput, type SettingsProblem } from "../../src/components/settings-rules.ts";
import { templateProblems, type TemplateFields, type TemplateProblem } from "../../src/components/template-rules.ts";
import type {
  AdminBid, AdminEvent, AdminItem, AdminItems, AdminPeople, AdminProof, AdminProofs, AdminSettings, AdminSummary, AdminTemplates, AdminTotals, PersonName,
} from "../../src/admin-api.ts";
import type { ProofStatus } from "../../src/components/proof-rules.ts";

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const n = (v: number | string | null) => (v === null ? null : Number(v));
const refuse = (code: AdminRefusalCode, message: string): AdminRefusal => ({ ok: false, code, message });

async function dbNow(tx: Tx): Promise<Date> {
  const { rows } = await tx.query<{ now: Date }>(`SELECT now() AS now`);
  return rows[0]!.now;
}

function adminEvent(event: CurrentEvent, now: Date): AdminEvent {
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
  const { rows: counts } = await tx.query<{ items: number; earlier: boolean }>(
    `SELECT (SELECT count(*)::int FROM items WHERE event_id = $1 AND status = 'active') AS items,
            EXISTS (SELECT 1 FROM events WHERE id <> $1 AND created_at <= (SELECT created_at FROM events WHERE id = $1)) AS earlier`,
    [event.id],
  );
  const { rows: all } = await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM items WHERE event_id = $1`, [event.id]);
  const unlocksAt = resetUnlocksAt(event.biddingClosesAt);
  return {
    ok: true,
    now: now.toISOString(),
    event: adminEvent(event, now),
    totals: totalsFrom(people, leading),
    pendingProofs: people.filter((p) => p.proof_status === "pending").length,
    activeItems: counts[0]!.items,
    reset: { unlocksAt: iso(unlocksAt), unlocked: unlocksAt !== null && now >= unlocksAt },
    demoReset: counts[0]!.earlier && all[0]!.n === 0,
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

// ---------------------------------------------------------------------------------------------
// Proofs

export async function adminProofsIn(tx: Tx, resolve: ResolvePhoto): Promise<AdminProofs | null> {
  const event = await currentEventIn(tx);
  if (!event) return null;
  const now = await dbNow(tx);
  const { rows } = await tx.query<{
    id: Id; user_id: Id; first_name: string; last_name: string; status: ProofStatus; amount_cents: number; owed_cents: number;
    rejection_reason: string | null; image_path: string; created_at: Date; reviewed_at: Date | null;
    reviewer_id: Id | null; reviewer_first: string | null; reviewer_last: string | null;
  }>(
    `SELECT p.id, p.user_id, u.first_name, u.last_name, p.status, p.amount_cents, p.owed_cents, p.rejection_reason,
            p.image_path, p.created_at, p.reviewed_at, r.id AS reviewer_id, r.first_name AS reviewer_first, r.last_name AS reviewer_last
       FROM (SELECT DISTINCT ON (user_id) * FROM proofs WHERE event_id = $1 ORDER BY user_id, created_at DESC, id DESC) p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN users r ON r.id = p.reviewed_by
      ORDER BY (p.status = 'pending') DESC,
               CASE WHEN p.status = 'pending' THEN p.created_at END ASC,
               p.created_at DESC, p.id DESC`,
    [event.id],
  );
  const proofs: AdminProof[] = [];
  for (const r of rows) {
    const totalCents = await donationTotalIn(tx, event.id, r.user_id);
    proofs.push({
      id: r.id, status: r.status, amountCents: Number(r.amount_cents), owedCents: Number(r.owed_cents), createdAt: r.created_at.toISOString(),
      person: { id: r.user_id, firstName: r.first_name, lastName: r.last_name },
      totalCents, short: Number(r.amount_cents) < totalCents, totalChanged: Number(r.owed_cents) !== totalCents,
      rejectionReason: r.rejection_reason, imageUrl: resolve(r.image_path), reviewedAt: iso(r.reviewed_at),
      reviewer: r.reviewer_id ? { id: r.reviewer_id, firstName: r.reviewer_first!, lastName: r.reviewer_last! } : null,
    });
  }
  return { ok: true, now: now.toISOString(), proofDeadline: iso(proofDeadlineOf(event)), proofs };
}

/**
 * Locks a proof and checks it's the person's latest and still in the status the admin saw
 * (`seenStatus`), so a stale page can't overturn another admin's decision. Reviewed proofs can
 * be reversed (owner, 6C review; DECISIONS #113): approved to rejected, rejected to approved.
 */
async function reviewableProofIn(tx: Tx, proofId: Id, seenStatus: ProofStatus, to: "approved" | "rejected"): Promise<{ eventId: Id; userId: Id; amountCents: number; status: ProofStatus } | AdminRefusal> {
  const event = await currentEventIn(tx);
  if (!event) return refuse("not-found", "There's no current event.");
  const { rows } = await tx.query<{ user_id: Id; status: ProofStatus; amount_cents: number }>(
    `SELECT user_id, status, amount_cents FROM proofs WHERE id = $1 AND event_id = $2 FOR UPDATE`,
    [proofId, event.id],
  );
  const proof = rows[0];
  if (!proof) return refuse("not-found", "That proof doesn't exist.");
  // Lock the person's latest proof too, so an upload can't land between the check and the review.
  const { rows: latest } = await tx.query<{ id: Id }>(
    `SELECT id FROM proofs WHERE event_id = $1 AND user_id = $2 ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
    [event.id, proof.user_id],
  );
  if (latest[0]?.id !== proofId) return refuse("superseded", "They've uploaded a newer proof since. Review that one instead.");
  if (proof.status === to) return refuse("already-reviewed", `That proof is already ${to}.`);
  if (proof.status !== seenStatus) return refuse("already-reviewed", `That proof is ${proof.status === "pending" ? "waiting for review" : proof.status} now.`);
  return { eventId: event.id, userId: proof.user_id, amountCents: Number(proof.amount_cents), status: proof.status };
}

/**
 * Approves a waiting or rejected proof (`seenStatus` is the one the admin saw). `seenTotalCents` is the total the admin was shown: if it has
 * changed since, nothing is approved and the queue reloads. Approving records the current
 * total as the one the proof covers (DECISIONS #111), so it stays approved until the total
 * changes again (§7.6).
 */
export async function approveProofIn(tx: Tx, proofId: Id, adminId: Id, seenTotalCents: number, seenStatus: ProofStatus): Promise<{ ok: true; from: ProofStatus } | AdminRefusal> {
  const proof = await reviewableProofIn(tx, proofId, seenStatus, "approved");
  if ("ok" in proof) return proof;
  const total = await donationTotalIn(tx, proof.eventId, proof.userId);
  if (total !== seenTotalCents) return refuse("total-changed", `Their donation total is now $${(total / 100).toLocaleString("en-US")}. Check the proof again.`);
  await tx.query(
    `UPDATE proofs SET status = 'approved', owed_cents = $3, reviewed_by = $2, reviewed_at = now(), rejection_reason = NULL WHERE id = $1`,
    [proofId, adminId, total],
  );
  return { ok: true, from: proof.status };
}

/**
 * Rejects a waiting or approved proof with a reason the person will see (SPEC §7.6). The total
 * isn't checked: a rejection doesn't depend on it. The approval's covered total (`owed_cents`)
 * is kept, as for any rejection.
 */
export async function rejectProofIn(tx: Tx, proofId: Id, adminId: Id, reason: string, seenStatus: ProofStatus): Promise<{ ok: true; from: ProofStatus } | AdminRefusal> {
  const problem = reasonProblem(reason);
  if (problem) return refuse("invalid", problem);
  const proof = await reviewableProofIn(tx, proofId, seenStatus, "rejected");
  if ("ok" in proof) return proof;
  await tx.query(
    `UPDATE proofs SET status = 'rejected', rejection_reason = $3, reviewed_by = $2, reviewed_at = now() WHERE id = $1`,
    [proofId, adminId, reason.trim()],
  );
  return { ok: true, from: proof.status };
}

// ---------------------------------------------------------------------------------------------
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
      purchases: Number(r.purchases), highBidCents: top ? Number(top.amount_cents) : null, bids,
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

// ---------------------------------------------------------------------------------------------
// Event settings

export async function adminSettingsIn(tx: Tx): Promise<AdminSettings | null> {
  const event = await currentEventIn(tx);
  if (!event) return null;
  const now = await dbNow(tx);
  const local = (d: Date | null) => (d ? toZonedLocal(d, event.timeZone) : "");
  return {
    ok: true,
    now: now.toISOString(),
    values: {
      name: event.name, timeZone: event.timeZone,
      submissionsOpen: local(event.submissionsOpenAt), biddingOpens: local(event.biddingOpensAt), biddingCloses: local(event.biddingClosesAt),
      minStartingBidCents: event.minStartingBidCents, bidIncrementCents: event.bidIncrementCents,
      proofDeadlineDays: event.proofDeadlineDays, givingPlatformUrl: event.givingPlatformUrl ?? "",
    },
  };
}

/**
 * Saves the event settings (SPEC §7.1). Dates arrive as wall times in the chosen zone. New
 * dates go through setEventDatesIn, the same path Jump to uses, so winners are cleared or
 * finalized to match and proofs re-checked.
 */
export async function saveSettingsIn(tx: Tx, input: SettingsInput): Promise<{ ok: true } | AdminRefusal | { ok: false; code: "invalid"; message: string; problems: SettingsProblem[] }> {
  const checked = checkSettings(input);
  if ("problems" in checked) return { ok: false, code: "invalid", message: "Check the highlighted fields.", problems: checked.problems };
  const { rows } = await tx.query<{ id: Id }>(`SELECT id FROM events WHERE is_current FOR UPDATE`);
  const eventId = rows[0]?.id;
  if (!eventId) return refuse("not-found", "There's no current event.");
  const s = checked.settings;
  await tx.query(
    `UPDATE events SET name = $2, time_zone = $3, min_starting_bid_cents = $4, bid_increment_cents = $5,
            proof_deadline_days = $6, giving_platform_url = $7 WHERE id = $1`,
    [eventId, s.name, s.timeZone, s.minStartingBidCents, s.bidIncrementCents, s.proofDeadlineDays, s.givingPlatformUrl],
  );
  await setEventDatesIn(tx, eventId, s.dates, await dbNow(tx));
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Email templates

export async function adminTemplatesIn(tx: Tx): Promise<AdminTemplates> {
  const { rows } = await tx.query<{ key: string; subject: string; body: string; updated_at: Date }>(`SELECT key, subject, body, updated_at FROM email_templates`);
  const stored = new Map(rows.map((r) => [r.key, r]));
  return {
    ok: true,
    templates: TEMPLATE_KEYS.flatMap((key) => {
      const row = stored.get(key);
      if (!row) return [];
      const d = TEMPLATE_DEFAULTS[key];
      return [{
        key, label: d.label, subject: row.subject, body: row.body, variables: [...d.variables],
        isDefault: row.subject === d.subject && row.body === d.body, updatedAt: row.updated_at.toISOString(),
      }];
    }),
  };
}

export async function saveTemplateIn(tx: Tx, key: string, fields: TemplateFields): Promise<{ ok: true } | AdminRefusal | { ok: false; code: "invalid"; message: string; problems: TemplateProblem[] }> {
  if (!isTemplateKey(key)) return refuse("not-found", "That template doesn't exist.");
  const problems = templateProblems(fields, TEMPLATE_DEFAULTS[key].variables);
  if (problems.length) return { ok: false, code: "invalid", message: "Check the highlighted fields.", problems };
  const done = await tx.query(`UPDATE email_templates SET subject = $2, body = $3, updated_at = now() WHERE key = $1`, [key, fields.subject.trim(), fields.body.trim()]);
  if (done.rowCount === 0) return refuse("not-found", "That template doesn't exist.");
  return { ok: true };
}

export async function restoreTemplateIn(tx: Tx, key: string): Promise<{ ok: true } | AdminRefusal> {
  if (!isTemplateKey(key)) return refuse("not-found", "That template doesn't exist.");
  const d = TEMPLATE_DEFAULTS[key];
  const done = await tx.query(`UPDATE email_templates SET subject = $2, body = $3, updated_at = now() WHERE key = $1`, [key, d.subject, d.body]);
  if (done.rowCount === 0) return refuse("not-found", "That template doesn't exist.");
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Reset for next year

export interface ResetDone {
  ok: true;
  eventId: Id;
  eventName: string;
  /** Uploaded files to delete after the commit (lib/api/files.ts keeps to this environment's own). */
  files: string[];
}

/**
 * Reset for next year (SPEC §7.8). The caller holds the demo lock, so it can't race a Restore
 * or a Jump. Locked until 30 days after bidding closes (database clock); the admin types the
 * event's name. Wipes this event's items, photos, bids, purchases and proofs, and every upload
 * record; keeps people, charities, templates and the old event; adds next year's event with
 * the settings copied and no dates, so it starts "Not scheduled yet" (v1.17).
 */
export async function resetYearIn(tx: Tx, typedName: string): Promise<ResetDone | AdminRefusal> {
  const { rows } = await tx.query<{ id: Id; name: string; bidding_closes_at: Date | null }>(
    `SELECT id, name, bidding_closes_at FROM events WHERE is_current FOR UPDATE`,
  );
  const event = rows[0];
  if (!event) return refuse("not-found", "There's no current event.");
  const unlocks = resetUnlocksAt(event.bidding_closes_at);
  const now = await dbNow(tx);
  if (!unlocks || now < unlocks) {
    return refuse("locked", unlocks ? "Reset for next year unlocks 30 days after bidding closes." : "Reset for next year unlocks 30 days after bidding closes, and this event has no close date.");
  }
  if (!resetNameMatches(typedName, event.name)) return refuse("wrong-name", `Type the event's name, ${event.name}, to confirm.`);

  const { rows: files } = await tx.query<{ path: string }>(
    `SELECT pathname AS path FROM uploads
     UNION SELECT p.path FROM item_photos p JOIN items i ON i.id = p.item_id WHERE i.event_id = $1 AND p.source = 'upload'
     UNION SELECT image_path FROM proofs WHERE event_id = $1 AND image_path NOT LIKE '/seed/%'`,
    [event.id],
  );
  await tx.query(`UPDATE items SET winning_bid_id = NULL WHERE event_id = $1 AND winning_bid_id IS NOT NULL`, [event.id]);
  await tx.query(`DELETE FROM proofs WHERE event_id = $1`, [event.id]);
  await tx.query(`DELETE FROM purchases p USING items i WHERE i.id = p.item_id AND i.event_id = $1`, [event.id]);
  await tx.query(`DELETE FROM bids b USING items i WHERE i.id = b.item_id AND i.event_id = $1`, [event.id]);
  await tx.query(`DELETE FROM items WHERE event_id = $1`, [event.id]); // photos cascade
  await tx.query(`DELETE FROM uploads`);
  await tx.query(`UPDATE events SET is_current = false WHERE id = $1`, [event.id]);
  const name = nextEventName(event.name);
  const { rows: added } = await tx.query<{ id: Id }>(
    `INSERT INTO events (name, time_zone, min_starting_bid_cents, bid_increment_cents, proof_deadline_days, giving_platform_url, is_current)
     SELECT $2, time_zone, min_starting_bid_cents, bid_increment_cents, proof_deadline_days, giving_platform_url, true
       FROM events WHERE id = $1
     RETURNING id`,
    [event.id, name],
  );
  return { ok: true, eventId: added[0]!.id, eventName: name, files: files.map((f) => f.path) };
}
