// Submitting, editing and deleting items (SPEC §7.3, DECISIONS #94). Each runs in the caller's
// transaction and locks the item row first, so an edit can't race a first bid: either the bid
// lands first and the money fields lock, or the edit lands first and the bid sees the new
// starting bid. Photos are either ones the item already has ({ photoId }) or the person's own
// unused uploads ({ uploadId }). Files of removed photos are returned so the caller deletes
// them after the commit (a rolled-back edit must not lose files).
import type { Id, Tx } from "./db.ts";
import { currentEventIn, phaseOf } from "./event.ts";
import { claimUploadsIn } from "./uploads.ts";
import {
  deleteBlock, editBlock, itemProblems, submitBlock,
  type FieldProblems, type ItemFacts, type Refusal, type Role, type SaleType,
} from "../../src/components/item-form-rules.ts";

export type PhotoRef = { photoId: Id } | { uploadId: Id };

export interface ItemWrite {
  type: SaleType;
  title: string;
  description: string;
  startingBidCents?: number | null;
  priceCents?: number | null;
  quantity?: number | null;
  photos: PhotoRef[];
}

export interface Actor {
  id: Id;
  role: Role;
}

export type WriteRefusal =
  | { kind: "refused"; refusal: Refusal }
  | { kind: "invalid"; problems: FieldProblems }
  | { kind: "not-found" };

export type WriteOutcome<T> = ({ ok: true } & T) | ({ ok: false } & WriteRefusal);

const NOT_FOUND = { ok: false as const, kind: "not-found" as const };
const BAD_PHOTOS = (message: string) => ({ ok: false as const, kind: "invalid" as const, problems: { photos: message } });

/** Money and stock columns for the sale type; the other type's columns stay null (table CHECKs). */
function moneyColumns(input: ItemWrite) {
  return input.type === "auction"
    ? { starting: input.startingBidCents ?? null, price: null, quantity: null }
    : { starting: null, price: input.priceCents ?? null, quantity: input.quantity ?? null };
}

function problemsFor(input: ItemWrite, minStartingBidCents: number): FieldProblems {
  return itemProblems(
    {
      type: input.type, title: input.title, description: input.description,
      startingBidCents: input.startingBidCents ?? null, priceCents: input.priceCents ?? null,
      quantity: input.quantity ?? null, photoCount: input.photos.length,
    },
    { minStartingBidCents },
  );
}

async function writePhotosIn(tx: Tx, itemId: Id, paths: { path: string; source: "seed" | "upload" }[]): Promise<void> {
  await tx.query(`DELETE FROM item_photos WHERE item_id = $1`, [itemId]);
  for (const [i, photo] of paths.entries()) {
    await tx.query(`INSERT INTO item_photos (item_id, position, path, source) VALUES ($1, $2, $3, $4)`, [itemId, i + 1, photo.path, photo.source]);
  }
}

/** Forgets the upload rows of these files, so Restore and the caps don't track deleted files. */
async function dropUploadRowsIn(tx: Tx, pathnames: readonly string[]): Promise<void> {
  if (pathnames.length > 0) await tx.query(`DELETE FROM uploads WHERE pathname = ANY($1::text[])`, [pathnames]);
}

function uploadIdsOf(photos: readonly PhotoRef[]): Id[] {
  return photos.flatMap((p) => ("uploadId" in p ? [p.uploadId] : []));
}

export async function createItemIn(tx: Tx, actor: Actor, input: ItemWrite): Promise<WriteOutcome<{ itemId: Id }>> {
  const event = await currentEventIn(tx);
  if (!event) return NOT_FOUND;
  const { rows: clock } = await tx.query<{ now: Date }>(`SELECT clock_timestamp() AS now`);
  const blocked = submitBlock(actor.role, phaseOf(event, clock[0]!.now));
  if (blocked) return { ok: false, kind: "refused", refusal: blocked };

  const problems = problemsFor(input, event.minStartingBidCents);
  if (Object.keys(problems).length > 0) return { ok: false, kind: "invalid", problems };
  if (input.photos.some((p) => "photoId" in p)) return BAD_PHOTOS("Upload the photos for a new item.");
  const ids = uploadIdsOf(input.photos);
  const claimed = await claimUploadsIn(tx, actor.id, ids, "photo");
  if (!claimed) return BAD_PHOTOS("One of those photos isn't available. Upload it again.");

  const money = moneyColumns(input);
  const { rows } = await tx.query<{ id: Id }>(
    `INSERT INTO items (event_id, submitter_id, type, title, description, starting_bid_cents, price_cents, quantity, remaining)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
    [event.id, actor.id, input.type, input.title.trim(), input.description.trim(), money.starting, money.price, money.quantity],
  );
  const itemId = rows[0]!.id;
  await writePhotosIn(tx, itemId, ids.map((id) => ({ path: claimed.get(id)!, source: "upload" as const })));
  return { ok: true, itemId };
}

interface LockedForWrite {
  facts: ItemFacts;
  type: SaleType;
  startingBidCents: number | null;
  priceCents: number | null;
  quantity: number | null;
  photos: { id: Id; path: string; source: "seed" | "upload" }[];
}

async function lockForWriteIn(tx: Tx, eventId: Id, itemId: Id): Promise<LockedForWrite | null> {
  const { rows } = await tx.query<{ submitter_id: Id; status: string; type: SaleType; starting: number | null; price: number | null; quantity: number | null }>(
    `SELECT submitter_id, status, type, starting_bid_cents AS starting, price_cents AS price, quantity
       FROM items WHERE id = $1 AND event_id = $2 FOR UPDATE`,
    [itemId, eventId],
  );
  const r = rows[0];
  if (!r) return null;
  // Removed bids and cancelled purchases count: they still point at the item (#94).
  const { rows: activity } = await tx.query<{ any: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM bids WHERE item_id = $1) OR EXISTS (SELECT 1 FROM purchases WHERE item_id = $1) AS any`,
    [itemId],
  );
  const { rows: photos } = await tx.query<{ id: Id; path: string; source: "seed" | "upload" }>(
    `SELECT id, path, source FROM item_photos WHERE item_id = $1 ORDER BY position`,
    [itemId],
  );
  const num = (v: number | null) => (v === null ? null : Number(v));
  return {
    facts: { submitterId: r.submitter_id, cancelled: r.status === "cancelled", hasActivity: activity[0]?.any === true },
    type: r.type, startingBidCents: num(r.starting), priceCents: num(r.price), quantity: num(r.quantity), photos,
  };
}

