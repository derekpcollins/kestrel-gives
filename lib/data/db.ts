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

/** Ids come back from Postgres bigint columns as strings; keep them as strings. */
export type Id = string;
