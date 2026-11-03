// The Admin Dashboard's data layer against real Postgres on dev (SPEC §7.1, §7.3–7.8, §8;
// DECISIONS #107–#111). Each test reseeds inside a transaction that is rolled back. Totals are
// checked against independent SQL and against each person's donationTotalIn.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { databaseUrl } from "../../scripts/db-target.ts";
import { directUrl } from "../../scripts/migrate-lib.ts";
import type { Tx } from "../../lib/data/db.ts";
import {
  adminCancelItemIn, adminItemsIn, adminPeopleIn, adminProofsIn, adminRemoveBidIn, adminSettingsIn, adminSummaryIn, adminTemplatesIn,
  approveProofIn, rejectProofIn, resetYearIn, restoreTemplateIn, saveSettingsIn, saveTemplateIn,
} from "../../lib/data/admin.ts";
import { currentEventIn, phaseOf } from "../../lib/data/event.ts";
import { createItemIn } from "../../lib/data/item-writes.ts";
import { proofViewIn } from "../../lib/data/me.ts";
import { donationTotalIn } from "../../lib/data/totals.ts";
import { reserveUploadIn } from "../../lib/data/uploads.ts";
import { jumpIn } from "../../lib/demo/jump.ts";
import { restoreIn } from "../../lib/demo/restore.ts";
import { seedIn } from "../../lib/seed/seed.ts";
import { TEMPLATE_DEFAULTS } from "../../lib/email-templates.ts";
import type { SettingsInput } from "../../src/components/settings-rules.ts";

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
const userId = async (tx: Tx, first: string) => (await one<{ id: string }>(tx, `SELECT id FROM users WHERE first_name = $1`, [first])).id;
const itemId = async (tx: Tx, title: string) => (await one<{ id: string }>(tx, `SELECT id FROM items WHERE title = $1`, [title])).id;
const latestProofId = async (tx: Tx, first: string) =>
  (await one<{ id: string }>(tx, `SELECT p.id FROM proofs p JOIN users u ON u.id = p.user_id WHERE u.first_name = $1 ORDER BY p.created_at DESC, p.id DESC LIMIT 1`, [first])).id;
const winningBid = async (tx: Tx, title: string) =>
  (await one<{ id: string; first_name: string }>(tx, `SELECT b.id, u.first_name FROM items i JOIN bids b ON b.id = i.winning_bid_id JOIN users u ON u.id = b.bidder_id WHERE i.title = $1`, [title]));
const summary = async (tx: Tx) => (await adminSummaryIn(tx))!;

/** Pledged by sale type, straight from the tables (not through lib/data/admin.ts). */
async function pledgedSql(tx: Tx): Promise<{ auction: number; instant: number }> {
  const r = await one<{ auction: string; instant: string }>(
    tx,
    `SELECT COALESCE((SELECT sum(b.amount_cents) FROM items i JOIN bids b ON b.id = i.winning_bid_id JOIN events e ON e.id = i.event_id
                       WHERE e.is_current AND i.status = 'active'), 0) AS auction,
            COALESCE((SELECT sum(p.price_cents) FROM purchases p JOIN items i ON i.id = p.item_id JOIN events e ON e.id = i.event_id
                       WHERE e.is_current AND p.cancelled_at IS NULL), 0) AS instant`,
  );
  return { auction: Number(r.auction), instant: Number(r.instant) };
}

async function everyonesTotal(tx: Tx): Promise<number> {
  const event = (await currentEventIn(tx))!;
  const { rows } = await tx.query<{ id: string }>(`SELECT id FROM users`);
  let sum = 0;
  for (const u of rows) sum += await donationTotalIn(tx, event.id, u.id);
  return sum;
}

