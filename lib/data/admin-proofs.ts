// The Admin Dashboard's proof review queue: reading it, approving and rejecting (SPEC §7.6, §8;
// DECISIONS #109). Split from lib/data/admin.ts; the same rules: the caller's transaction,
// locked rows, the database clock.

import type { Id, Tx } from "./db.ts";
import { currentEventIn, proofDeadlineOf } from "./event.ts";
import type { ResolvePhoto } from "./items.ts";
import { donationTotalIn } from "./totals.ts";
import { reasonProblem, type AdminRefusal } from "../../src/components/admin-rules.ts";
import type { AdminProof, AdminProofs } from "../../src/admin-api.ts";
import type { ProofStatus } from "../../src/components/proof-rules.ts";
import { dbNow, iso, refuse } from "./admin.ts";

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
