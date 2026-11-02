// The schema's rules against real Postgres on the dev branch (SPEC §7, §9, DECISIONS #74).
// Every test runs in a transaction that is rolled back, so dev's data is untouched. Deferred
// constraints are checked before the rollback with SET CONSTRAINTS ALL IMMEDIATE.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { databaseUrl } from "../../scripts/db-target.ts";
import { directUrl } from "../../scripts/migrate-lib.ts";
import { donationTotalIn } from "../../lib/data/totals.ts";
import { cancelItemIn, cancelPurchaseIn, finalizeWinnersIn, removeBidIn } from "../../lib/data/winners.ts";

let pool: Pool;
let db: PoolClient;

before(() => {
  pool = new Pool({ connectionString: directUrl(databaseUrl([])) });
});
after(async () => {
  await pool.end();
});
beforeEach(async () => {
  db = await pool.connect();
  await db.query("BEGIN");
});
afterEach(async () => {
  await db.query("ROLLBACK");
  db.release();
});

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params);
  return rows[0] as T;
}
const id = async (sql: string, params: unknown[] = []) => (await one<{ id: string }>(sql, params)).id;

/** Runs a statement that must fail, inside a savepoint so the test's transaction survives. */
async function rejects(sql: string, params: unknown[], pattern: RegExp): Promise<void> {
  await db.query("SAVEPOINT attempt");
  try {
    await db.query(sql, params);
    await db.query("SET CONSTRAINTS ALL IMMEDIATE");
  } catch (error) {
    await db.query("ROLLBACK TO SAVEPOINT attempt");
    assert.match((error as Error).message, pattern);
    return;
  }
  await db.query("ROLLBACK TO SAVEPOINT attempt");
  assert.fail(`expected the database to reject: ${sql}`);
}

interface World {
  event: string;
  admin: string;
  alice: string;
  bob: string;
  cara: string;
  auction: string;
  instant: string;
}

/** An ended event (closed an hour ago), three bidders, an auction item and an instant item. */
async function world(): Promise<World> {
  const event = await id(
    `INSERT INTO events (name, submissions_open_at, bidding_opens_at, bidding_closes_at, is_current)
     VALUES ('Selftest', now() - interval '10 days', now() - interval '5 days', now() - interval '1 hour', false) RETURNING id`,
  );
  const person = (first: string, role = "employee") =>
    id(`INSERT INTO users (first_name, last_name, role) VALUES ($1, 'Selftest', $2) RETURNING id`, [first, role]);
  const admin = await person("Ada", "admin");
  const alice = await person("Alice");
  const bob = await person("Bob");
  const cara = await person("Cara");
  const auction = await id(
    `INSERT INTO items (event_id, submitter_id, type, title, description, starting_bid_cents)
     VALUES ($1, $2, 'auction', 'Cabin weekend', 'Two nights.', 4000) RETURNING id`,
    [event, cara],
  );
  const instant = await id(
    `INSERT INTO items (event_id, submitter_id, type, title, description, price_cents, quantity, remaining)
     VALUES ($1, $2, 'instant', 'Hot sauce trio', 'Three jars.', 2000, 5, 5) RETURNING id`,
    [event, cara],
  );
  return { event, admin, alice, bob, cara, auction, instant };
}

const bid = (item: string, bidder: string, dollars: number) =>
  id(`INSERT INTO bids (item_id, bidder_id, amount_cents) VALUES ($1, $2, $3) RETURNING id`, [item, bidder, dollars * 100]);
const proof = (w: World, user: string, owedDollars: number, status = "approved") =>
  id(
    `INSERT INTO proofs (event_id, user_id, amount_cents, owed_cents, image_path, status, rejection_reason, reviewed_by, reviewed_at)
     VALUES ($1, $2, $3, $3, 'test/proofs/x.png', $4::text,
             CASE WHEN $4::text = 'rejected' THEN 'The screenshot is cut off.' END,
             $5, CASE WHEN $4::text = 'pending' THEN NULL ELSE now() END) RETURNING id`,
    [w.event, user, owedDollars * 100, status, status === "pending" ? null : w.admin],
  );
