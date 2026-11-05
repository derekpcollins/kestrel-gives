// Bidding, buying and browsing against real Postgres on dev (SPEC §7.4, §7.5, DECISIONS #88).
// Most tests run in a transaction that is rolled back. The simultaneous-request tests must
// commit, so they reseed dev afterwards, leaving it as `db:seed` would.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { databaseUrl } from "../../scripts/db-target.ts";
import { directUrl } from "../../scripts/migrate-lib.ts";
import { itemAnswerIn } from "../../lib/api/item-answer.ts";
import { withTransaction, type Tx } from "../../lib/data/db.ts";
import { listItemsIn } from "../../lib/data/items.ts";
import { buyIn, placeBidIn } from "../../lib/data/sales.ts";
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

const asIs = (path: string) => path;
const one = async <T>(tx: Tx, sql: string, params: unknown[] = []) => (await tx.query(sql, params)).rows[0] as T;
const user = async (tx: Tx, first: string) => (await one<{ id: string }>(tx, `SELECT id FROM users WHERE first_name = $1`, [first])).id;
const item = async (tx: Tx, title: string) => (await one<{ id: string }>(tx, `SELECT id FROM items WHERE title = $1`, [title])).id;
const eventId = async (tx: Tx) => (await one<{ id: string }>(tx, `SELECT id FROM events WHERE is_current`)).id;
const refusal = (o: { ok: boolean; refusal?: { code: string } }) => (o.ok ? "ok" : o.refusal!.code);

