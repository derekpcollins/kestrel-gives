// Input checks for item writes, uploads and proofs (SPEC §11, DECISIONS #91–#95). Pure, so
// node:test covers them. These check shape only; the field rules (lengths, minimums, photo
// count) live in src/components/item-form-rules.ts so the form and the API say the same thing.
import type { ItemWrite, PhotoRef } from "../data/item-writes.ts";
import { ITEM_LIMITS } from "../../src/components/item-form-rules.ts";
import { UPLOAD_PURPOSES, type UploadPurpose } from "../../src/components/upload-rules.ts";

const ID = /^[1-9]\d{0,17}$/;

export function asId(value: unknown): string | null {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === "string" && ID.test(text) ? text : null;
}

function asObject(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/** A number, null, or absent; anything else is a shape error. Field rules come later. */
function optionalNumber(b: Record<string, unknown>, key: string): number | null | undefined | "bad" {
  const v = b[key];
  if (v === undefined || v === null) return v as undefined | null;
  return typeof v === "number" && Number.isFinite(v) ? v : "bad";
}

/**
 * `{ type, title, description, startingBidCents?, priceCents?, quantity?, photos: [{ photoId } | { uploadId }] }`.
 * Strings are capped well above the form's limits so a huge body is refused before any query.
 */
export function parseItemWrite(body: unknown): ItemWrite | { error: string } {
  const b = asObject(body);
  if (!b) return { error: "Expected a JSON object." };
  const type = b["type"];
  if (type !== "auction" && type !== "instant") return { error: "type must be auction or instant." };
  const title = b["title"];
  const description = b["description"];
  if (typeof title !== "string" || title.length > ITEM_LIMITS.titleMax * 4) return { error: "title must be text." };
  if (typeof description !== "string" || description.length > ITEM_LIMITS.descriptionMax * 4) return { error: "description must be text." };

  const write: ItemWrite = { type, title, description, photos: [] };
  for (const key of ["startingBidCents", "priceCents", "quantity"] as const) {
    const v = optionalNumber(b, key);
    if (v === "bad") return { error: `${key} must be a number or null.` };
    if (v !== undefined) write[key] = v;
  }

  const photos = b["photos"];
  if (!Array.isArray(photos) || photos.length > ITEM_LIMITS.photosMax * 2) return { error: "photos must be a list." };
  const refs: PhotoRef[] = [];
  for (const p of photos) {
    const o = asObject(p);
    const photoId = o && asId(o["photoId"]);
    const uploadId = o && asId(o["uploadId"]);
    if (photoId && !uploadId) refs.push({ photoId });
    else if (uploadId && !photoId) refs.push({ uploadId });
    else return { error: "Each photo needs a photoId or an uploadId." };
  }
  write.photos = refs;
  return write;
}

/** `?id=12` on PATCH and DELETE /api/items. */
export function parseItemId(params: URLSearchParams): string | { error: string } {
  const id = asId(params.get("id"));
  return id ?? { error: "id must be an item id." };
}

/** `?purpose=photo|proof` on POST /api/uploads. */
export function parseUploadPurpose(params: URLSearchParams): UploadPurpose | { error: string } {
  const purpose = params.get("purpose");
  return (UPLOAD_PURPOSES as readonly (string | null)[]).includes(purpose) ? (purpose as UploadPurpose) : { error: "purpose must be photo or proof." };
}

/** The most a proof may claim: well above any real total, so a typo is caught. */
export const PROOF_MAX_CENTS = 10_000_000;

/** `{ amountCents, uploadId }`. Whole dollars only (SPEC §7.9). */
export function parseProofRequest(body: unknown): { amountCents: number; uploadId: string } | { error: string; field?: "amount" } {
  const b = asObject(body);
  if (!b) return { error: "Expected a JSON object." };
  const uploadId = asId(b["uploadId"]);
  if (!uploadId) return { error: "uploadId must be an upload id." };
  const amount = b["amountCents"];
  if (amount === undefined || amount === null) return { error: "Enter the amount you donated.", field: "amount" };
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 || amount % 100 !== 0) return { error: "Whole dollars only.", field: "amount" };
  if (amount > PROOF_MAX_CENTS) return { error: "Enter $100,000 or less.", field: "amount" };
  return { amountCents: amount, uploadId };
}
