// Turns a stored photo path into the URL a page shows (DECISIONS #77). The database holds
// the same relative key everywhere (local dev and Preview share the dev branch), so this
// decision happens at display time:
// - Production and Preview: the Blob store's public base URL (SEED_PHOTOS_BASE_URL) + key.
// - Anywhere else: the gitignored local copy in public/ if present, otherwise the placeholder.
// Uploaded files (Milestone 5) are stored as their pathname under an environment prefix
// ("production/…"): on Production and Preview the same Blob base URL + pathname; locally,
// the dev folder, served by GET /api/uploads (lib/storage/local.ts).
// Other paths (the committed placeholders) pass through unchanged.
import { PLACEHOLDER_PHOTO } from "./data.ts";
import { SEED_PHOTO_KEY } from "./photos.ts";
import { localUploadUrl } from "../storage/local.ts";

type Env = Readonly<Record<string, string | undefined>>;

export const SEED_BASE_ENV = "SEED_PHOTOS_BASE_URL";
const BLOB_HOST = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/;

/** "ok" only for a bare https origin of a public Vercel Blob store. Never echoes the value. */
export function checkSeedBase(value: string | undefined): "ok" | "missing" | "malformed" {
  if (!value) return "missing";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "malformed";
  }
  const bare = url.protocol === "https:" && !url.username && !url.password && !url.port && url.pathname === "/" && !url.search && !url.hash;
  return bare && BLOB_HOST.test(url.hostname) && !value.endsWith("/") ? "ok" : "malformed";
}

export function isDeployed(env: Env): boolean {
  return env["VERCEL_ENV"] === "production" || env["VERCEL_ENV"] === "preview";
}

/** An uploaded file's stored pathname: an environment prefix, then the rest. */
const UPLOAD_KEY = /^(production|preview|development|test)\/[a-z0-9][a-z0-9._/-]*$/;

export function photoUrl(stored: string, env: Env, hasLocalCopy: (key: string) => boolean): string {
  if (UPLOAD_KEY.test(stored)) {
    if (!isDeployed(env)) return localUploadUrl(stored);
    const base = env[SEED_BASE_ENV];
    return checkSeedBase(base) === "ok" ? `${base}/${stored}` : PLACEHOLDER_PHOTO;
  }
  if (!SEED_PHOTO_KEY.test(stored)) return stored;
  if (isDeployed(env)) {
    const base = env[SEED_BASE_ENV];
    return checkSeedBase(base) === "ok" ? `${base}/${stored}` : PLACEHOLDER_PHOTO;
  }
  return hasLocalCopy(stored) ? `/${stored}` : PLACEHOLDER_PHOTO;
}

/**
 * Why a Production or Preview build must stop, or null (DECISIONS #77). Seed photos would
 * otherwise show as the placeholder everywhere. The message never includes the value.
 */
export function seedBaseProblem(env: Env, photosInstalled: boolean): string | null {
  if (!photosInstalled || !isDeployed(env)) return null;
  const status = checkSeedBase(env[SEED_BASE_ENV]);
  if (status === "missing") return `${SEED_BASE_ENV} is not set`;
  if (status === "malformed") return `${SEED_BASE_ENV} is not a public Vercel Blob base URL (https://<store>.public.blob.vercel-storage.com, no path or trailing slash)`;
  return null;
}

/** /api/health's "seedPhotos": true when every seed photo will display as itself. */
export function seedPhotosReady(env: Env, photosInstalled: boolean, keys: readonly string[], hasLocalCopy: (key: string) => boolean): boolean {
  if (!photosInstalled) return false;
  if (isDeployed(env)) return checkSeedBase(env[SEED_BASE_ENV]) === "ok";
  return keys.every(hasLocalCopy);
}
