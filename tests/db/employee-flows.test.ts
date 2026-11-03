// Uploads, item writes, proofs and Your Items against real Postgres on dev (SPEC §7.3, §7.6;
// DECISIONS #91–#95). Most tests run in a transaction that is rolled back. The simultaneous
// tests must commit, so they reseed dev and empty the upload log afterwards.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { databaseUrl } from "../../scripts/db-target.ts";
import { directUrl } from "../../scripts/migrate-lib.ts";
import { withTransaction, type Tx } from "../../lib/data/db.ts";
import { createItemIn, deleteItemIn, updateItemIn, type ItemWrite } from "../../lib/data/item-writes.ts";
import { meAnswerIn } from "../../lib/data/me.ts";
import { appStateIn } from "../../lib/api/app-state.ts";
import { startingBidHelp, startingBidTooLow } from "../../src/components/item-form-rules.ts";
import { submitProofIn } from "../../lib/data/proofs.ts";
import { buyIn, placeBidIn } from "../../lib/data/sales.ts";
import { blobOpsUsedIn, recordBlobOpsIn } from "../../lib/data/blob-budget.ts";
import { claimUploadsIn, reserveUploadIn } from "../../lib/data/uploads.ts";
import { cancelItemIn } from "../../lib/data/winners.ts";
import { jumpIn } from "../../lib/demo/jump.ts";
import { tryRestore, tryRestoreIn } from "../../lib/demo/restore.ts";
import type { Storage } from "../../lib/storage/index.ts";
import { seedIn } from "../../lib/seed/seed.ts";
import { UPLOAD_CAPS, UPLOAD_MESSAGES } from "../../src/components/upload-rules.ts";

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
const person = async (tx: Tx, first: string) => {
  const r = await one<{ id: string; role: "admin" | "employee"; last_name: string }>(tx, `SELECT id, role, last_name FROM users WHERE first_name = $1`, [first]);
  return { id: r.id, role: r.role, firstName: first, lastName: r.last_name };
};
const item = async (tx: Tx, title: string) => (await one<{ id: string }>(tx, `SELECT id FROM items WHERE title = $1`, [title])).id;
const reserve = (tx: Tx, userId: string, purpose: "photo" | "proof" = "photo") =>
  reserveUploadIn(tx, { userId, purpose, type: "image/jpeg", bytes: 1234, prefix: "test/" });
const upload = async (tx: Tx, userId: string, purpose: "photo" | "proof" = "photo") => {
  const r = await reserve(tx, userId, purpose);
  assert.ok(r.ok);
  return r.id;
};
const why = (o: { ok: boolean; kind?: string; refusal?: { code: string }; problems?: object; code?: string }) =>
  o.ok ? "ok" : o.kind === "refused" ? o.refusal!.code : o.kind === "invalid" ? `invalid:${Object.keys(o.problems!).join(",")}` : (o.kind ?? o.code!);

const auction = (photos: ItemWrite["photos"]): ItemWrite => ({ type: "auction", title: "Pottery wheel lesson", description: "An hour at the wheel.", startingBidCents: 2_000, photos });

