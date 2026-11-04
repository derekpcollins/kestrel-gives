// The seed against real Postgres on the dev branch (SPEC §10, DECISIONS #76). Each test runs
// in a transaction that is rolled back, so dev keeps whatever the last `db:seed` wrote.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { databaseUrl } from "../../scripts/db-target.ts";
import { directUrl } from "../../scripts/migrate-lib.ts";
import { finalizeWinnersIn } from "../../lib/data/winners.ts";
import { PHOTOS_INSTALLED } from "../../lib/seed/data.ts";
import { SEED_PHOTO_KEY } from "../../lib/seed/photos.ts";
import { hasNoEventIn, seedIfEmptyIn, seedIn } from "../../lib/seed/seed.ts";
import { tileText, type Phase } from "../../src/components/item-tile-rules.ts";

const TABLES = ["events", "users", "charities", "items", "item_photos", "bids", "purchases", "proofs", "email_templates"];
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

const count = async (table: string) => (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]!.n;

/** Every row of every app table, in id order, as JSON: two equal dumps mean equal data. */
async function dump(): Promise<string> {
  const parts: string[] = [];
  for (const table of TABLES) {
    const order = table === "email_templates" ? "key" : "id";
    const { rows } = await db.query(`SELECT * FROM ${table} ORDER BY ${order}`);
    parts.push(`${table}: ${JSON.stringify(rows)}`);
  }
  return parts.join("\n");
}

/** The words each tile shows, for one viewer, computed by the tiles' own rules. */
async function tileWords(viewerFirstName: string, phase: Phase): Promise<Map<string, { status?: string; amount: string; detail: string }>> {
  const { rows: [event] } = await db.query<{ opens: Date; closes: Date }>(`SELECT bidding_opens_at AS opens, bidding_closes_at AS closes FROM events WHERE is_current`);
  const { rows } = await db.query<{
    title: string; type: "auction" | "instant"; starting: number | null; price: number | null; remaining: number | null; status: string;
    top: number | null; bids: number; viewer_top: boolean; viewer_bid: boolean;
  }>(
    `SELECT i.title, i.type, i.starting_bid_cents AS starting, i.price_cents AS price, i.remaining, i.status,
            t.amount_cents AS top, (SELECT count(*)::int FROM bids b WHERE b.item_id = i.id AND b.removed_at IS NULL) AS bids,
            COALESCE(t.bidder_id = v.id, false) AS viewer_top,
            EXISTS (SELECT 1 FROM bids b WHERE b.item_id = i.id AND b.bidder_id = v.id AND b.removed_at IS NULL) AS viewer_bid
       FROM items i
       CROSS JOIN (SELECT id FROM users WHERE first_name = $1) v
       LEFT JOIN LATERAL (SELECT amount_cents, bidder_id FROM bids b WHERE b.item_id = i.id AND b.removed_at IS NULL
                           ORDER BY amount_cents DESC, created_at ASC LIMIT 1) t ON true`,
    [viewerFirstName],
  );
  const words = new Map<string, { status?: string; amount: string; detail: string }>();
  for (const r of rows) {
    const text = tileText(
      {
        type: r.type,
        startingBid: r.starting === null ? undefined : r.starting / 100,
        topBid: r.top === null ? undefined : r.top / 100,
        bidCount: r.bids,
        price: r.price === null ? undefined : r.price / 100,
        remaining: r.remaining ?? undefined,
        cancelled: r.status === "cancelled",
        viewerIsTopBidder: r.viewer_top,
        viewerHasBid: r.viewer_bid,
      },
      { phase, now: new Date(), biddingOpens: event!.opens, biddingCloses: event!.closes },
    );
    words.set(r.title, { status: text.status?.label, amount: text.amount, detail: text.detail });
  }
  return words;
}

