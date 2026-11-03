// Event state and the demo controls against real Postgres on dev (DECISIONS #80, #81). Most
// tests run in a transaction that is rolled back. The concurrency tests must commit, so they
// reseed dev afterwards, leaving it as `db:seed` would.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { databaseUrl } from "../../scripts/db-target.ts";
import { directUrl } from "../../scripts/migrate-lib.ts";
import { appStateIn } from "../../lib/api/app-state.ts";
import { withTransaction } from "../../lib/data/db.ts";
import { currentEventIn, phaseOf } from "../../lib/data/event.ts";
import { donationTotalIn } from "../../lib/data/totals.ts";
import { JUMP_TARGETS, jumpIn } from "../../lib/demo/jump.ts";
import { RESTORE_COOLDOWN_SECONDS, cooldownLeftIn, restoreIn, tryDemoLockIn, tryRestoreIn } from "../../lib/demo/restore.ts";
import { seedIn } from "../../lib/seed/seed.ts";

let pool: Pool;
let db: PoolClient;

before(() => {
  pool = new Pool({ connectionString: directUrl(databaseUrl([])) });
});
after(async () => {
  await pool.end();
});

const noCopies = () => false;
const ids = async (sql: string, params: unknown[] = []) => (await db.query<{ id: string }>(sql, params)).rows.map((r) => r.id);
const eventRow = async () =>
  (await db.query<{ id: string; opens: Date; closes: Date; subs: Date; finalized: Date | null }>(
    `SELECT id, bidding_opens_at AS opens, bidding_closes_at AS closes, submissions_open_at AS subs, winners_finalized_at AS finalized FROM events WHERE is_current`,
  )).rows[0]!;

