// Restore demo data (SPEC §3.1, DECISIONS #80, #81): reseeds every app table and logs the
// run. Shared by the demo bar, the daily cron and (Milestone 3D) the deploy step.
import type { Pool } from "@neondatabase/serverless";
import { withTransaction, type Tx } from "../data/db.ts";
import { seedIn } from "../seed/seed.ts";
import { SCHEMA_LOCK_KEY } from "../data/locks.ts";

export type RestoreSource = "manual" | "cron" | "deploy";

/** Restores refused within this many seconds of the last one (any source). */
export const RESTORE_COOLDOWN_SECONDS = 10;
/** The cron skips if a cron restore ran within this long (Vercel may deliver twice). */
export const CRON_DEDUPE_MINUTES = 60;

/** Reseeds and logs it. No lock or cooldown here: callers own those (the deploy step holds a session lock). */
export async function restoreIn(tx: Tx, source: RestoreSource, now: Date): Promise<void> {
  await seedIn(tx, now);
  await tx.query(`INSERT INTO demo_restores (source, restored_at) VALUES ($1, $2)`, [source, now]);
}

export type RestoreOutcome =
  | { status: "restored" }
  | { status: "busy" } // someone else holds the lock: a restore, a jump or a deploy
  | { status: "cooldown"; retryAfterSeconds: number }
  | { status: "duplicate" }; // the cron already ran within CRON_DEDUPE_MINUTES

/**
 * One restore, as the demo bar or the cron asks for it. The pooled connection runs in
 * transaction mode, where session locks don't hold, so this takes the schema lock for the
 * transaction only (the same key deploy-db uses, so it never races a migration).
 */
export async function tryRestore(pool: Pool, source: "manual" | "cron", now: Date): Promise<RestoreOutcome> {
  return withTransaction(pool, (tx) => tryRestoreIn(tx, source, now));
}

/** tryRestore's work inside a transaction the caller owns (tests roll it back). */
export async function tryRestoreIn(tx: Tx, source: "manual" | "cron", now: Date): Promise<RestoreOutcome> {
  if (!(await tryDemoLockIn(tx))) return { status: "busy" };
  if (source === "cron") {
    const { rows } = await tx.query<{ recent: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM demo_restores WHERE source = 'cron' AND restored_at > $1::timestamptz - make_interval(mins => $2)) AS recent`,
      [now, CRON_DEDUPE_MINUTES],
    );
    if (rows[0]?.recent) return { status: "duplicate" };
  } else {
    const wait = await cooldownLeftIn(tx, now);
    if (wait > 0) return { status: "cooldown", retryAfterSeconds: wait };
  }
  await restoreIn(tx, source, now);
  return { status: "restored" };
}

/** The transaction-level demo lock, shared with migrations. False if someone holds it. */
export async function tryDemoLockIn(tx: Tx): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(`SELECT pg_try_advisory_xact_lock($1) AS ok`, [SCHEMA_LOCK_KEY]);
  return rows[0]?.ok === true;
}

/** Whole seconds until another restore is allowed; 0 if now. */
export async function cooldownLeftIn(tx: Tx, now: Date): Promise<number> {
  const { rows } = await tx.query<{ last: Date | null }>(`SELECT max(restored_at) AS last FROM demo_restores`);
  const last = rows[0]?.last;
  if (!last) return 0;
  const left = RESTORE_COOLDOWN_SECONDS * 1000 - (now.getTime() - last.getTime());
  return left > 0 ? Math.ceil(left / 1000) : 0;
}