/** Saves an edit. Locked fields (SPEC §7.3) keep their stored values whatever is sent. */
export async function updateItemIn(tx: Tx, actor: Actor, itemId: Id, input: ItemWrite): Promise<WriteOutcome<{ removedFiles: string[] }>> {
  const event = await currentEventIn(tx);
  if (!event) return NOT_FOUND;
  const locked = await lockForWriteIn(tx, event.id, itemId);
  if (!locked) return NOT_FOUND;
  const blocked = editBlock(actor, locked.facts);
  if (blocked) return { ok: false, kind: "refused", refusal: blocked };

  const effective: ItemWrite = locked.facts.hasActivity
    ? { ...input, type: locked.type, startingBidCents: locked.startingBidCents, priceCents: locked.priceCents, quantity: locked.quantity }
    : input;
  // A starting bid saved under an older, lower minimum stays valid on later edits.
  const minimum = effective.type === "auction" && effective.startingBidCents === locked.startingBidCents && locked.startingBidCents !== null
    ? Math.min(event.minStartingBidCents, locked.startingBidCents)
    : event.minStartingBidCents;
  const problems = problemsFor(effective, minimum);
  if (Object.keys(problems).length > 0) return { ok: false, kind: "invalid", problems };

  const current = new Map(locked.photos.map((p) => [p.id, p]));
  const keptIds = effective.photos.flatMap((p) => ("photoId" in p ? [p.photoId] : []));
  if (new Set(keptIds).size !== keptIds.length || keptIds.some((id) => !current.has(id))) return BAD_PHOTOS("One of those photos isn't on this item any more. Reload and try again.");
  const ids = uploadIdsOf(effective.photos);
  const claimed = await claimUploadsIn(tx, actor.id, ids, "photo");
  if (!claimed) return BAD_PHOTOS("One of those photos isn't available. Upload it again.");

  const next = effective.photos.map((p) => {
    if ("photoId" in p) {
      const kept = current.get(p.photoId)!;
      return { path: kept.path, source: kept.source };
    }
    return { path: claimed.get(p.uploadId)!, source: "upload" as const };
  });
  const keep = new Set(keptIds);
  const removedFiles = locked.photos.filter((p) => !keep.has(p.id) && p.source === "upload").map((p) => p.path);

  const money = moneyColumns(effective);
  // With no activity nothing has sold yet, so stock is the whole quantity again.
  await tx.query(
    `UPDATE items SET type = $2, title = $3, description = $4, starting_bid_cents = $5, price_cents = $6,
            quantity = $7, remaining = CASE WHEN $8::boolean THEN remaining ELSE $7::integer END, updated_at = now()
      WHERE id = $1`,
    [itemId, effective.type, effective.title.trim(), effective.description.trim(), money.starting, money.price, money.quantity, locked.facts.hasActivity],
  );
  await writePhotosIn(tx, itemId, next);
  await dropUploadRowsIn(tx, removedFiles);
  return { ok: true, removedFiles };
}

export async function deleteItemIn(tx: Tx, actor: Actor, itemId: Id): Promise<WriteOutcome<{ removedFiles: string[] }>> {
  const event = await currentEventIn(tx);
  if (!event) return NOT_FOUND;
  const locked = await lockForWriteIn(tx, event.id, itemId);
  if (!locked) return NOT_FOUND;
  const blocked = deleteBlock(actor, locked.facts);
  if (blocked) return { ok: false, kind: "refused", refusal: blocked };
  const removedFiles = locked.photos.filter((p) => p.source === "upload").map((p) => p.path);
  await tx.query(`DELETE FROM items WHERE id = $1`, [itemId]);
  await dropUploadRowsIn(tx, removedFiles);
  return { ok: true, removedFiles };
}