describe("demo controls (rolled back)", () => {
  beforeEach(async () => {
    db = await pool.connect();
    await db.query("BEGIN");
    await seedIn(db, new Date());
  });
  afterEach(async () => {
    await db.query("ROLLBACK");
    db.release();
  });

  test("each jump lands in its phase by the real clock", async () => {
    const expected = { submission: "submission", live: "live", "ending-soon": "live", ended: "ended", after: "ended" } as const;
    for (const target of JUMP_TARGETS) {
      await jumpIn(db, target, new Date());
      const e = await eventRow();
      const now = (await db.query<{ now: Date }>("SELECT now() AS now")).rows[0]!.now;
      assert.equal(phaseOf({ submissionsOpenAt: e.subs, biddingOpensAt: e.opens, biddingClosesAt: e.closes }, now), expected[target], target);
      assert.equal(e.finalized !== null, expected[target] === "ended", `${target}: finalized only once ended`);
    }
  });

  test("jumping to ended sets winners; jumping back clears them and reopens an approved proof whose total dropped", async () => {
    const event = (await eventRow()).id;
    const jules = (await ids(`SELECT id FROM users WHERE first_name = 'Jules'`))[0]!;
    const before = await donationTotalIn(db, event, jules);

    const ended = await jumpIn(db, "ended", new Date());
    assert.deepEqual(ended, { winnersCleared: false, winnersFinalized: true });
    const won = await ids(`SELECT i.id FROM items i JOIN bids b ON b.id = i.winning_bid_id WHERE b.bidder_id = $1 ORDER BY i.id`, [jules]);
    assert.equal(won.length, 2, "Jules wins guitar lessons and dog-sitting");
    const owed = await donationTotalIn(db, event, jules);
    assert.equal(owed, before + 8_500 + 5_000);

    // Jules uploads proof for the full total and it's approved.
    await db.query(
      `INSERT INTO proofs (event_id, user_id, amount_cents, owed_cents, image_path, status, reviewed_by, reviewed_at)
       VALUES ($1, $2, $3, $3, '/seed/proofs/placeholder-proof.png', 'approved', (SELECT id FROM users WHERE first_name = 'Maya'), now())`,
      [event, jules, owed],
    );

    // 30+ days after keeps the winners.
    assert.deepEqual(await jumpIn(db, "after", new Date()), { winnersCleared: false, winnersFinalized: false });
    assert.equal((await ids(`SELECT id FROM items WHERE winning_bid_id IS NOT NULL`)).length > 0, true);

    // Back to ending soon: bidding is open again, so no winners, and the approved proof no longer matches.
    assert.deepEqual(await jumpIn(db, "ending-soon", new Date()), { winnersCleared: true, winnersFinalized: false });
    assert.deepEqual(await ids(`SELECT id FROM items WHERE winning_bid_id IS NOT NULL`), []);
    assert.equal((await eventRow()).finalized, null);
    assert.equal(await donationTotalIn(db, event, jules), before);
    const status = (await db.query<{ status: string }>(`SELECT status FROM proofs WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`, [jules])).rows[0]!.status;
    assert.equal(status, "pending");
    // Dev's seeded approved proof covers purchases only, so it stays approved.
    assert.deepEqual((await db.query<{ status: string }>(`SELECT p.status FROM proofs p JOIN users u ON u.id = p.user_id WHERE u.first_name = 'Dev'`)).rows.map((r) => r.status), ["approved"]);
  });

  test("reading the event after the close finalizes winners once", async () => {
    await db.query(`UPDATE events SET bidding_closes_at = now() - interval '1 minute'`);
    const first = await currentEventIn(db);
    assert.ok(first?.winnersFinalizedAt);
    const second = await currentEventIn(db);
    assert.deepEqual(second?.winnersFinalizedAt, first.winnersFinalizedAt);
  });

  test("app state: Jules by default, the cookie's person otherwise, charities in order, phase from the dates", async () => {
    const state = await appStateIn(db, null, {}, noCopies);
    assert.equal(state.viewer?.firstName, "Jules");
    assert.equal(state.people.length, 7);
    assert.deepEqual(state.charities.map((c) => c.name), ["Lantern Paws", "Lunchbox Brigade", "Saplingworks"]);
    assert.equal(state.event?.phase, "live");
    assert.equal(state.event?.endingSoon, false);
    const maya = state.people.find((p) => p.firstName === "Maya")!;
    assert.equal((await appStateIn(db, maya.id, {}, noCopies)).viewer?.role, "admin");
    await jumpIn(db, "ending-soon", new Date());
    assert.equal((await appStateIn(db, null, {}, noCopies)).event?.endingSoon, true);
  });

  test("restore reseeds everything, logs it, and starts the cooldown", async () => {
    await db.query(`DELETE FROM demo_restores`);
    await jumpIn(db, "after", new Date());
    await db.query(`UPDATE items SET title = 'Changed by a visitor' WHERE id = 1`);
    const now = new Date();
    assert.deepEqual(await tryRestoreIn(db, "manual", now), { status: "restored", hadUploads: false });
    assert.equal((await appStateIn(db, null, {}, noCopies)).event?.phase, "live");
    assert.notEqual((await db.query<{ title: string }>(`SELECT title FROM items WHERE id = 1`)).rows[0]!.title, "Changed by a visitor");
    assert.deepEqual((await db.query<{ source: string }>(`SELECT source FROM demo_restores`)).rows, [{ source: "manual" }]);

    const soon = new Date(now.getTime() + 3_000);
    assert.deepEqual(await tryRestoreIn(db, "manual", soon), { status: "cooldown", retryAfterSeconds: RESTORE_COOLDOWN_SECONDS - 3 });
    assert.equal(await cooldownLeftIn(db, new Date(now.getTime() + RESTORE_COOLDOWN_SECONDS * 1000)), 0);
    assert.deepEqual(await tryRestoreIn(db, "manual", new Date(now.getTime() + RESTORE_COOLDOWN_SECONDS * 1000)), { status: "restored", hadUploads: false });
  });

  test("the cron restores once an hour at most; the deploy source is allowed", async () => {
    await db.query(`DELETE FROM demo_restores`);
    const now = new Date();
    assert.deepEqual(await tryRestoreIn(db, "cron", now), { status: "restored", hadUploads: false });
    assert.deepEqual(await tryRestoreIn(db, "cron", new Date(now.getTime() + 30 * 60_000)), { status: "duplicate" });
    assert.deepEqual(await tryRestoreIn(db, "cron", new Date(now.getTime() + 61 * 60_000)), { status: "restored", hadUploads: false });
    await restoreIn(db, "deploy", new Date());
    await assert.rejects(db.query(`INSERT INTO demo_restores (source) VALUES ('visitor')`));
  });
});

describe("demo controls (committed; dev is reseeded after)", () => {
  after(async () => {
    await withTransaction(pool, (tx) => seedIn(tx, new Date()));
  });

  test("two requests after the close: winners are finalized exactly once, and both see it", async () => {
    await withTransaction(pool, async (tx) => {
      await seedIn(tx, new Date());
      await tx.query(`UPDATE events SET bidding_closes_at = now() - interval '1 minute'`);
    });
    const read = () => withTransaction(pool, (tx) => currentEventIn(tx));
    const [a, b] = await Promise.all([read(), read()]);
    assert.ok(a?.winnersFinalizedAt && b?.winnersFinalizedAt);
    assert.equal(a.winnersFinalizedAt.getTime(), b.winnersFinalizedAt.getTime());
    const c = await pool.connect();
    try {
      const { rows } = await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM items WHERE winning_bid_id IS NOT NULL`);
      assert.equal(rows[0]!.n, 7, "every active auction with a bid has a winner");
    } finally {
      c.release();
    }
  });

  test("while one jump or restore holds the lock, another is refused", async () => {
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await a.query("BEGIN");
      await b.query("BEGIN");
      assert.equal(await tryDemoLockIn(a), true);
      assert.equal(await tryDemoLockIn(b), false);
      assert.deepEqual(await tryRestoreIn(b, "manual", new Date()), { status: "busy" });
      await a.query("ROLLBACK");
      assert.equal(await tryDemoLockIn(b), true, "free again once the first transaction ends");
    } finally {
      await a.query("ROLLBACK").catch(() => {});
      await b.query("ROLLBACK").catch(() => {});
      a.release();
      b.release();
    }
  });
});