const buy = (w: World, buyer: string) =>
  id(`INSERT INTO purchases (item_id, buyer_id, price_cents) VALUES ($1, $2, 2000) RETURNING id`, [w.instant, buyer]);
const proofStatus = async (proofId: string) => (await one<{ status: string }>(`SELECT status FROM proofs WHERE id = $1`, [proofId])).status;
const winnerOf = async (item: string) => (await one<{ winning_bid_id: string | null }>(`SELECT winning_bid_id FROM items WHERE id = $1`, [item])).winning_bid_id;

describe("migrations", () => {
  test("001's placeholder app_meta is gone (003); the app's tables and schema_migrations remain", async () => {
    const row = await one<{ app_meta: string | null; events: string | null; migrations: string | null }>(
      "SELECT to_regclass('public.app_meta') AS app_meta, to_regclass('public.events') AS events, to_regclass('public.schema_migrations') AS migrations",
    );
    assert.equal(row.app_meta, null);
    assert.equal(row.events, "events");
    assert.equal(row.migrations, "schema_migrations");
  });
});

describe("shape", () => {
  test("every timestamp column is timestamptz", async () => {
    const { rows } = await db.query<{ col: string }>(
      `SELECT table_name || '.' || column_name AS col FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'`,
    );
    assert.deepEqual(rows.map((r) => r.col), []);
  });

  test("bids are indexed on (item_id, amount_cents DESC)", async () => {
    const def = await one<{ indexdef: string }>(`SELECT indexdef FROM pg_indexes WHERE indexname = 'bids_item_amount'`);
    assert.match(def.indexdef, /\(item_id, amount_cents DESC\)/);
  });
});

