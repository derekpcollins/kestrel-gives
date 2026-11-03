// The app's Blob circuit breaker (DECISIONS #96). Built against Hobby's 2,000 advanced
// operations (put, copy, list) a month and its 30-day lockout; on Pro there is no lockout, so it
// now caps cost as an abuse guard, with the same numbers (owner, v1.15). Each database counts
// its own environment's puts and lists over the last 31 days (at least one billing cycle,
// whatever day it starts), and uploads stop at that environment's share of 75%. Restore and
// the cron keep working past it: they only delete (free) and list (counted).
import type { Tx } from "./db.ts";

export const BLOB_ADVANCED_PER_MONTH = 2_000;
export const BLOB_WINDOW_DAYS = 31;

/** Where uploads stop, per environment: 1,200 + 300 = 1,500, 75% of Hobby's 2,000 (kept on Pro). */
export const BLOB_UPLOAD_STOP: Readonly<Record<string, number>> = { "production/": 1_200, "preview/": 300 };

/** The stop for this storage, or null where nothing is counted (local dev and tests). */
export function blobStopFor(storage: { kind: "blob" | "local"; prefix: string }): number | null {
  return storage.kind === "blob" ? (BLOB_UPLOAD_STOP[storage.prefix] ?? 0) : null;
}

export async function recordBlobOpsIn(tx: Tx, kind: "put" | "list", count = 1): Promise<void> {
  if (count > 0) await tx.query(`INSERT INTO blob_ops (kind) SELECT $1 FROM generate_series(1, $2)`, [kind, count]);
}

export async function blobOpsUsedIn(tx: Tx): Promise<number> {
  await tx.query(`DELETE FROM blob_ops WHERE created_at < now() - make_interval(days => $1)`, [BLOB_WINDOW_DAYS + 1]);
  const { rows } = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM blob_ops WHERE created_at > now() - make_interval(days => $1)`,
    [BLOB_WINDOW_DAYS],
  );
  return Number(rows[0]?.n ?? 0);
}
