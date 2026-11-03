// Uploading donation proof (SPEC §7.6, DECISIONS #95). One combined proof per person per event;
// a new upload adds a row and the latest counts. Each proof records the total it was uploaded
// against (owed_cents), which later re-checks compare with the live total (lib/data/totals.ts).
import type { Id, Tx } from "./db.ts";
import { currentEventIn } from "./event.ts";
import { latestProofIn } from "./me.ts";
import { donationTotalIn } from "./totals.ts";
import { claimUploadsIn } from "./uploads.ts";
import { proofBlock } from "../../src/components/proof-rules.ts";

export type ProofOutcome =
  | { ok: true; proofId: Id; owedCents: number }
  | { ok: false; code: "not-found" | "nothing-owed" | "approved" | "bad-image"; message: string };

export async function submitProofIn(tx: Tx, userId: Id, proof: { amountCents: number; uploadId: Id }): Promise<ProofOutcome> {
  const event = await currentEventIn(tx);
  if (!event) return { ok: false, code: "not-found", message: "There's no current event." };
  // Lock the person's latest proof so two uploads at once can't both pass the check.
  const latest = await latestProofIn(tx, event.id, userId, true);
  const totalCents = await donationTotalIn(tx, event.id, userId);
  const blocked = proofBlock({ totalCents, latest: latest && { status: latest.status, owedCents: latest.owedCents } });
  if (blocked) return { ok: false, ...blocked };

  const claimed = await claimUploadsIn(tx, userId, [proof.uploadId], "proof");
  if (!claimed) return { ok: false, code: "bad-image", message: "That screenshot isn't available. Upload it again." };
  const { rows } = await tx.query<{ id: Id }>(
    `INSERT INTO proofs (event_id, user_id, amount_cents, owed_cents, image_path, created_at)
     VALUES ($1, $2, $3, $4, $5, clock_timestamp()) RETURNING id`,
    [event.id, userId, proof.amountCents, totalCents, claimed.get(proof.uploadId)!],
  );
  return { ok: true, proofId: rows[0]!.id, owedCents: totalCents };
}