describe("the database rejects bad data", () => {
  test("money that isn't whole dollars, or isn't positive", async () => {
    const w = await world();
    await rejects(`INSERT INTO bids (item_id, bidder_id, amount_cents) VALUES ($1, $2, 4550)`, [w.auction, w.alice], /bids_amount_cents_check/);
    await rejects(`INSERT INTO bids (item_id, bidder_id, amount_cents) VALUES ($1, $2, 0)`, [w.auction, w.alice], /bids_amount_cents_check/);
    await rejects(`UPDATE items SET starting_bid_cents = 1050 WHERE id = $1`, [w.auction], /starting_bid_cents_check/);
    await rejects(`UPDATE items SET price_cents = -100 WHERE id = $1`, [w.instant], /price_cents_check/);
    await rejects(`INSERT INTO proofs (event_id, user_id, amount_cents, owed_cents, image_path) VALUES ($1, $2, 3499, 0, 'x.png')`, [w.event, w.alice], /proofs_amount_cents_check/);
    await rejects(`UPDATE events SET bid_increment_cents = 250 WHERE id = $1`, [w.event], /bid_increment_cents_check/);
  });

  test("stock below zero or above the quantity", async () => {
    const w = await world();
    await rejects(`UPDATE items SET remaining = -1 WHERE id = $1`, [w.instant], /items_remaining_range/);
    await rejects(`UPDATE items SET remaining = 6 WHERE id = $1`, [w.instant], /items_remaining_range/);
  });

  test("columns that don't belong to the sale type", async () => {
    const w = await world();
    await rejects(`UPDATE items SET price_cents = 2000 WHERE id = $1`, [w.auction], /items_auction_columns/);
    await rejects(`UPDATE items SET remaining = NULL WHERE id = $1`, [w.instant], /items_instant_columns/);
  });

  test("a winner on an instant item, or from another item", async () => {
    const w = await world();
    const other = await id(
      `INSERT INTO items (event_id, submitter_id, type, title, description, starting_bid_cents) VALUES ($1, $2, 'auction', 'Other', 'x', 1000) RETURNING id`,
      [w.event, w.cara],
    );
    const elsewhere = await bid(other, w.alice, 20);
    await rejects(`UPDATE items SET winning_bid_id = $2 WHERE id = $1`, [w.instant, elsewhere], /items_winner_auction_only/);
    await rejects(`UPDATE items SET winning_bid_id = $2 WHERE id = $1`, [w.auction, elsewhere], /items_winner_same_item/);
  });

  test("a winner that is a removed bid, even if set in the same transaction", async () => {
    const w = await world();
    const b = await bid(w.auction, w.alice, 50);
    await db.query(`UPDATE bids SET removed_at = now(), removed_by = $2 WHERE id = $1`, [b, w.admin]);
    await rejects(`UPDATE items SET winning_bid_id = $2 WHERE id = $1`, [w.auction, b], /items_winner_not_removed/);
  });

  test("removing the winning bid without moving the winner fails at commit", async () => {
    const w = await world();
    const b = await bid(w.auction, w.alice, 50);
    await db.query(`UPDATE items SET winning_bid_id = $2 WHERE id = $1`, [w.auction, b]);
    await rejects(`UPDATE bids SET removed_at = now(), removed_by = $2 WHERE id = $1`, [b, w.admin], /items_winner_not_removed/);
  });

  test("a removal without who removed it", async () => {
    const w = await world();
    const b = await bid(w.auction, w.alice, 50);
    await rejects(`UPDATE bids SET removed_at = now() WHERE id = $1`, [b], /bids_removed_pair/);
  });

  test("a rejected proof without a reason, or with a blank one", async () => {
    const w = await world();
    const p = await proof(w, w.alice, 50, "pending");
    await rejects(`UPDATE proofs SET status = 'rejected', reviewed_by = $2, reviewed_at = now() WHERE id = $1`, [p, w.admin], /proofs_rejection_reason/);
    await rejects(`UPDATE proofs SET status = 'rejected', rejection_reason = '  ', reviewed_by = $2, reviewed_at = now() WHERE id = $1`, [p, w.admin], /proofs_rejection_reason/);
  });

  test("email template keys outside the six", async () => {
    for (const key of ["bid_receipt", "outbid", "winner", "purchase_receipt", "proof_rejected", "item_cancelled"]) {
      await db.query(`INSERT INTO email_templates (key, subject, body) VALUES ($1, 's', 'b') ON CONFLICT (key) DO NOTHING`, [key]);
    }
    await rejects(`INSERT INTO email_templates (key, subject, body) VALUES ('payment_reminder', 's', 'b')`, [], /email_templates_key_check/);
  });

  test("a sixth photo position, or two photos in one position", async () => {
    const w = await world();
    await db.query(`INSERT INTO item_photos (item_id, position, path, source) VALUES ($1, 1, 'a.jpg', 'seed')`, [w.auction]);
    await rejects(`INSERT INTO item_photos (item_id, position, path, source) VALUES ($1, 6, 'b.jpg', 'seed')`, [w.auction], /item_photos_position_check/);
    await rejects(`INSERT INTO item_photos (item_id, position, path, source) VALUES ($1, 1, 'b.jpg', 'seed')`, [w.auction], /item_photos_position/);
  });

  test("a cancelled item without a cancelled time, and two current events", async () => {
    const w = await world();
    await rejects(`UPDATE items SET status = 'cancelled' WHERE id = $1`, [w.auction], /items_cancelled_at/);
    await db.query(`UPDATE events SET is_current = false`);
    await db.query(`INSERT INTO events (name) VALUES ('This year')`);
    await rejects(`INSERT INTO events (name) VALUES ('Also this year')`, [], /events_one_current/);
  });
});

