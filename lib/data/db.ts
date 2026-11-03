// Small helpers for the data layer: plain SQL with parameters, no ORM (SPEC §4).
import type { Pool, PoolClient } from "@neondatabase/serverless";

/** A connection inside a transaction. Data functions that end in "In" expect one. */
export type Tx = Pick<PoolClient, "query">;

export async function withTransaction<T>(pool: Pool, work: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Postgres asks for these to be retried: a deadlock (40P01) or a serialization failure (40001). */
const RETRYABLE = new Set(["40P01", "40001"]);

export function isRetryable(error: unknown): boolean {
  return typeof error === "object" && error !== null && RETRYABLE.has(String((error as { code?: unknown }).code));
}

/**
 * withTransaction, retried when Postgres aborts it as a deadlock or serialization failure
 * (DECISIONS #105). For the demo's wide transactions: Restore truncates every app table, so it
 * can deadlock with any request that touches two of them. The work must be safe to run again
 * from the start, which it is, since the aborted attempt was rolled back.
 */
export async function withRetriedTransaction<T>(pool: Pool, work: (tx: Tx) => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await withTransaction(pool, work);
    } catch (error) {
      if (attempt >= attempts || !isRetryable(error)) throw error;
      console.warn(`transaction: retrying after ${(error as { code: string }).code} (attempt ${attempt + 1} of ${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
}

/** Ids come back from Postgres bigint columns as strings; keep them as strings. */
export type Id = string;