describe("employee flows (rolled back)", () => {
  beforeEach(async () => {
    db = await pool.connect();
    await db.query("BEGIN");
    await seedIn(db, new Date());
    // The log is shared by everything on dev; start each test from an empty day.
    await db.query(`DELETE FROM upload_log`);
  });
  afterEach(async () => {
    await db.query("ROLLBACK");
    db.release();
  });

  describe("uploads and the daily caps (#92)", () => {
    test("a reserved upload gets a row and a pathname under its prefix and folder", async () => {
      const jules = await person(db, "Jules");
      const r = await reserve(db, jules.id, "proof");
      assert.ok(r.ok);
      assert.match(r.pathname, /^test\/proofs\/[0-9a-f-]{36}\.jpg$/);
      const row = await one<{ purpose: string; attached_at: Date | null }>(db, `SELECT purpose, attached_at FROM uploads WHERE id = $1`, [r.id]);
      assert.deepEqual(row, { purpose: "proof", attached_at: null });
    });

    test("one person's cap, then everyone's", async () => {
      const [jules, priya] = [await person(db, "Jules"), await person(db, "Priya")];
      for (let i = 0; i < UPLOAD_CAPS.perPersonPerDay; i++) await upload(db, jules.id);
      assert.deepEqual(await reserve(db, jules.id), { ok: false, code: "upload-cap", message: UPLOAD_MESSAGES.personCap });
      for (let i = UPLOAD_CAPS.perPersonPerDay; i < UPLOAD_CAPS.everyonePerDay; i++) await upload(db, priya.id);
      assert.deepEqual(await reserve(db, (await person(db, "Rosa")).id), { ok: false, code: "upload-cap", message: UPLOAD_MESSAGES.everyoneCap });
    });

    test("the Blob breaker: each put counts, and uploads stop at the environment's budget (#96)", async () => {
      const [jules, priya] = [await person(db, "Jules"), await person(db, "Priya")];
      await db.query(`DELETE FROM blob_ops`);
      const viaBlob = (userId: string, blobStop: number | null) =>
        reserveUploadIn(db, { userId, purpose: "photo", type: "image/jpeg", bytes: 10, prefix: "test/", blobStop });
      assert.ok((await viaBlob(jules.id, 300)).ok);
      assert.equal((await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM blob_ops WHERE kind = 'put'`)).n, 1);
      assert.ok((await viaBlob(jules.id, null)).ok, "local storage isn't counted");
      assert.equal((await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM blob_ops`)).n, 1);

      await recordBlobOpsIn(db, "list", 298);
      assert.equal(await blobOpsUsedIn(db), 299);
      assert.ok((await viaBlob(priya.id, 300)).ok, "the 300th operation is allowed");
      assert.deepEqual(await viaBlob(priya.id, 300), { ok: false, code: "uploads-paused", message: UPLOAD_MESSAGES.paused });
      assert.equal(await blobOpsUsedIn(db), 300, "a refused upload spends nothing");
      assert.ok((await viaBlob(priya.id, null)).ok, "local dev is never paused");
    });

    test("the breaker counts the last 31 days, and Restore keeps the count", async () => {
      await db.query(`DELETE FROM blob_ops`);
      await db.query(`INSERT INTO blob_ops (kind, created_at) VALUES ('put', now() - interval '32 days'), ('put', now() - interval '30 days')`);
      assert.equal(await blobOpsUsedIn(db), 1);
      await db.query(`DELETE FROM demo_restores`);
      assert.equal((await tryRestoreIn(db, "manual", new Date())).status, "restored");
      assert.equal(await blobOpsUsedIn(db), 1);
    });

    test("only the last 24 hours count", async () => {
      const jules = await person(db, "Jules");
      await db.query(`INSERT INTO upload_log (user_id, created_at) SELECT $1, now() - interval '25 hours' FROM generate_series(1, $2)`, [jules.id, UPLOAD_CAPS.everyonePerDay]);
      assert.ok((await reserve(db, jules.id)).ok);
    });

    test("Restore empties uploads but keeps the log, so it can't reset the caps", async () => {
      const jules = await person(db, "Jules");
      await upload(db, jules.id);
      await db.query(`DELETE FROM demo_restores`);
      const restored = await tryRestoreIn(db, "manual", new Date());
      assert.deepEqual(restored, { status: "restored", hadUploads: true });
      assert.equal((await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM uploads`)).n, 0);
      assert.equal((await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM upload_log`)).n, 1);
    });

    test("a form may only use its own person's unused uploads, for the right purpose", async () => {
      const [jules, priya] = [await person(db, "Jules"), await person(db, "Priya")];
      const photo = await upload(db, jules.id);
      const proof = await upload(db, jules.id, "proof");
      assert.equal(await claimUploadsIn(db, priya.id, [photo], "photo"), null, "someone else's");
      assert.equal(await claimUploadsIn(db, jules.id, [proof], "photo"), null, "wrong purpose");
      assert.equal(await claimUploadsIn(db, jules.id, [photo, photo], "photo"), null, "twice in one form");
      assert.equal((await claimUploadsIn(db, jules.id, [photo], "photo"))?.size, 1);
      assert.equal(await claimUploadsIn(db, jules.id, [photo], "photo"), null, "already used");
    });
  });

  describe("submitting (SPEC §7.1, §7.3)", () => {
    test("employees submit in the submission window; during live only admins", async () => {
      const [jules, maya] = [await person(db, "Jules"), await person(db, "Maya")];
      assert.equal(why(await createItemIn(db, jules, auction([{ uploadId: await upload(db, jules.id) }]))), "submissions-closed", "the seed is live");
      const created = await createItemIn(db, maya, auction([{ uploadId: await upload(db, maya.id) }]));
      assert.equal(why(created), "ok");

      await jumpIn(db, "submission", new Date());
      const a = await upload(db, jules.id);
      const b = await upload(db, jules.id);
      const mine = await createItemIn(db, jules, { ...auction([{ uploadId: b }, { uploadId: a }]), title: "  Kayak trip  " });
      assert.ok(mine.ok);
      const saved = await one<{ title: string; submitter_id: string; remaining: number | null }>(db, `SELECT title, submitter_id, remaining FROM items WHERE id = $1`, [mine.itemId]);
      assert.deepEqual(saved, { title: "Kayak trip", submitter_id: jules.id, remaining: null });
      const { rows } = await db.query<{ position: number; source: string; path: string }>(`SELECT position, source, path FROM item_photos WHERE item_id = $1 ORDER BY position`, [mine.itemId]);
      const paths = await db.query<{ id: string; pathname: string }>(`SELECT id, pathname FROM uploads WHERE id = ANY($1::bigint[])`, [[a, b]]);
      const byId = new Map(paths.rows.map((r) => [r.id, r.pathname]));
      assert.deepEqual(rows.map((r) => [r.position, r.source, r.path]), [[1, "upload", byId.get(b)], [2, "upload", byId.get(a)]], "in the order sent; the first is the cover");
    });

    test("field problems come back by field; nothing is saved", async () => {
      const maya = await person(db, "Maya");
      const bad = await createItemIn(db, maya, { type: "instant", title: "", description: "Jam", priceCents: 1_050, quantity: 0, photos: [] });
      assert.equal(why(bad), "invalid:title,price,quantity,photos");
      const low = await createItemIn(db, maya, { ...auction([{ uploadId: await upload(db, maya.id) }]), startingBidCents: 500 });
      assert.deepEqual(low.ok ? null : low, { ok: false, kind: "invalid", problems: { startingBid: "Enter at least $10." } });
    });

    test("the form's hint and the server's minimum always name the same amount", async () => {
      const maya = await person(db, "Maya");
      for (const minCents of [1_000, 3_500]) {
        await db.query(`UPDATE events SET min_starting_bid_cents = $1 WHERE is_current`, [minCents]);
        const shown = (await appStateIn(db, maya.id, {}, () => false)).event!.minStartingBidCents;
        assert.equal(shown, minCents, "/api/app carries the event's minimum");
        const low = await createItemIn(db, maya, { ...auction([{ uploadId: await upload(db, maya.id) }]), startingBidCents: minCents - 100 });
        const refused = low.ok || low.kind !== "invalid" ? null : low.problems.startingBid;
        assert.equal(refused, startingBidTooLow(shown));
        const dollars = `$${(minCents / 100).toLocaleString("en-US")}`;
        assert.ok(startingBidHelp(shown).includes(dollars) && refused!.includes(dollars), `both say ${dollars}`);
        assert.ok((await createItemIn(db, maya, { ...auction([{ uploadId: await upload(db, maya.id) }]), startingBidCents: minCents })).ok, "the minimum itself is fine");
      }
    });

    test("an instant item starts with all its stock; a new item can't borrow existing photos", async () => {
      const maya = await person(db, "Maya");
      const made = await createItemIn(db, maya, { type: "instant", title: "Jam", description: "Three jars.", priceCents: 1_200, quantity: 6, photos: [{ uploadId: await upload(db, maya.id) }] });
      assert.ok(made.ok);
      assert.deepEqual(await one(db, `SELECT quantity, remaining FROM items WHERE id = $1`, [made.itemId]), { quantity: 6, remaining: 6 });
      const seedPhoto = (await one<{ id: string }>(db, `SELECT id FROM item_photos LIMIT 1`)).id;
      assert.equal(why(await createItemIn(db, maya, auction([{ photoId: seedPhoto }]))), "invalid:photos");
    });
  });

  describe("editing and deleting (SPEC §7.3, #94)", () => {
    test("before any bid: everything is editable, including the sale type; stock resets", async () => {
      const dev = await person(db, "Dev");
      const portrait = await item(db, "Custom pet portrait"); // Dev's, no bids
      const keep = (await one<{ id: string }>(db, `SELECT id FROM item_photos WHERE item_id = $1`, [portrait])).id;
      const edited = await updateItemIn(db, dev, portrait, { type: "instant", title: "Pet portrait", description: "Watercolor.", priceCents: 3_000, quantity: 2, photos: [{ photoId: keep }] });
      assert.deepEqual(edited, { ok: true, removedFiles: [] });
      assert.deepEqual(await one(db, `SELECT type, title, starting_bid_cents, price_cents, quantity, remaining FROM items WHERE id = $1`, [portrait]),
        { type: "instant", title: "Pet portrait", starting_bid_cents: null, price_cents: 3_000, quantity: 2, remaining: 2 });
    });

    test("after a bid: type and money stay as stored whatever is sent; title and photos change", async () => {
      const [dev, jules] = [await person(db, "Dev"), await person(db, "Jules")];
      const portrait = await item(db, "Custom pet portrait");
      assert.ok((await placeBidIn(db, { itemId: portrait, bidderId: jules.id, amountCents: 4_000 })).ok);
      const fresh = await upload(db, dev.id);
      const edited = await updateItemIn(db, dev, portrait, { type: "instant", title: "Pet portrait", description: "Oil.", priceCents: 1_000, quantity: 9, photos: [{ uploadId: fresh }] });
      assert.ok(edited.ok);
      assert.deepEqual(edited.removedFiles, [], "the seed photo it dropped is never deleted");
      assert.deepEqual(await one(db, `SELECT type, title, starting_bid_cents, price_cents FROM items WHERE id = $1`, [portrait]),
        { type: "auction", title: "Pet portrait", starting_bid_cents: 4_000, price_cents: null });
    });

    test("a removed uploaded photo is returned for deleting after the commit, and its row goes", async () => {
      const maya = await person(db, "Maya");
      const [a, b] = [await upload(db, maya.id), await upload(db, maya.id)];
      const made = await createItemIn(db, maya, auction([{ uploadId: a }, { uploadId: b }]));
      assert.ok(made.ok);
      const photos = (await db.query<{ id: string; path: string }>(`SELECT id, path FROM item_photos WHERE item_id = $1 ORDER BY position`, [made.itemId])).rows;
      const edited = await updateItemIn(db, maya, made.itemId, auction([{ photoId: photos[1]!.id }]));
      assert.deepEqual(edited, { ok: true, removedFiles: [photos[0]!.path] });
      assert.equal((await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM uploads WHERE pathname = $1`, [photos[0]!.path])).n, 0);
      const other = (await one<{ id: string }>(db, `SELECT id FROM item_photos WHERE item_id <> $1 LIMIT 1`, [made.itemId])).id;
      assert.equal(why(await updateItemIn(db, maya, made.itemId, auction([{ photoId: other }]))), "invalid:photos", "another item's photo");
    });

    test("only the submitter or an admin; nobody edits a cancelled item", async () => {
      const [dev, rosa, maya] = [await person(db, "Dev"), await person(db, "Rosa"), await person(db, "Maya")];
      const portrait = await item(db, "Custom pet portrait");
      const photo = (await one<{ id: string }>(db, `SELECT id FROM item_photos WHERE item_id = $1`, [portrait])).id;
      const same = { ...auction([{ photoId: photo }]), startingBidCents: 4_000 };
      assert.equal(why(await updateItemIn(db, rosa, portrait, same)), "not-yours");
      assert.equal(why(await updateItemIn(db, maya, portrait, same)), "ok");
      await cancelItemIn(db, portrait);
      assert.equal(why(await updateItemIn(db, dev, portrait, same)), "cancelled");
      assert.equal(why(await updateItemIn(db, dev, "999999", same)), "not-found");
    });

    test("delete only with no bids or purchases, counting removed and cancelled ones", async () => {
      const [dev, jules, maya] = [await person(db, "Dev"), await person(db, "Jules"), await person(db, "Maya")];
      const portrait = await item(db, "Custom pet portrait");
      const placed = await placeBidIn(db, { itemId: portrait, bidderId: jules.id, amountCents: 4_000 });
      assert.ok(placed.ok);
      await db.query(`UPDATE bids SET removed_at = now(), removed_by = $2 WHERE id = $1`, [placed.bidId, maya.id]);
      assert.equal(why(await deleteItemIn(db, dev, portrait)), "has-activity");

      const [a] = [await upload(db, maya.id)];
      const made = await createItemIn(db, maya, auction([{ uploadId: a }]));
      assert.ok(made.ok);
      const path = (await one<{ path: string }>(db, `SELECT path FROM item_photos WHERE item_id = $1`, [made.itemId])).path;
      assert.equal(why(await deleteItemIn(db, dev, made.itemId)), "not-yours");
      assert.deepEqual(await deleteItemIn(db, maya, made.itemId), { ok: true, removedFiles: [path] });
      assert.equal((await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM items WHERE id = $1`, [made.itemId])).n, 0);
    });
  });

  describe("proof (SPEC §7.6, #95)", () => {
    test("nothing owed, then a first purchase lets you upload; the total is recorded", async () => {
      const jules = await person(db, "Jules");
      await db.query(`DELETE FROM purchases WHERE buyer_id = $1`, [jules.id]); // start with nothing owed (live: no wins yet)
      const proof = await upload(db, jules.id, "proof");
      assert.equal(why(await submitProofIn(db, jules.id, { amountCents: 1_000, uploadId: proof })), "nothing-owed");
      const scarf = await item(db, "Hand-knit scarf");
      assert.ok((await buyIn(db, { itemId: scarf, buyerId: jules.id })).ok);
      const sent = await submitProofIn(db, jules.id, { amountCents: 1_000, uploadId: proof });
      assert.ok(sent.ok, "less than the total is allowed");
      const saved = await one<{ status: string; amount_cents: number; owed_cents: number }>(db, `SELECT status, amount_cents, owed_cents FROM proofs WHERE id = $1`, [sent.proofId]);
      assert.deepEqual(saved, { status: "pending", amount_cents: 1_000, owed_cents: sent.owedCents });
      assert.ok(sent.owedCents > 1_000);
      assert.equal(why(await submitProofIn(db, jules.id, { amountCents: 1_000, uploadId: proof })), "bad-image", "a screenshot is used once");
    });

    test("an approved proof that matches the total has nothing left to do", async () => {
      const dev = await person(db, "Dev"); // approved, $105, matches
      assert.equal(why(await submitProofIn(db, dev.id, { amountCents: 10_500, uploadId: await upload(db, dev.id, "proof") })), "approved");
    });

    test("a rejected proof may be replaced", async () => {
      const owen = await person(db, "Owen");
      assert.equal(why(await submitProofIn(db, owen.id, { amountCents: 3_500, uploadId: await upload(db, owen.id, "proof") })), "ok");
    });
  });

  describe("Your Items", () => {
    test("bids are winning or outbid while live; won or lost after the close", async () => {
      const [jules, priya] = [await person(db, "Jules"), await person(db, "Priya")];
      const portrait = await item(db, "Custom pet portrait");
      await placeBidIn(db, { itemId: portrait, bidderId: jules.id, amountCents: 4_000 });
      await placeBidIn(db, { itemId: portrait, bidderId: priya.id, amountCents: 4_500 });
      const live = (await meAnswerIn(db, jules, asIs))!;
      assert.deepEqual(live.bids.find((b) => b.itemId === portrait), {
        itemId: portrait, title: "Custom pet portrait", coverUrl: live.bids.find((b) => b.itemId === portrait)!.coverUrl, myTopCents: 4_000, highBidCents: 4_500, standing: "outbid",
      });
      assert.equal((await meAnswerIn(db, priya, asIs))!.bids.find((b) => b.itemId === portrait)!.standing, "winning");

      await jumpIn(db, "ended", new Date());
      const ended = (await meAnswerIn(db, priya, asIs))!;
      assert.equal(ended.bids.find((b) => b.itemId === portrait)!.standing, "won");
      assert.ok(ended.wins.some((w) => w.kind === "won" && w.itemId === portrait && w.amountCents === 4_500));
      assert.equal((await meAnswerIn(db, jules, asIs))!.bids.find((b) => b.itemId === portrait)!.standing, "lost");
      assert.ok(ended.proof.deadline, "the deadline is set once bidding closes");
    });

    test("donated items show lock and delete; cancellations move to their own list", async () => {
      const [dev, jules] = [await person(db, "Dev"), await person(db, "Jules")];
      const portrait = await item(db, "Custom pet portrait");
      const sauce = await item(db, "Homemade hot sauce trio");
      const before = (await meAnswerIn(db, dev, asIs))!;
      assert.deepEqual(before.donated.map((d) => [d.title, d.locked, d.canDelete]).sort(), [["Custom pet portrait", false, true], ["Homemade hot sauce trio", true, false]]);
      assert.deepEqual(before.cancelled, []);

      assert.ok((await buyIn(db, { itemId: sauce, buyerId: jules.id })).ok);
      await cancelItemIn(db, sauce);
      await placeBidIn(db, { itemId: portrait, bidderId: jules.id, amountCents: 4_000 });
      await cancelItemIn(db, portrait);
      const after = (await meAnswerIn(db, jules, asIs))!;
      const mine = after.cancelled.filter((c) => c.itemId === portrait || c.itemId === sauce);
      assert.deepEqual([...new Set(mine.map((c) => `${c.title}: ${c.why}`))].sort(), ["Custom pet portrait: bid", "Homemade hot sauce trio: bought"]);
      assert.ok(mine.every((c) => c.why !== "bought" || c.amountCents! > 0), "a cancelled purchase shows what it cost");
      assert.equal(after.bids.some((b) => b.itemId === portrait), false);
      assert.equal(after.wins.some((w) => w.itemId === sauce), false);
      assert.deepEqual((await meAnswerIn(db, dev, asIs))!.donated, [], "both of Dev's items are cancelled");
    });

    test("the proof view: total, latest, and the changed-total banner", async () => {
      const dev = await person(db, "Dev");
      const view = (await meAnswerIn(db, dev, asIs))!.proof;
      assert.equal(view.totalCents, 10_500);
      assert.equal(view.latest?.status, "approved");
      assert.equal(view.totalChanged, false);
      assert.equal(view.blocked?.code, "approved");
    });
  });
});

