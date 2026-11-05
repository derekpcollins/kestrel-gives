// Seed once per suite, roll back per test (owner, check-speed plan A; DECISIONS entry 133).
// The suite opens one transaction on one connection and seeds it once; each test runs inside a
// savepoint that is rolled back afterwards, so every test still starts from the seed. Reseeding
// costs about 5 s on Neon dev (114 statements at about 42 ms each); a savepoint costs two round trips.
//
// Only for tests that stay on that one connection and never commit. Races, deadlocks, advisory
// lock contention and deploy steps need real connections and commits, so those suites keep
// reseeding with `withTransaction`. A transaction-level advisory lock taken inside a savepoint
// (the demo lock, the upload caps) stays held until the suite's rollback, which is harmless here
// because the database tests run one file at a time and nothing else uses dev meanwhile.
import { after, afterEach, before, beforeEach } from "node:test";
import type { Pool, PoolClient } from "@neondatabase/serverless";
import { seedIn } from "../../lib/seed/seed.ts";

/**
 * Registers the hooks in the current describe. `pool` is read when the suite starts (the file's
 * own `before` makes it). `ready` runs once after the seed; `each` runs at the start of every
 * test, inside its savepoint.
 */
export function seededOnce(
  pool: () => Pool,
  use: (db: PoolClient) => void,
  { ready, each }: { ready?: (db: PoolClient) => Promise<void>; each?: (db: PoolClient) => Promise<void> } = {},
): void {
  let db: PoolClient;
  before(async () => {
    db = await pool().connect();
    use(db);
    await db.query("BEGIN");
    await seedIn(db, new Date());
    if (ready) await ready(db);
  });
  beforeEach(async () => {
    await db.query("SAVEPOINT each_test");
    if (each) await each(db);
  });
  afterEach(async () => {
    // Also clears an aborted state if the test's last statement failed.
    await db.query("ROLLBACK TO SAVEPOINT each_test");
  });
  after(async () => {
    await db.query("ROLLBACK");
    db.release();
  });
}