describe("admin (rolled back)", () => {
  let maya: string;
  beforeEach(async () => {
    db = await pool.connect();
    await db.query("BEGIN");
    await seedIn(db, new Date());
    maya = await userId(db, "Maya");
  });
  afterEach(async () => {
    await db.query("ROLLBACK");
    db.release();
  });

  describe("totals (DECISIONS #107)", () => {
    test("live: no winners yet, purchases pledged, Dev's approved proof confirmed; leading bids shown", async () => {
      const s = await summary(db);
      const sql = await pledgedSql(db);
      assert.equal(s.event.phase, "live");
      assert.deepEqual(s.totals.pledged, { auctionCents: sql.auction, instantCents: sql.instant, grandCents: sql.auction + sql.instant });
      assert.deepEqual(s.totals.pledged, { auctionCents: 0, instantCents: 51_500, grandCents: 51_500 });
      assert.equal(s.totals.pledged.grandCents, await everyonesTotal(db));
      assert.deepEqual(s.totals.confirmed, { auctionCents: 0, instantCents: 10_500, grandCents: 10_500 });
      assert.equal(s.totals.gapLine, "Approved proofs: $105 against $105 owed by that person, an exact match.");
      assert.equal(s.totals.leadingBidsCents, 57_500, "the high bid on each active auction item, the cancelled one left out");
      assert.equal(s.pendingProofs, 1);
      assert.equal(s.activeItems, 15);
      assert.equal(s.reset.unlocked, false);
      assert.equal(s.demoReset, false);
    });

    test("ended: winning bids join pledged, and still equal everyone's donation totals", async () => {
      await jumpIn(db, "ended", new Date());
      const s = await summary(db);
      const sql = await pledgedSql(db);
      assert.equal(s.totals.pledged.auctionCents, sql.auction);
      assert.equal(s.totals.pledged.auctionCents, 57_500);
      assert.equal(s.totals.pledged.grandCents, await everyonesTotal(db));
      assert.equal(s.totals.leadingBidsCents, null);
    });

    test("approving a short proof: covered totals by sale type, approved amounts in the grand figure, and the gap", async () => {
      const rosa = await latestProofId(db, "Rosa"); // owes $65 (hot sauce twice, candles), uploaded $60
      assert.deepEqual(await approveProofIn(db, rosa, maya, 6_500), { ok: true });
      const s = await summary(db);
      assert.deepEqual(s.totals.confirmed, { auctionCents: 0, instantCents: 17_000, grandCents: 16_500 });
      assert.equal(s.totals.approvedOwedCents, 17_000);
      assert.equal(s.totals.gapLine, "Approved proofs: $165 against $170 owed by those people, $5 short.");
      assert.equal(s.pendingProofs, 0);
    });

    test("people: counts, totals and latest proof, matching donationTotalIn", async () => {
      await jumpIn(db, "ended", new Date());
      const { people } = (await adminPeopleIn(db))!;
      const event = (await currentEventIn(db))!;
      for (const p of people) assert.equal(p.totalCents, await donationTotalIn(db, event.id, p.id), p.firstName);
      const jules = people.find((p) => p.firstName === "Jules")!;
      assert.deepEqual({ wins: jules.wins, purchases: jules.purchases, total: jules.totalCents, proof: jules.proof }, { wins: 2, purchases: 5, total: 13_500 + 12_500, proof: null });
      assert.equal(people.find((p) => p.firstName === "Owen")!.proof?.status, "rejected");
      assert.equal(people.length, 7, "admins bid and buy too, so they're listed");
    });
  });

  describe("proof review (SPEC §7.6)", () => {
    test("the queue: each person's latest proof, pending first, with the current total and short flag", async () => {
      const { proofs } = (await adminProofsIn(db, asIs))!;
      assert.deepEqual(proofs.map((p) => [p.person.firstName, p.status]), [["Rosa", "pending"], ["Dev", "approved"], ["Owen", "rejected"]]);
      const rosa = proofs[0]!;
      assert.deepEqual({ total: rosa.totalCents, amount: rosa.amountCents, short: rosa.short, changed: rosa.totalChanged }, { total: 6_500, amount: 6_000, short: true, changed: false });
      assert.equal(proofs[1]!.reviewer?.firstName, "Maya");
    });

    test("approve refuses a changed total, a reviewed proof and a superseded one", async () => {
      const rosa = await latestProofId(db, "Rosa");
      assert.equal((await approveProofIn(db, rosa, maya, 9_900) as { code: string }).code, "total-changed");
      assert.equal((await approveProofIn(db, await latestProofId(db, "Dev"), maya, 10_500) as { code: string }).code, "already-reviewed");
      await db.query(`INSERT INTO proofs (event_id, user_id, amount_cents, owed_cents, image_path, created_at)
                      SELECT event_id, user_id, 6500, 6500, image_path, created_at + interval '1 minute' FROM proofs WHERE id = $1`, [rosa]);
      assert.equal((await approveProofIn(db, rosa, maya, 6_500) as { code: string }).code, "superseded");
      assert.equal((await approveProofIn(db, "999999999", maya, 6_500) as { code: string }).code, "not-found");
    });

    test("approving records the total it covers, so the person sees it approved after a change while pending", async () => {
      await adminCancelItemIn(db, await itemId(db, "Hand-poured candles, set of three")); // Rosa: $65 → $40
      const rosa = await latestProofId(db, "Rosa");
      assert.deepEqual(await approveProofIn(db, rosa, maya, 4_000), { ok: true });
      const row = await one<{ status: string; owed_cents: number; reviewed_by: string }>(db, `SELECT status, owed_cents, reviewed_by FROM proofs WHERE id = $1`, [rosa]);
      assert.deepEqual(row, { status: "approved", owed_cents: 4_000, reviewed_by: maya });
      const view = await proofViewIn(db, (await currentEventIn(db))!, await userId(db, "Rosa"), asIs);
      assert.equal(view.blocked?.code, "approved");
      assert.equal(view.totalChanged, false);
    });

    test("reject needs a reason, which the person sees", async () => {
      const rosa = await latestProofId(db, "Rosa");
      assert.equal((await rejectProofIn(db, rosa, maya, "   ") as { code: string }).code, "invalid");
      assert.deepEqual(await rejectProofIn(db, rosa, maya, "  The amount is cut off.  "), { ok: true });
      const view = await proofViewIn(db, (await currentEventIn(db))!, await userId(db, "Rosa"), asIs);
      assert.deepEqual([view.latest?.status, view.latest?.rejectionReason], ["rejected", "The amount is cut off."]);
      assert.equal((await rejectProofIn(db, rosa, maya, "again") as { code: string }).code, "already-reviewed");
    });
  });

  describe("items: remove bid and cancel, before and after the close (DECISIONS #110)", () => {
    test("remove the winning bid after close: the next bid wins, totals and proofs follow", async () => {
      await jumpIn(db, "ended", new Date());
      const cabin = await winningBid(db, "Lakeside Cabin Weekend");
      assert.equal(cabin.first_name, "Priya");
      // Give Priya an approved proof for her total, so the removal re-opens it.
      const event = (await currentEventIn(db))!;
      const priya = await userId(db, "Priya");
      const owed = await donationTotalIn(db, event.id, priya);
      await db.query(`INSERT INTO proofs (event_id, user_id, amount_cents, owed_cents, image_path, status, reviewed_by, reviewed_at)
                      VALUES ($1, $2, $3, $3, '/seed/proofs/placeholder-proof.png', 'approved', $4, now())`, [event.id, priya, owed, maya]);
      const before = await summary(db);

      const r = await adminRemoveBidIn(db, cabin.id, maya);
      assert.ok(r.ok);
      assert.equal(r.proofsReopened.length, 1);
      assert.equal((await winningBid(db, "Lakeside Cabin Weekend")).first_name, "Owen");
      const after = await summary(db);
      assert.equal(after.totals.pledged.auctionCents, before.totals.pledged.auctionCents - 24_000 + 22_000);
      assert.equal(after.totals.pledged.grandCents, await everyonesTotal(db));
      assert.equal(after.totals.confirmed.grandCents, before.totals.confirmed.grandCents - owed, "Priya's proof went back to pending");

      const item = (await adminItemsIn(db))!.items.find((i) => i.title === "Lakeside Cabin Weekend")!;
      const removed = item.bids.find((b) => b.id === cabin.id)!;
      assert.deepEqual([removed.removedBy?.firstName, removed.isTop], ["Maya", false]);
      assert.equal(item.bids.find((b) => b.isTop)?.bidder.firstName, "Owen");
      assert.equal(item.highBidCents, 22_000);
      assert.equal((await adminRemoveBidIn(db, cabin.id, maya) as { code: string }).code, "already-removed");
    });

    test("remove a bid while live: the high bid recalculates; a cancelled item's bids are refused", async () => {
      const top = await one<{ id: string }>(db, `SELECT b.id FROM bids b JOIN items i ON i.id = b.item_id WHERE i.title = 'Guitar lessons, four weeks' ORDER BY b.amount_cents DESC LIMIT 1`);
      assert.ok((await adminRemoveBidIn(db, top.id, maya)).ok);
      assert.equal((await adminItemsIn(db))!.items.find((i) => i.title === "Guitar lessons, four weeks")!.highBidCents, 7_000);
      const board = await one<{ id: string }>(db, `SELECT b.id FROM bids b JOIN items i ON i.id = b.item_id WHERE i.title = 'Board game night, hosted' LIMIT 1`);
      assert.equal((await adminRemoveBidIn(db, board.id, maya) as { code: string }).code, "cancelled");
    });

    test("cancel after close: purchases cancelled, totals drop, an approved proof goes back to pending", async () => {
      await jumpIn(db, "ended", new Date());
      const lemon = await itemId(db, "Lemon squares, a dozen"); // Dev bought two
      const r = await adminCancelItemIn(db, lemon);
      assert.ok(r.ok);
      assert.equal(r.proofsReopened.length, 1);
      const s = await summary(db);
      assert.equal(s.totals.pledged.instantCents, 51_500 - 9_000);
      assert.equal(s.totals.confirmed.grandCents, 0);
      assert.equal(s.totals.gapLine, null);
      assert.equal((await adminCancelItemIn(db, lemon) as { code: string }).code, "cancelled");
      const listed = (await adminItemsIn(db))!.items.find((i) => i.id === lemon)!;
      assert.deepEqual([listed.cancelled, listed.purchases], [true, 0]);
    });
  });

  describe("event settings (SPEC §7.1)", () => {
    const values = async () => (await adminSettingsIn(db))!.values;

    test("dates come back as wall times in the event's zone and save back to the same instants", async () => {
      const v = await values();
      assert.match(v.biddingCloses, /^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
      const event = (await currentEventIn(db))!;
      assert.deepEqual(await saveSettingsIn(db, v), { ok: true });
      assert.equal((await currentEventIn(db))!.biddingClosesAt?.toISOString(), event.biddingClosesAt?.toISOString());
    });

    test("saving new settings: money, days, address, name and a later close", async () => {
      const v: SettingsInput = { ...(await values()), name: "Kestrel Gives 2026 (fall)", minStartingBidCents: 2_000, bidIncrementCents: 1_000, proofDeadlineDays: 10, givingPlatformUrl: "https://give.example.org/kestrel" };
      assert.deepEqual(await saveSettingsIn(db, v), { ok: true });
      const e = (await currentEventIn(db))!;
      assert.deepEqual([e.name, e.minStartingBidCents, e.bidIncrementCents, e.proofDeadlineDays, e.givingPlatformUrl], ["Kestrel Gives 2026 (fall)", 2_000, 1_000, 10, "https://give.example.org/kestrel"]);
    });

    test("closing bidding through settings finalizes winners; clearing the dates clears them and the phase is Not scheduled yet", async () => {
      const v = await values();
      const ended: SettingsInput = { ...v, submissionsOpen: "2026-01-01T09:00", biddingOpens: "2026-01-10T09:00", biddingCloses: "2026-01-12T09:00" };
      assert.deepEqual(await saveSettingsIn(db, ended), { ok: true });
      assert.ok((await currentEventIn(db))!.winnersFinalizedAt);
      assert.equal((await winningBid(db, "Guitar lessons, four weeks")).first_name, "Jules");
      assert.deepEqual(await saveSettingsIn(db, { ...v, submissionsOpen: "", biddingOpens: "", biddingCloses: "" }), { ok: true });
      const e = (await currentEventIn(db))!;
      assert.equal(e.winnersFinalizedAt, null);
      assert.equal(phaseOf(e, new Date()), "unscheduled");
      assert.equal((await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM items WHERE winning_bid_id IS NOT NULL`)).n, 0);
    });

    test("bad settings save nothing and say why, by field", async () => {
      const r = await saveSettingsIn(db, { ...(await values()), biddingCloses: "", proofDeadlineDays: 0 });
      assert.ok(!r.ok && "problems" in r);
      assert.deepEqual(r.problems.map((p) => p.field).sort(), ["biddingCloses", "proofDeadlineDays"]);
      assert.ok(r.problems.some((p) => p.field === "biddingCloses"));
      assert.ok(r.problems.some((p) => p.field === "proofDeadlineDays"));
    });
  });

  describe("email templates (SPEC §7.7)", () => {
    test("six, all defaults; save, then Restore default", async () => {
      const list = (await adminTemplatesIn(db)).templates;
      assert.equal(list.length, 6);
      assert.ok(list.every((t) => t.isDefault));
      assert.deepEqual(await saveTemplateIn(db, "outbid", { subject: "Outbid on {{item_name}}", body: "Hi {{first_name}}, someone bid {{amount}}." }), { ok: true });
      assert.equal((await adminTemplatesIn(db)).templates.find((t) => t.key === "outbid")!.isDefault, false);
      assert.deepEqual(await restoreTemplateIn(db, "outbid"), { ok: true });
      const back = (await adminTemplatesIn(db)).templates.find((t) => t.key === "outbid")!;
      assert.deepEqual([back.subject, back.isDefault], [TEMPLATE_DEFAULTS.outbid.subject, true]);
    });

    test("an unknown or unoffered variable blocks saving; an unknown template is not found", async () => {
      const r = await saveTemplateIn(db, "outbid", { subject: "Hi {{fist_name}}", body: "{{rejection_reason}}" });
      assert.ok(!r.ok && "problems" in r);
      assert.deepEqual(r.problems.map((p) => p.field), ["subject", "body"]);
      assert.equal((await adminTemplatesIn(db)).templates.find((t) => t.key === "outbid")!.isDefault, true, "nothing saved");
      assert.equal((await saveTemplateIn(db, "newsletter", { subject: "x", body: "y" }) as { code: string }).code, "not-found");
      assert.equal((await restoreTemplateIn(db, "newsletter") as { code: string }).code, "not-found");
    });
  });

  describe("Reset for next year (SPEC §7.8, v1.17)", () => {
    test("locked until 30 days after close; the typed name must match", async () => {
      assert.equal((await resetYearIn(db, "Kestrel Gives 2026") as { code: string }).code, "locked");
      await jumpIn(db, "ended", new Date());
      assert.equal((await resetYearIn(db, "Kestrel Gives 2026") as { code: string }).code, "locked");
      await jumpIn(db, "after", new Date());
      assert.ok((await summary(db)).reset.unlocked);
      assert.equal((await resetYearIn(db, "kestrel gives 2026") as { code: string }).code, "wrong-name");
    });

    test("wipes this year's activity, keeps people and settings, starts next year unscheduled, and lists uploaded files", async () => {
      await jumpIn(db, "after", new Date());
      const old = (await currentEventIn(db))!;
      const jules = await userId(db, "Jules");
      // One uploaded photo on an item, one uploaded proof, and one upload never attached.
      const reserve = async (purpose: "photo" | "proof") => {
        const r = await reserveUploadIn(db, { userId: jules, purpose, type: "image/jpeg", bytes: 10, prefix: "test/" });
        assert.ok(r.ok);
        return r.pathname;
      };
      const photo = await reserve("photo");
      const proof = await reserve("proof");
      const loose = await reserve("photo");
      await db.query(`INSERT INTO item_photos (item_id, position, path, source) VALUES ($1, 2, $2, 'upload')`, [await itemId(db, "Custom pet portrait"), photo]);
      await db.query(`INSERT INTO proofs (event_id, user_id, amount_cents, owed_cents, image_path) VALUES ($1, $2, 100, 100, $3)`, [old.id, jules, proof]);
      const counts = async () => one<Record<string, number>>(db,
        `SELECT (SELECT count(*)::int FROM users) AS users, (SELECT count(*)::int FROM charities) AS charities,
                (SELECT count(*)::int FROM email_templates) AS templates, (SELECT count(*)::int FROM items) AS items,
                (SELECT count(*)::int FROM bids) AS bids, (SELECT count(*)::int FROM purchases) AS purchases,
                (SELECT count(*)::int FROM proofs) AS proofs, (SELECT count(*)::int FROM item_photos) AS photos,
                (SELECT count(*)::int FROM uploads) AS uploads, (SELECT count(*)::int FROM events) AS events`);
      await saveTemplateIn(db, "outbid", { subject: "Edited {{item_name}}", body: "Kept after reset." });

      const r = await resetYearIn(db, " Kestrel Gives 2026 ");
      assert.ok(r.ok);
      assert.equal(r.eventName, "Kestrel Gives 2027");
      assert.deepEqual([...r.files].sort(), [photo, proof, loose].sort(), "seed paths are never listed");
      assert.deepEqual(await counts(), { users: 7, charities: 3, templates: 6, items: 0, bids: 0, purchases: 0, proofs: 0, photos: 0, uploads: 0, events: 2 });
      assert.equal((await adminTemplatesIn(db)).templates.find((t) => t.key === "outbid")!.subject, "Edited {{item_name}}");

      const next = (await currentEventIn(db))!;
      assert.notEqual(next.id, old.id);
      assert.deepEqual(
        [next.name, next.timeZone, next.minStartingBidCents, next.bidIncrementCents, next.proofDeadlineDays, next.givingPlatformUrl, next.submissionsOpenAt, next.biddingOpensAt, next.biddingClosesAt],
        ["Kestrel Gives 2027", old.timeZone, old.minStartingBidCents, old.bidIncrementCents, old.proofDeadlineDays, old.givingPlatformUrl, null, null, null],
      );
      const kept = await one<{ name: string; is_current: boolean }>(db, `SELECT name, is_current FROM events WHERE id = $1`, [old.id]);
      assert.deepEqual(kept, { name: "Kestrel Gives 2026", is_current: false });

      const s = await summary(db);
      assert.equal(s.event.phase, "unscheduled");
      assert.equal(s.demoReset, true);
      assert.equal(s.totals.pledged.grandCents, 0);
      assert.equal(s.reset.unlocked, false);
    });

    test("after Reset: employees can't submit, admins can add an item (and then it's no longer 'just reset'); Restore brings the demo back", async () => {
      await jumpIn(db, "after", new Date());
      assert.ok((await resetYearIn(db, "Kestrel Gives 2026")).ok);
      const photo = async (who: string) => {
        const r = await reserveUploadIn(db, { userId: who, purpose: "photo", type: "image/jpeg", bytes: 10, prefix: "test/" });
        assert.ok(r.ok);
        return r.id;
      };
      const jules = { id: await userId(db, "Jules"), role: "employee" as const };
      const admin = { id: maya, role: "admin" as const };
      const write = (id: string) => ({ type: "auction" as const, title: "Kayak lesson", description: "An hour on the lake.", startingBidCents: 2_000, photos: [{ uploadId: id }] });
      const refused = await createItemIn(db, jules, write(await photo(jules.id)));
      assert.ok(!refused.ok && refused.kind === "refused" && refused.refusal.code === "submissions-closed");
      assert.ok((await createItemIn(db, admin, write(await photo(maya)))).ok);
      assert.equal((await summary(db)).demoReset, false);

      await restoreIn(db, "manual", new Date());
      const s = await summary(db);
      assert.deepEqual([s.event.name, s.event.phase, s.demoReset], ["Kestrel Gives 2026", "live", false]);
      assert.equal((await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM events`)).n, 1);
    });
  });
});

