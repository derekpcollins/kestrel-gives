// Loads the demo seed (SPEC §10, DECISIONS #76). Shared by `npm run db:seed`, the production
// build's seed-if-empty step, and Restore demo data (Milestone 3). Run it inside one
// transaction: it replaces every app table's rows, so a failure leaves the old data intact.
// Given the same `now` it produces exactly the same rows, ids included.
import type { Id, Tx } from "../data/db.ts";
import { TEMPLATE_DEFAULTS, TEMPLATE_KEYS } from "../email-templates.ts";
import {
  CHARITIES, EVENT, ITEMS, PLACEHOLDER_LOGO, PLACEHOLDER_PROOF, PROOF_REVIEWER, PROOFS, REVIEW_AFTER_HOURS, USERS,
  photoPath, type Person,
} from "./data.ts";

// upload_log is deliberately not here: Restore must not reset the daily upload caps (#92).
const APP_TABLES = ["email_templates", "uploads", "proofs", "purchases", "bids", "item_photos", "items", "charities", "users", "events"];
const HOUR = 3_600_000;
const cents = (dollars: number) => dollars * 100;

/** True when there is no event yet: the only test for "never seeded" (DECISIONS #76). */
export async function hasNoEventIn(tx: Tx): Promise<boolean> {
  const { rows } = await tx.query<{ empty: boolean }>("SELECT NOT EXISTS (SELECT 1 FROM events) AS empty");
  return rows[0]?.empty === true;
}

/** Seeds only a database with no event. Returns true if it seeded. */
export async function seedIfEmptyIn(tx: Tx, now: Date): Promise<boolean> {
  if (!(await hasNoEventIn(tx))) return false;
  await seedIn(tx, now);
  return true;
}

export interface SeedSummary {
  users: number;
  items: number;
  photos: number;
  bids: number;
  purchases: number;
  proofs: number;
}

export async function seedIn(tx: Tx, now: Date): Promise<SeedSummary> {
  // The hour, so displayed times are round ("closes Tuesday at 4:00 PM").
  const base = new Date(Math.floor(now.getTime() / HOUR) * HOUR);
  const hoursAgo = (h: number) => new Date(base.getTime() - h * HOUR);
  const opened = hoursAgo(EVENT.submissionsOpenHoursAgo);

  // Postgres won't TRUNCATE a table with pending deferred checks (changes made earlier in this
  // transaction). Check the deferred winner key now, then defer it again for whatever follows.
  await tx.query("SET CONSTRAINTS items_winner_not_removed IMMEDIATE");
  await tx.query(`TRUNCATE ${APP_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  await tx.query("SET CONSTRAINTS items_winner_not_removed DEFERRED");

  const event = await insertId(
    tx,
    `INSERT INTO events (name, time_zone, submissions_open_at, bidding_opens_at, bidding_closes_at, giving_platform_url, is_current, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, $3) RETURNING id`,
    [EVENT.name, EVENT.timeZone, opened, hoursAgo(EVENT.biddingOpenedHoursAgo), hoursAgo(-EVENT.biddingClosesInHours), EVENT.givingPlatformUrl],
  );

  const user = new Map<Person, Id>();
  for (const u of USERS) {
    user.set(u.key, await insertId(tx, `INSERT INTO users (first_name, last_name, role, created_at) VALUES ($1, $2, $3, $4) RETURNING id`, [u.first, u.last, u.role, opened]));
  }
  const who = (p: Person) => user.get(p) as Id;

  for (const [i, c] of CHARITIES.entries()) {
    await tx.query(`INSERT INTO charities (name, description, logo_path, position) VALUES ($1, $2, $3, $4)`, [c.name, c.description, PLACEHOLDER_LOGO, i + 1]);
  }

  let photos = 0;
  let bids = 0;
  let purchases = 0;
  for (const item of ITEMS) {
    const submitted = new Date(opened.getTime() + item.submittedAfterHours * HOUR);
    const cancelledAt = item.type === "auction" && item.cancelledHoursAgo !== undefined ? hoursAgo(item.cancelledHoursAgo) : null;
    const itemId = await insertId(
      tx,
      `INSERT INTO items (event_id, submitter_id, type, title, description, starting_bid_cents, price_cents, quantity, remaining, status, cancelled_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12::timestamptz, COALESCE($11::timestamptz, $12::timestamptz)) RETURNING id`,
      [
        event, who(item.submitter), item.type, item.title, item.description,
        item.type === "auction" ? cents(item.startingBid) : null,
        item.type === "instant" ? cents(item.price) : null,
        item.type === "instant" ? item.quantity : null,
        item.type === "instant" ? item.quantity - item.purchases.length : null,
        cancelledAt ? "cancelled" : "active", cancelledAt, submitted,
      ],
    );
    for (let n = 1; n <= item.photos; n++) {
      await tx.query(`INSERT INTO item_photos (item_id, position, path, source, created_at) VALUES ($1, $2, $3, 'seed', $4)`, [itemId, n, photoPath(item.slug, n), submitted]);
      photos++;
    }
    if (item.type === "auction") {
      for (const [bidder, dollars, ago] of item.bids) {
        await tx.query(`INSERT INTO bids (item_id, bidder_id, amount_cents, created_at) VALUES ($1, $2, $3, $4)`, [itemId, who(bidder), cents(dollars), hoursAgo(ago)]);
        bids++;
      }
    } else {
      for (const [buyer, ago] of item.purchases) {
        await tx.query(`INSERT INTO purchases (item_id, buyer_id, price_cents, created_at) VALUES ($1, $2, $3, $4)`, [itemId, who(buyer), cents(item.price), hoursAgo(ago)]);
        purchases++;
      }
    }
  }

  for (const p of PROOFS) {
    const owed = ITEMS.reduce(
      (sum, item) => sum + (item.type === "instant" ? item.purchases.filter(([buyer]) => buyer === p.person).length * item.price : 0),
      0,
    );
    const reviewed = p.status === "pending" ? null : hoursAgo(p.hoursAgo - REVIEW_AFTER_HOURS);
    await tx.query(
      `INSERT INTO proofs (event_id, user_id, amount_cents, owed_cents, image_path, status, rejection_reason, reviewed_by, reviewed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [event, who(p.person), cents(p.amount), cents(owed), PLACEHOLDER_PROOF, p.status, p.rejectionReason ?? null, reviewed ? who(PROOF_REVIEWER) : null, reviewed, hoursAgo(p.hoursAgo)],
    );
  }

  for (const key of TEMPLATE_KEYS) {
    const t = TEMPLATE_DEFAULTS[key];
    await tx.query(`INSERT INTO email_templates (key, subject, body, updated_at) VALUES ($1, $2, $3, $4)`, [key, t.subject, t.body, opened]);
  }

  return { users: USERS.length, items: ITEMS.length, photos, bids, purchases, proofs: PROOFS.length };
}

async function insertId(tx: Tx, sql: string, params: unknown[]): Promise<Id> {
  const { rows } = await tx.query<{ id: Id }>(sql, params);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("Insert returned no id.");
  return id;
}
