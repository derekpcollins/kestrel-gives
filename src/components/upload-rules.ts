// Upload rules shared by the browser and the server (SPEC §4 › File storage; DECISIONS #53,
// #91–#93). No DOM, so node:test and the server can load it.
// - The browser resizes each picture before uploading.
// - The server checks the size and the file's contents (its first bytes, not its name or
//   the type the browser claims) and enforces the daily caps.

export type UploadType = "image/jpeg" | "image/png" | "image/webp";
export type UploadPurpose = "photo" | "proof";

export const UPLOAD_PURPOSES: readonly UploadPurpose[] = ["photo", "proof"];

/** The server's cap per file, under Vercel's 4.5 MB request limit (#53). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** The browser draws each picture with its long side at most this many pixels (#93). */
export const RESIZE_LONG_SIDE = 1600;
/** The quality the browser encodes at: small files that still look sharp in the carousel. */
export const RESIZE_QUALITY = 0.85;

/**
 * Daily caps for the public demo (#92), counted over the last 24 hours. They were sized for
 * Hobby's 2,000 uploads and lists a month; on Pro (#96) they stay as an abuse guard on cost.
 * 20 a day is at most 600 uploads a month on Production, plus at most one list per Restore
 * that follows an upload, plus the daily cron's list.
 * 10 per person covers an item with five photos, a proof and a few retries.
 */
export const UPLOAD_CAPS = { perPersonPerDay: 10, everyonePerDay: 20 } as const;

/** The type the file's first bytes show, or null if it isn't a JPEG, PNG or WebP. */
export function sniffImageType(bytes: Uint8Array): UploadType | null {
  const at = (i: number, ...values: number[]) => values.every((v, k) => bytes[i + k] === v);
  if (bytes.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (bytes.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  // "RIFF", four bytes of length, then "WEBP".
  if (bytes.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

export const UPLOAD_MESSAGES = {
  notImage: "That file isn't a JPEG, PNG or WebP picture.",
  tooBig: "That picture is over 4 MB. Try a smaller one.",
  cantRead: "We couldn't read that picture. Try a JPEG, PNG or WebP.",
  personCap: `You've uploaded ${UPLOAD_CAPS.perPersonPerDay} pictures today, the most this demo allows each person in a day. Try again tomorrow.`,
  everyoneCap: "This demo has reached its upload limit for today. Try again tomorrow.",
  paused: "Uploads are paused for now to keep this demo's storage use in check. Everything else still works.",
} as const;

/** Why this upload can't happen now, or null. `counts` are uploads in the last 24 hours. */
export function uploadCapRefusal(counts: { person: number; everyone: number }): string | null {
  if (counts.everyone >= UPLOAD_CAPS.everyonePerDay) return UPLOAD_MESSAGES.everyoneCap;
  if (counts.person >= UPLOAD_CAPS.perPersonPerDay) return UPLOAD_MESSAGES.personCap;
  return null;
}

/** The size a picture is drawn at so its long side is at most `RESIZE_LONG_SIDE`; never enlarged. */
export function resizedSize(width: number, height: number, longSide = RESIZE_LONG_SIDE): { width: number; height: number } {
  const scale = Math.min(1, longSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * How long browsers may keep an uploaded file (DECISIONS #100, #102). Proofs get Blob's minimum,
 * a minute, so a deleted or Restored proof doesn't linger in a browser for a month; photos keep
 * Blob's default (undefined here).
 */
export const PROOF_CACHE_SECONDS = 60;
export function cacheSecondsFor(purpose: UploadPurpose): number | undefined {
  return purpose === "proof" ? PROOF_CACHE_SECONDS : undefined;
}