describe("seed", () => {
  test("seed-if-empty: schema but no event gets seeded; a database with an event is left alone", async () => {
    await db.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
    assert.equal(await hasNoEventIn(db), true);
    assert.equal(await seedIfEmptyIn(db, new Date()), true);
    assert.deepEqual([await count("events"), await count("users"), await count("items"), await count("item_photos")], [1, 7, 16, 26]);

    await db.query(`UPDATE events SET name = 'Kept as it was'`);
    await db.query(`DELETE FROM purchases WHERE id = (SELECT min(id) FROM purchases)`);
    const before = await dump();
    assert.equal(await seedIfEmptyIn(db, new Date()), false);
    assert.equal(await dump(), before);
    assert.equal((await db.query<{ name: string }>(`SELECT name FROM events`)).rows[0]!.name, "Kept as it was");
  });

  test("an event alone counts as not empty, even with every other table empty", async () => {
    await db.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
    await db.query(`INSERT INTO events (name) VALUES ('Someone else''s event')`);
    assert.equal(await seedIfEmptyIn(db, new Date()), false);
    assert.equal(await count("users"), 0);
  });

  test("the seed never writes an absolute URL: item photos are relative keys (DECISIONS #77), logos are committed files", async () => {
    await seedIn(db, new Date());
    const { rows } = await db.query<{ path: string }>(
      `SELECT path FROM item_photos UNION ALL SELECT logo_path FROM charities UNION ALL SELECT image_path FROM proofs`,
    );
    assert.ok(rows.length >= 26 + 3 + 3);
    for (const { path } of rows) {
      assert.doesNotMatch(path, /^([a-z][a-z0-9+.-]*:|\/\/)/i, path);
      assert.ok(path.startsWith("/seed/") || path.startsWith("/brand/charities/") || SEED_PHOTO_KEY.test(path), path);
    }
    const photos = (await db.query<{ path: string }>(`SELECT path FROM item_photos ORDER BY id`)).rows.map((r) => r.path);
    if (PHOTOS_INSTALLED) for (const path of photos) assert.match(path, SEED_PHOTO_KEY);
  });

  test("running the seed twice gives the same result", async () => {
    const now = new Date();
    await seedIn(db, now);
    const first = await dump();
    await db.query(`UPDATE items SET title = 'Changed by a demo visitor' WHERE id = 1`);
    await db.query(`INSERT INTO bids (item_id, bidder_id, amount_cents) VALUES (1, 3, 99900)`);
    await seedIn(db, now);
    assert.equal(await dump(), first);
  });

  test("every SPEC §10 state is present (viewing as Jules), with ending soon and won one Jump away", async () => {
    await seedIn(db, new Date());
    const live = await tileWords("Jules", "live");
    const statuses = [...live.values()].map((w) => w.status);
    assert.ok([...live.values()].some((w) => w.detail === "Starting bid · No bids yet"), "no bids yet");
    assert.ok(statuses.includes("Outbid"), "the current viewer outbid");
    assert.ok(statuses.includes("You're winning"), "the current viewer winning");
    assert.ok(statuses.includes("Sold out"), "sold out");
    assert.ok(statuses.some((s) => /^\d left$/.test(s ?? "")), "low stock");
    assert.ok(statuses.includes("Cancelled"), "cancelled");
    const proofs = (await db.query<{ status: string }>(`SELECT status FROM proofs ORDER BY status`)).rows.map((r) => r.status);
    assert.deepEqual(proofs, ["approved", "pending", "rejected"]);
    assert.ok(!statuses.includes("Ending soon"), "the default demo is calm: bidding closes in about two days");

    // Jump to "Ending soon": bidding closes in under 24 hours.
    await db.query(`UPDATE events SET bidding_closes_at = now() + interval '20 hours'`);
    assert.ok([...(await tileWords("Jules", "live")).values()].some((w) => w.status === "Ending soon"), "ending soon");

    // Jump to "Bidding ended": winners are finalized; Jules won what Jules was winning.
    await db.query(`UPDATE events SET bidding_closes_at = now() - interval '1 hour'`);
    assert.equal(await finalizeWinnersIn(db, (await db.query<{ id: string }>(`SELECT id FROM events`)).rows[0]!.id), true);
    const ended = await tileWords("Jules", "ended");
    assert.equal(ended.get("Guitar lessons, four weeks")?.status, "You won");
    // The approved proof covered only purchases, so finalizing didn't reopen it.
    assert.deepEqual((await db.query<{ status: string }>(`SELECT status FROM proofs ORDER BY status`)).rows.map((r) => r.status), ["approved", "pending", "rejected"]);
  });
});
