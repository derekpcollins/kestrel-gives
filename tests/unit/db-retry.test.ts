// Deadlock retries for the demo's wide transactions (DECISIONS #105).
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import type { Pool } from "@neondatabase/serverless";
import { isRetryable, withRetriedTransaction } from "../../lib/data/db.ts";

/** A pool whose connections record statements; `fail` decides whether an attempt's work throws. */
function fakePool() {
  const log: string[] = [];
  const pool = {
    connect: async () => ({ query: async (sql: string) => { log.push(sql); return { rows: [] }; }, release: () => {} }),
  } as unknown as Pool;
  return { pool, log };
}
const pgError = (code: string) => Object.assign(new Error("db"), { code });

describe("withRetriedTransaction", () => {
  test("only deadlocks and serialization failures are retried", () => {
    assert.equal(isRetryable(pgError("40P01")), true);
    assert.equal(isRetryable(pgError("40001")), true);
    assert.equal(isRetryable(pgError("23505")), false);
    assert.equal(isRetryable(new Error("plain")), false);
    assert.equal(isRetryable(null), false);
  });

  test("a deadlock is rolled back and the work runs again from the start", async () => {
    const { pool, log } = fakePool();
    let runs = 0;
    const result = await withRetriedTransaction(pool, async () => {
      runs += 1;
      if (runs === 1) throw pgError("40P01");
      return "done";
    });
    assert.equal(result, "done");
    assert.equal(runs, 2);
    assert.deepEqual(log, ["BEGIN", "ROLLBACK", "BEGIN", "COMMIT"]);
  });

  test("other errors aren't retried, and retries stop after the last attempt", async () => {
    const { pool } = fakePool();
    let runs = 0;
    await assert.rejects(withRetriedTransaction(pool, async () => { runs += 1; throw pgError("23505"); }), { code: "23505" });
    assert.equal(runs, 1);
    runs = 0;
    await assert.rejects(withRetriedTransaction(pool, async () => { runs += 1; throw pgError("40P01"); }, 3), { code: "40P01" });
    assert.equal(runs, 3);
  });
});
