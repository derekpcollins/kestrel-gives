// Uploaded files (DECISIONS #91, #92). A file gets its row before it is written to storage, so
// Restore can always find it; the daily caps are checked in the same transaction. Forms then
// attach files by id: only their own person's, only unused ones, only for the right purpose.
import type { Id, Tx } from "./db.ts";
import { UPLOAD_CAP_LOCK_KEY } from "./locks.ts";
import { uploadPathname } from "../storage/paths.ts";
import { uploadCapRefusal, type UploadPurpose, type UploadType } from "../../src/components/upload-rules.ts";

export type ReserveOutcome = { ok: true; id: Id; pathname: string } | { ok: false; message: string };

/** Checks the caps, counts this upload and records its row; the caller then writes the file. */
export async function reserveUploadIn(
  tx: Tx,
  upload: { userId: Id; purpose: UploadPurpose; type: UploadType; bytes: number; prefix: string },
): Promise<ReserveOutcome> {
  await tx.query(`SELECT pg_advisory_xact_lock($1)`, [UPLOAD_CAP_LOCK_KEY]);
  // Only the last day matters; keep the log small.
  await tx.query(`DELETE FROM upload_log WHERE created_at < now() - interval '2 days'`);
  const { rows } = await tx.query<{ person: number; everyone: number }>(
    `SELECT count(*) FILTER (WHERE user_id = $1)::int AS person, count(*)::int AS everyone
       FROM upload_log WHERE created_at > now() - interval '24 hours'`,
    [upload.userId],
  );
  const refusal = uploadCapRefusal({ person: Number(rows[0]?.person ?? 0), everyone: Number(rows[0]?.everyone ?? 0) });
  if (refusal) return { ok: false, message: refusal };

  await tx.query(`INSERT INTO upload_log (user_id) VALUES ($1)`, [upload.userId]);
  const pathname = uploadPathname(upload.prefix, `${upload.purpose}s`, upload.type);
  const { rows: inserted } = await tx.query<{ id: Id }>(
    `INSERT INTO uploads (user_id, purpose, pathname, content_type, bytes) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [upload.userId, upload.purpose, pathname, upload.type, upload.bytes],
  );
  return { ok: true, id: inserted[0]!.id, pathname };
}

/** Drops the row of a file that couldn't be written (the cap still counts the attempt). */
export async function forgetUploadIn(tx: Tx, id: Id): Promise<void> {
  await tx.query(`DELETE FROM uploads WHERE id = $1 AND attached_at IS NULL`, [id]);
}

/**
 * Marks these uploads as used and returns their pathnames, in the order asked. Null if any
 * isn't this person's, isn't for this purpose, or is already used, so a form can't borrow
 * someone else's file or reuse one.
 */
export async function claimUploadsIn(tx: Tx, userId: Id, ids: readonly Id[], purpose: UploadPurpose): Promise<Map<Id, string> | null> {
  if (ids.length === 0) return new Map();
  if (new Set(ids).size !== ids.length) return null;
  const { rows } = await tx.query<{ id: Id; pathname: string }>(
    `SELECT id, pathname FROM uploads
      WHERE id = ANY($1::bigint[]) AND user_id = $2 AND purpose = $3 AND attached_at IS NULL
      FOR UPDATE`,
    [ids, userId, purpose],
  );
  if (rows.length !== ids.length) return null;
  await tx.query(`UPDATE uploads SET attached_at = now() WHERE id = ANY($1::bigint[])`, [ids]);
  return new Map(rows.map((r) => [r.id, r.pathname]));
}

/** True if anything has been uploaded since the last Restore (so Restore has files to clear). */
export async function hasUploadsIn(tx: Tx): Promise<boolean> {
  const { rows } = await tx.query<{ any: boolean }>(`SELECT EXISTS (SELECT 1 FROM uploads) AS any`);
  return rows[0]?.any === true;
}