describe("bidding and buying (rolled back)", () => {
  // Seeded once; each test rolls back to a savepoint (DECISIONS entry 133).
  seededOnce(() => pool, (c) => { db = c; });

  test("first bid at the starting bid, then high bid + increment; the high bidder can't bid again", async () => {
    const portrait = await item(db, "Custom pet portrait"); // starts at $40, no bids
    const [jules, priya] = [await user(db, "Jules"), await user(db, "Priya")];

    assert.equal(refusal(await placeBidIn(db, { itemId: portrait, bidderId: jules, amountCents: 3_900 })), "too-low");
    assert.equal(refusal(await placeBidIn(db, { itemId: portrait, bidderId: jules, amountCents: 4_000 })), "ok");
    assert.equal(refusal(await placeBidIn(db, { itemId: portrait, bidderId: jules, amountCents: 9_000 })), "high-bidder");

    const low = await placeBidIn(db, { itemId: portrait, bidderId: priya, amountCents: 4_400, seenHighBidCents: 4_000 });
    assert.deepEqual(low, { ok: false, refusal: { code: "too-low", message: "Bids must be at least $45." }, minimumBidCents: 4_500, highBidCents: 4_000 });
    assert.equal(refusal(await placeBidIn(db, { itemId: portrait, bidderId: priya, amountCents: 4_500 })), "ok");

    const answer = (await itemAnswerIn(db, portrait, jules, asIs))!;
    assert.deepEqual(answer.item.bids.map((b) => [b.firstName, b.amountCents, b.isTop]), [["Priya", 4_500, true], ["Jules", 4_000, false]]);
    assert.equal(answer.minimumBidCents, 5_000);
    assert.equal(answer.bidHint, "At least $50. Bids go up by $5.");
    assert.equal(answer.blocked, null, "Jules was outbid, so Jules may bid again");
    assert.equal(answer.item.viewerHasBid && !answer.item.viewerIsTopBidder, true);
  });

  test("bid times come from the database clock, in commit order", async () => {
    const portrait = await item(db, "Custom pet portrait");
    await placeBidIn(db, { itemId: portrait, bidderId: await user(db, "Rosa"), amountCents: 4_000 });
    await placeBidIn(db, { itemId: portrait, bidderId: await user(db, "Owen"), amountCents: 4_500 });
    const { rows } = await db.query<{ created_at: Date; now: Date }>(
      `SELECT created_at, clock_timestamp() AS now FROM bids WHERE item_id = $1 ORDER BY id`, [portrait]);
    assert.ok(rows[0]!.created_at < rows[1]!.created_at && rows[1]!.created_at <= rows[0]!.now);
  });

  test("no bidding on or buying your own item (v1.12); admins otherwise bid and buy", async () => {
    const dev = await user(db, "Dev"); // submitted the pet portrait
    assert.equal(refusal(await placeBidIn(db, { itemId: await item(db, "Custom pet portrait"), bidderId: dev, amountCents: 9_000 })), "own-item");
    assert.equal(refusal(await buyIn(db, { itemId: await item(db, "Banana bread, two loaves"), buyerId: await user(db, "Jules") })), "own-item");
    const maya = await user(db, "Maya"); // admin
    assert.equal(refusal(await placeBidIn(db, { itemId: await item(db, "Custom pet portrait"), bidderId: maya, amountCents: 4_000 })), "ok");
    assert.equal(refusal(await buyIn(db, { itemId: await item(db, "Banana bread, two loaves"), buyerId: maya })), "ok");
    const mine = (await itemAnswerIn(db, await item(db, "Banana bread, two loaves"), await user(db, "Jules"), asIs))!;
    assert.deepEqual(mine.blocked, { code: "own-item", message: "This is your item." });
  });

  test("bidding and buying are blocked before bidding opens and after it closes (§7.1)", async () => {
    const [portrait, scarf, rosa] = [await item(db, "Custom pet portrait"), await item(db, "Hand-knit scarf"), await user(db, "Rosa")];
    await db.query(`UPDATE events SET bidding_opens_at = now() + interval '1 day', bidding_closes_at = now() + interval '3 days'`);
    assert.equal(refusal(await placeBidIn(db, { itemId: portrait, bidderId: rosa, amountCents: 4_000 })), "not-open");
    assert.equal(refusal(await buyIn(db, { itemId: scarf, buyerId: rosa })), "not-open");
    await db.query(`UPDATE events SET bidding_opens_at = now() - interval '3 days', bidding_closes_at = now() - interval '1 minute'`);
    assert.equal(refusal(await placeBidIn(db, { itemId: portrait, bidderId: rosa, amountCents: 4_000 })), "ended");
    assert.equal(refusal(await buyIn(db, { itemId: scarf, buyerId: rosa })), "ended");
    assert.equal((await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM bids WHERE item_id = $1`, [portrait])).n, 0);
  });

  test("cancelled items and the wrong sale type are refused", async () => {
    const rosa = await user(db, "Rosa");
    assert.equal(refusal(await placeBidIn(db, { itemId: await item(db, "Board game night, hosted"), bidderId: rosa, amountCents: 9_000 })), "cancelled");
    assert.equal(refusal(await placeBidIn(db, { itemId: await item(db, "Hand-knit scarf"), bidderId: rosa, amountCents: 9_000 })), "not-found");
    assert.equal(refusal(await buyIn(db, { itemId: await item(db, "Custom pet portrait"), buyerId: rosa })), "not-found");
    assert.equal(refusal(await buyIn(db, { itemId: "999999", buyerId: rosa })), "not-found");
  });

  test("buying takes one unit at a time, again while stock lasts, and stops at sold out (§7.5)", async () => {
    const [plant, priya] = [await item(db, "Desk plant in a hand-glazed pot"), await user(db, "Priya")]; // 5, 2 bought
    const first = await buyIn(db, { itemId: plant, buyerId: priya });
    assert.ok(first.ok && first.remaining === 2 && first.priceCents === 3_000);
    const second = await buyIn(db, { itemId: plant, buyerId: priya });
    assert.ok(second.ok && second.remaining === 1);
    const answer = (await itemAnswerIn(db, plant, priya, asIs))!;
    assert.equal(answer.item.viewerPurchases, 3, "Priya's seeded purchase plus two");
    assert.equal(refusal(await buyIn(db, { itemId: await item(db, "Lemon squares, a dozen"), buyerId: await user(db, "Rosa") })), "sold-out");
  });

  test("a purchase raises the buyer's total, so their approved proof goes back to pending (§7.6)", async () => {
    const dev = await user(db, "Dev"); // approved proof in the seed
    const before = await one<{ id: string; status: string }>(db, `SELECT id, status FROM proofs WHERE user_id = $1`, [dev]);
    assert.equal(before.status, "approved");
    const bought = await buyIn(db, { itemId: await item(db, "Hand-knit scarf"), buyerId: dev });
    assert.ok(bought.ok);
    assert.deepEqual(bought.proofsReopened, [before.id]);
    assert.equal((await one<{ status: string }>(db, `SELECT status FROM proofs WHERE id = $1`, [before.id])).status, "pending");
  });

  test("browse lists: current event, no cancelled items, three sorts", async () => {
    const [event, jules] = [await eventId(db), await user(db, "Jules")];
    const auctions = await listItemsIn(db, event, "auction", "newest", jules, asIs);
    assert.equal(auctions.length, 9, "10 auctions minus the cancelled one");
    assert.ok(!auctions.some((i) => i.title === "Board game night, hosted"));
    assert.equal(auctions[0]!.title, "Weekend dog-sitting", "submitted last");

    const byPrice = await listItemsIn(db, event, "auction", "price", jules, asIs);
    const prices = byPrice.map((i) => i.topBidCents ?? i.startingBidCents!);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
    assert.deepEqual(byPrice.slice(0, 2).map((i) => i.title), ["Pottery class for two", "Bike tune-up at your desk"], "a $30 start, then a $35 top bid");

    const byBids = await listItemsIn(db, event, "auction", "bids", jules, asIs);
    assert.equal(byBids[0]!.title, "Lakeside Cabin Weekend", "six bids");
    const guitar = auctions.find((i) => i.title === "Guitar lessons, four weeks")!;
    const cabin = auctions.find((i) => i.title === "Lakeside Cabin Weekend")!;
    assert.deepEqual([guitar.viewerIsTopBidder, cabin.viewerIsTopBidder, cabin.viewerHasBid, cabin.bidCount], [true, false, true, 6]);

    const instant = await listItemsIn(db, event, "instant", "price", jules, asIs);
    assert.deepEqual(instant.map((i) => i.priceCents), [1_200, 1_500, 2_000, 2_500, 3_000, 4_500]);
    assert.equal(instant.find((i) => i.title === "Lemon squares, a dozen")!.remaining, 0);
    assert.ok(instant.every((i) => i.coverUrl.length > 0));
  });
});

describe("simultaneous bids and purchases (committed; dev is reseeded after)", () => {
  after(async () => {
    await withTransaction(pool, (tx) => seedIn(tx, new Date()));
  });

  test("two bids at once: the first saved wins, the other gets the new minimum (§7.4)", async () => {
    await withTransaction(pool, (tx) => seedIn(tx, new Date()));
    const ids = await withTransaction(pool, async (tx) => ({
      portrait: await item(tx, "Custom pet portrait"), priya: await user(tx, "Priya"), rosa: await user(tx, "Rosa"),
    }));
    const bid = (bidderId: string) =>
      withTransaction(pool, (tx) => placeBidIn(tx, { itemId: ids.portrait, bidderId, amountCents: 4_000, seenHighBidCents: null }));
    const results = await Promise.all([bid(ids.priya), bid(ids.rosa)]);
    const won = results.filter((r) => r.ok);
    const lost = results.filter((r) => !r.ok);
    assert.equal(won.length, 1);
    assert.deepEqual(lost[0], {
      ok: false, refusal: { code: "outbid-race", message: "Someone just bid $40. The minimum is now $45." }, minimumBidCents: 4_500, highBidCents: 4_000,
    });
    const saved = await withTransaction(pool, (tx) => tx.query(`SELECT count(*)::int AS n FROM bids WHERE item_id = $1`, [ids.portrait]));
    assert.equal(saved.rows[0].n, 1);
  });

  test("five buyers at once for the last two units: two succeed and stock stops at zero (§7.5)", async () => {
    await withTransaction(pool, (tx) => seedIn(tx, new Date()));
    const ids = await withTransaction(pool, async (tx) => ({
      sauce: await item(tx, "Homemade hot sauce trio"), // 12, 10 bought: 2 left
      buyers: await Promise.all(["Jules", "Priya", "Rosa", "Owen", "Theo"].map((n) => user(tx, n))),
    }));
    const results = await Promise.all(ids.buyers.map((buyerId) => withTransaction(pool, (tx) => buyIn(tx, { itemId: ids.sauce, buyerId }))));
    assert.deepEqual(results.map(refusal).sort(), ["ok", "ok", "sold-out", "sold-out", "sold-out"]);
    const left = await withTransaction(pool, (tx) => tx.query(
      `SELECT remaining, (SELECT count(*)::int FROM purchases WHERE item_id = $1) AS bought FROM items WHERE id = $1`, [ids.sauce]));
    assert.deepEqual(left.rows[0], { remaining: 0, bought: 12 });
  });
});