describe("simultaneous uploads and edits (committed; dev is reseeded after)", () => {
  after(async () => {
    await withTransaction(pool, async (tx) => {
      await seedIn(tx, new Date());
      await tx.query(`DELETE FROM upload_log`);
    });
  });

  test("uploads at once can't slip past the cap together", async () => {
    const ids = await withTransaction(pool, async (tx) => {
      await seedIn(tx, new Date());
      await tx.query(`DELETE FROM upload_log`);
      const jules = (await person(tx, "Jules")).id;
      await tx.query(`INSERT INTO upload_log (user_id) SELECT $1 FROM generate_series(1, $2)`, [jules, UPLOAD_CAPS.perPersonPerDay - 2]);
      return jules;
    });
    const results = await Promise.all(Array.from({ length: 5 }, () => withTransaction(pool, (tx) => reserve(tx, ids))));
    assert.equal(results.filter((r) => r.ok).length, 2);
    assert.equal(results.filter((r) => !r.ok).length, 3);
  });

  test("Restore and the cron keep working past the breaker, and their lists are counted (#96)", async () => {
    await withTransaction(pool, async (tx) => {
      await tx.query(`DELETE FROM blob_ops`);
      await recordBlobOpsIn(tx, "put", 400); // past Preview's stop of 300
      await tx.query(`DELETE FROM demo_restores`);
    });
    const fakeBlob: Storage = {
      kind: "blob", prefix: "preview/",
      async put() { throw new Error("unused"); },
      async delete() {},
      async clear() { return { files: 4, lists: 2 }; },
    };
    assert.deepEqual(await tryRestore(pool, "cron", new Date(), fakeBlob), { status: "restored", filesCleared: 4 });
    const used = await withTransaction(pool, (tx) => one<{ lists: number }>(tx, `SELECT count(*) FILTER (WHERE kind = 'list')::int AS lists FROM blob_ops`));
    assert.equal(used.lists, 2);
    await withTransaction(pool, (tx) => tx.query(`DELETE FROM blob_ops`));
  });

  test("an edit and a first bid at once: the money either locks or the bid sees the new start", async () => {
    const ids = await withTransaction(pool, async (tx) => {
      await seedIn(tx, new Date());
      const portrait = await item(tx, "Custom pet portrait");
      const photo = (await one<{ id: string }>(tx, `SELECT id FROM item_photos WHERE item_id = $1`, [portrait])).id;
      return { portrait, photo, dev: await person(tx, "Dev"), jules: (await person(tx, "Jules")).id };
    });
    const [edit, bid] = await Promise.all([
      withTransaction(pool, (tx) => updateItemIn(tx, ids.dev, ids.portrait, { ...auction([{ photoId: ids.photo }]), startingBidCents: 6_000 })),
      withTransaction(pool, (tx) => placeBidIn(tx, { itemId: ids.portrait, bidderId: ids.jules, amountCents: 4_000 })),
    ]);
    assert.ok(edit.ok);
    const saved = await withTransaction(pool, (tx) => one<{ starting: number; bids: number }>(tx,
      `SELECT starting_bid_cents AS starting, (SELECT count(*)::int FROM bids WHERE item_id = $1) AS bids FROM items WHERE id = $1`, [ids.portrait]));
    if (bid.ok) assert.deepEqual(saved, { starting: 4_000, bids: 1 }, "the bid landed first, so the starting bid stayed locked");
    else assert.deepEqual([saved, bid.refusal.code], [{ starting: 6_000, bids: 0 }, "too-low"], "the edit landed first");
  });
});