describe("/api/admin handler (reads only; refusals write nothing)", () => {
  const cookie = (id: string) => ({ cookie: `kg_viewer=${id}` });
  const ids = async () => {
    const c = await pool.connect();
    try {
      return {
        maya: (await one<{ id: string }>(c, `SELECT id FROM users WHERE first_name = 'Maya'`)).id,
        jules: (await one<{ id: string }>(c, `SELECT id FROM users WHERE first_name = 'Jules'`)).id,
      };
    } finally {
      c.release();
    }
  };

  test("employees get 403 on every view and action; nothing is written", async () => {
    const { GET, POST } = await import("../../api/admin.ts");
    const { jules } = await ids();
    const get = await GET(new Request("http://localhost/api/admin?view=people", { headers: cookie(jules) }));
    assert.equal(get.status, 403);
    assert.equal(((await get.json()) as { code: string }).code, "admins-only");
    const post = await POST(new Request("http://localhost/api/admin", {
      method: "POST", headers: { ...cookie(jules), "content-type": "application/json" }, body: JSON.stringify({ action: "restore-template", key: "outbid" }),
    }));
    assert.equal(post.status, 403);
  });

  test("admins read each view; bad views and actions get 400", async () => {
    const { GET, POST } = await import("../../api/admin.ts");
    const { maya } = await ids();
    for (const view of ["summary", "people", "proofs", "items", "settings", "templates"]) {
      const r = await GET(new Request(`http://localhost/api/admin?view=${view}`, { headers: cookie(maya) }));
      assert.equal(r.status, 200, view);
      assert.equal(((await r.json()) as { ok: boolean }).ok, true);
    }
    assert.equal((await GET(new Request("http://localhost/api/admin?view=secrets", { headers: cookie(maya) }))).status, 400);
    const bad = await POST(new Request("http://localhost/api/admin", { method: "POST", headers: { ...cookie(maya), "content-type": "application/json" }, body: JSON.stringify({ action: "drop" }) }));
    assert.equal(bad.status, 400);
  });
});
