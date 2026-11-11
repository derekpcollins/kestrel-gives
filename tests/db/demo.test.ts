// Event state and the demo controls against real Postgres on dev (DECISIONS #80, #81). Most
// tests run in a transaction that is rolled back. The concurrency tests must commit, so they
// reseed dev afterwards, leaving it as `db:seed` would.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { databaseUrl } from "../../scripts/db-target.ts";
import { directUrl } from "../../scripts/migrate-lib.ts";
import { appStateIn } from "../../lib/api/app-state.ts";
import { withTransaction } from "../../lib/data/db.ts";
import { currentEventIn, phaseOf } from "../../lib/data/event.ts";
import { donationTotalIn } from "../../lib/data/totals.ts";
import { JUMP_TARGETS, jumpIn, tryJumpIn } from "../../lib/demo/jump.ts";
import { RESTORE_COOLDOWN_SECONDS, cooldownLeftIn, restoreIn, tryDemoLockIn, tryRestoreIn } from "../../lib/demo/restore.ts";
import { CHARITIES } from "../../lib/seed/data.ts";
import { seedIn } from "../../lib/seed/seed.ts";
import { seededOnce } from "./seeded-once.ts";

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
  // Seeded once; each test rolls back to a savepoint (DECISIONS entry 133).
  seededOnce(() => pool, (c) => { db = c; });

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
    await db.query(`UPDATE charities SET logo_path = '/seed/charities/placeholder-logo.png'`); // main before 7B
    const now = new Date();
    // A fixed finish time, so the cooldown below is exact; the real clock is the default (#142).
    assert.deepEqual(await tryRestoreIn(db, "manual", now, () => now), { status: "restored", hadUploads: false });
    assert.equal((await appStateIn(db, null, {}, noCopies)).event?.phase, "live");
    assert.notEqual((await db.query<{ title: string }>(`SELECT title FROM items WHERE id = 1`)).rows[0]!.title, "Changed by a visitor");
    assert.deepEqual((await db.query<{ source: string }>(`SELECT source FROM demo_restores`)).rows, [{ source: "manual" }]);
    // Each charity's own logo (DECISIONS entry 130), from the seed.
    assert.deepEqual((await db.query(`SELECT name, logo_path FROM charities ORDER BY position`)).rows, CHARITIES.map((c) => ({ name: c.name, logo_path: c.logo })));

    const soon = new Date(now.getTime() + 3_000);
    assert.deepEqual(await tryRestoreIn(db, "manual", soon), { status: "cooldown", retryAfterSeconds: RESTORE_COOLDOWN_SECONDS - 3 });
    assert.equal(await cooldownLeftIn(db, new Date(now.getTime() + RESTORE_COOLDOWN_SECONDS * 1000)), 0);
    const clear = new Date(now.getTime() + RESTORE_COOLDOWN_SECONDS * 1000);
    assert.deepEqual(await tryRestoreIn(db, "manual", clear, () => clear), { status: "restored", hadUploads: false });
  });

  test("Event phase: Submissions open clears bids, purchases and proofs with their uploaded files; items, photos and cancellations stay (#124)", async () => {
    await db.query(`DELETE FROM demo_restores`);
    // A proof someone uploaded in this environment, so its file is listed for deleting.
    const person = (await ids(`SELECT id FROM users WHERE first_name = 'Jules'`))[0]!;
    await db.query(
      `INSERT INTO uploads (user_id, purpose, pathname, content_type, bytes, attached_at) VALUES ($1, 'proof', 'local/proofs/jules.png', 'image/png', 10, now())`,
      [person],
    );
    await db.query(`UPDATE proofs SET image_path = 'local/proofs/jules.png' WHERE id = (SELECT min(id) FROM proofs)`);
    await db.query(
      `INSERT INTO uploads (user_id, purpose, pathname, content_type, bytes) VALUES ($1, 'photo', 'local/photos/kept.png', 'image/png', 10)`,
      [person],
    );
    const count = async (table: string) => (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]!.n;
    const before = { items: await count("items"), photos: await count("item_photos"), cancelled: await count("items WHERE status = 'cancelled'") };
    assert.ok((await count("bids")) > 0 && (await count("purchases")) > 0 && (await count("proofs")) > 0, "the seed has activity");

    const now = new Date();
    const outcome = await tryJumpIn(db, "submission", now);
    assert.deepEqual(outcome, { status: "jumped", cleared: true, files: ["local/proofs/jules.png"] });
    assert.equal(phaseOf((await currentEventIn(db))!, now), "submission");
    assert.deepEqual([await count("bids"), await count("purchases"), await count("proofs")], [0, 0, 0]);
    assert.equal(await count("uploads WHERE purpose = 'proof'"), 0);
    assert.equal(await count("uploads WHERE purpose = 'photo'"), 1, "uploaded item photos stay with their items");
    assert.deepEqual({ items: await count("items"), photos: await count("item_photos"), cancelled: await count("items WHERE status = 'cancelled'") }, before);
    assert.equal(await count("items WHERE type = 'instant' AND remaining <> quantity"), 0, "stock is full again");
    assert.equal(await count("items WHERE winning_bid_id IS NOT NULL"), 0);
    assert.equal(await donationTotalIn(db, (await eventRow()).id, person), 0);
    assert.deepEqual((await db.query<{ source: string }>(`SELECT source FROM demo_restores`)).rows, [{ source: "jump" }]);
  });

  test("the clearing jump follows Restore's cooldown both ways; other jumps don't (#124)", async () => {
    await db.query(`DELETE FROM demo_restores`);
    const now = new Date();
    assert.deepEqual(await tryRestoreIn(db, "manual", now, () => now), { status: "restored", hadUploads: false });
    const soon = new Date(now.getTime() + 4_000);
    assert.deepEqual(await tryJumpIn(db, "submission", soon), { status: "cooldown", retryAfterSeconds: RESTORE_COOLDOWN_SECONDS - 4 });
    assert.ok((await ids(`SELECT id FROM bids`)).length > 0, "nothing was cleared");
    assert.deepEqual(await tryJumpIn(db, "ended", soon), { status: "jumped", cleared: false, files: [] });

    const later = new Date(now.getTime() + RESTORE_COOLDOWN_SECONDS * 1000);
    assert.equal((await tryJumpIn(db, "submission", later, () => later)).status, "jumped");
    assert.deepEqual(await tryRestoreIn(db, "manual", new Date(later.getTime() + 2_000)), { status: "cooldown", retryAfterSeconds: RESTORE_COOLDOWN_SECONDS - 2 });
  });

  test("the cooldown counts from when a Restore or clearing jump finished, not when it was asked for (#142)", async () => {
    await db.query(`DELETE FROM demo_restores`);
    const at = (t: Date, seconds: number) => new Date(t.getTime() + seconds * 1000);
    // A Restore asked for at `now` that took 12 seconds: stamped at its finish, with the full cooldown after it.
    const now = new Date();
    assert.deepEqual(await tryRestoreIn(db, "manual", now, () => at(now, 12)), { status: "restored", hadUploads: false });
    assert.equal(await cooldownLeftIn(db, at(now, 12)), RESTORE_COOLDOWN_SECONDS);
    assert.deepEqual(await tryRestoreIn(db, "manual", at(now, 15)), { status: "cooldown", retryAfterSeconds: RESTORE_COOLDOWN_SECONDS - 3 });
    assert.deepEqual(await tryJumpIn(db, "submission", at(now, 15)), { status: "cooldown", retryAfterSeconds: RESTORE_COOLDOWN_SECONDS - 3 });
    // The seed's dates still use the request's time, so the phase is where the request left it.
    assert.equal(phaseOf((await currentEventIn(db))!, now), "live");

    // The clearing jump the same way: asked for once the Restore's cooldown is over, 12 seconds to finish.
    const asked = at(now, 12 + RESTORE_COOLDOWN_SECONDS);
    assert.equal((await tryJumpIn(db, "submission", asked, () => at(asked, 12))).status, "jumped");
    assert.deepEqual(await tryRestoreIn(db, "manual", at(asked, 15)), { status: "cooldown", retryAfterSeconds: RESTORE_COOLDOWN_SECONDS - 3 });
    assert.equal(await cooldownLeftIn(db, at(asked, 12 + RESTORE_COOLDOWN_SECONDS)), 0);
  });

  test("the cron restores once an hour at most; the deploy source is allowed", async () => {
    await db.query(`DELETE FROM demo_restores`);
    const now = new Date();
    assert.deepEqual(await tryRestoreIn(db, "cron", now, () => now), { status: "restored", hadUploads: false });
    assert.deepEqual(await tryRestoreIn(db, "cron", new Date(now.getTime() + 30 * 60_000)), { status: "duplicate" });
    const nextHour = new Date(now.getTime() + 61 * 60_000);
    assert.deepEqual(await tryRestoreIn(db, "cron", nextHour, () => nextHour), { status: "restored", hadUploads: false });
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
      assert.deepEqual(await tryJumpIn(b, "submission", new Date()), { status: "busy" });
      assert.deepEqual(await tryJumpIn(b, "ended", new Date()), { status: "busy" });
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