describe("winners and totals", () => {
  test("winners are finalized once, to the highest bid that isn't removed", async () => {
    const w = await world();
    await bid(w.auction, w.alice, 50);
    const top = await bid(w.auction, w.bob, 60);
    assert.equal(await finalizeWinnersIn(db, w.event), true);
    assert.equal(await finalizeWinnersIn(db, w.event), false);
    assert.equal(await winnerOf(w.auction), top);
    assert.equal(await winnerOf(w.instant), null);
  });

  test("the donation total is winning bids plus non-cancelled purchases", async () => {
    const w = await world();
    await bid(w.auction, w.alice, 60);
    await finalizeWinnersIn(db, w.event);
    await db.query(`INSERT INTO purchases (item_id, buyer_id, price_cents) VALUES ($1, $2, 2000), ($1, $2, 2000)`, [w.instant, w.alice]);
    await db.query(`INSERT INTO purchases (item_id, buyer_id, price_cents, cancelled_at) VALUES ($1, $2, 2000, now())`, [w.instant, w.alice]);
    assert.equal(await donationTotalIn(db, w.event, w.alice), 10_000); // $60 + $20 + $20
    assert.equal(await donationTotalIn(db, w.event, w.bob), 0);
  });

  test("removing the winning bid after close moves the winner, changes both totals and reopens both proofs", async () => {
    const w = await world();
    await bid(w.auction, w.alice, 50);
    const bobsTop = await bid(w.auction, w.bob, 70);
    await db.query(`INSERT INTO purchases (item_id, buyer_id, price_cents) VALUES ($1, $2, 2000)`, [w.instant, w.alice]);
    await finalizeWinnersIn(db, w.event);
    // Before: Bob owes $70 (the auction), Alice owes $20 (one purchase). Both proofs approved.
    assert.equal(await donationTotalIn(db, w.event, w.bob), 7_000);
    assert.equal(await donationTotalIn(db, w.event, w.alice), 2_000);
    const bobsProof = await proof(w, w.bob, 70);
    const alicesProof = await proof(w, w.alice, 20);

    const result = await removeBidIn(db, bobsTop, w.admin);

    const alicesBid = await one<{ id: string }>(`SELECT id FROM bids WHERE item_id = $1 AND bidder_id = $2`, [w.auction, w.alice]);
    assert.equal(result.previousWinner, bobsTop);
    assert.equal(result.winner, alicesBid.id);
    assert.equal(await winnerOf(w.auction), alicesBid.id);
    assert.equal(await donationTotalIn(db, w.event, w.bob), 0); // the old winner's total drops
    assert.equal(await donationTotalIn(db, w.event, w.alice), 7_000); // the new winner's rises: $50 + $20
    assert.equal(await proofStatus(bobsProof), "pending");
    assert.equal(await proofStatus(alicesProof), "pending");
    assert.deepEqual([...result.proofsReopened].sort(), [alicesProof, bobsProof].sort());
    await db.query("SET CONSTRAINTS ALL IMMEDIATE"); // the deferred winner key holds
  });

  test("removing the only bid leaves no winner", async () => {
    const w = await world();
    const only = await bid(w.auction, w.alice, 50);
    await finalizeWinnersIn(db, w.event);
    const result = await removeBidIn(db, only, w.admin);
    assert.equal(result.winner, null);
    assert.equal(await winnerOf(w.auction), null);
    await db.query("SET CONSTRAINTS ALL IMMEDIATE");
  });

  test("removing a losing bid, or a bid while bidding is live, changes no winner and no proof", async () => {
    const w = await world();
    const low = await bid(w.auction, w.alice, 50);
    const top = await bid(w.auction, w.bob, 70);
    await finalizeWinnersIn(db, w.event);
    const bobsProof = await proof(w, w.bob, 70);
    const losing = await removeBidIn(db, low, w.admin);
    assert.equal(losing.winner, top);
    assert.deepEqual(losing.proofsReopened, []);
    assert.equal(await proofStatus(bobsProof), "approved");

    await db.query(`UPDATE events SET winners_finalized_at = NULL, bidding_closes_at = now() + interval '1 day' WHERE id = $1`, [w.event]);
    await db.query(`UPDATE items SET winning_bid_id = NULL WHERE id = $1`, [w.auction]);
    const live = await removeBidIn(db, top, w.admin);
    assert.equal(live.winner, null);
    assert.equal(await winnerOf(w.auction), null);
    await db.query("SET CONSTRAINTS ALL IMMEDIATE");
  });

  test("a changed total reopens only an approved proof; pending stays pending; rejected stays rejected with its reason", async () => {
    const w = await world();
    const people = [w.alice, w.bob, w.cara];
    const purchases = [];
    for (const person of people) purchases.push(await buy(w, person), await buy(w, person));
    const approved = await proof(w, w.alice, 40, "approved");
    const pending = await proof(w, w.bob, 40, "pending");
    const rejected = await proof(w, w.cara, 40, "rejected");
    for (const [i] of people.entries()) await cancelPurchaseIn(db, purchases[i * 2]!);
    assert.equal(await proofStatus(approved), "pending");
    assert.equal(await proofStatus(pending), "pending");
    const r = await one<{ status: string; rejection_reason: string; owed_cents: number }>(
      `SELECT status, rejection_reason, owed_cents FROM proofs WHERE id = $1`, [rejected]);
    assert.deepEqual([r.status, r.rejection_reason], ["rejected", "The screenshot is cut off."]);
    assert.equal(await donationTotalIn(db, w.event, w.cara), 2_000); // the banner's new total; the proof keeps $40 as uploaded
    assert.equal(Number(r.owed_cents), 4_000);
  });

  test("cancelling a purchase after an approved proof lowers the total and sends the proof back to pending", async () => {
    const w = await world();
    const first = await buy(w, w.alice);
    await buy(w, w.alice);
    const approved = await proof(w, w.alice, 40);
    const result = await cancelPurchaseIn(db, first);
    assert.equal(await donationTotalIn(db, w.event, w.alice), 2_000);
    assert.equal(await proofStatus(approved), "pending");
    assert.deepEqual(result.proofsReopened, [approved]);
    const reviewed = await one<{ reviewed_by: string | null; reviewed_at: string | null }>(`SELECT reviewed_by, reviewed_at FROM proofs WHERE id = $1`, [approved]);
    assert.deepEqual([reviewed.reviewed_by, reviewed.reviewed_at], [null, null]);
    await assert.rejects(cancelPurchaseIn(db, first), /already cancelled/);
  });

  test("cancelling an item drops its purchases and winning bid from totals and reopens those approved proofs", async () => {
    const w = await world();
    await bid(w.auction, w.bob, 70);
    await finalizeWinnersIn(db, w.event);
    await buy(w, w.alice);
    const bobs = await proof(w, w.bob, 70);
    const alices = await proof(w, w.alice, 20);
    await cancelItemIn(db, w.auction);
    await cancelItemIn(db, w.instant);
    assert.equal(await donationTotalIn(db, w.event, w.bob), 0);
    assert.equal(await donationTotalIn(db, w.event, w.alice), 0);
    assert.equal(await proofStatus(bobs), "pending");
    assert.equal(await proofStatus(alices), "pending");
    const open = await one<{ n: number }>(`SELECT count(*)::int AS n FROM purchases WHERE item_id = $1 AND cancelled_at IS NULL`, [w.instant]);
    assert.equal(open.n, 0);
  });

  test("finalizing winners reopens an approved proof that covered only purchases", async () => {
    const w = await world();
    await buy(w, w.alice);
    const early = await proof(w, w.alice, 20);
    await bid(w.auction, w.alice, 50);
    await finalizeWinnersIn(db, w.event);
    assert.equal(await donationTotalIn(db, w.event, w.alice), 7_000);
    assert.equal(await proofStatus(early), "pending");
  });

  test("a bid can't be removed twice", async () => {
    const w = await world();
    const b = await bid(w.auction, w.alice, 50);
    await removeBidIn(db, b, w.admin);
    await assert.rejects(removeBidIn(db, b, w.admin), /already removed/);
  });
});
