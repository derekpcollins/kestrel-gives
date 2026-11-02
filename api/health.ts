// Smoke test for the deploy pipeline: the function runs, reaches Postgres, and says
// which branch it's on, by label only, since the production site is public. "schema" is
// the number of the latest applied migration ("003"), so a deploy's migration is visible.
// "seedPhotos" says whether the seed photos will display as themselves (DECISIONS #77): on
// Production and Preview, that SEED_PHOTOS_BASE_URL is a valid Blob base URL (never shown);
// locally, that every gitignored copy is present.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { databaseLabel } from "../lib/db-endpoint.ts";
import { PHOTOS_INSTALLED } from "../lib/seed/data.ts";
import { seedPhotosReady } from "../lib/seed/photo-url.ts";
import { SEED_PHOTOS, seedPhotoKey } from "../lib/seed/photos.ts";

function seedPhotos(): boolean {
  const keys = SEED_PHOTOS.map((p) => seedPhotoKey(p.slug, p.n));
  return seedPhotosReady(process.env, PHOTOS_INSTALLED, keys, (key) => existsSync(join(process.cwd(), "public", key)));
}

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  const url = process.env["DATABASE_URL"];
  if (!url) return Response.json({ ok: false, seedPhotos: seedPhotos(), error: "Database not configured." }, { status: 503, headers: NO_STORE });

  const db = databaseLabel(url, process.env);
  try {
    const rows = await neon(url)`SELECT max(name) AS name FROM schema_migrations`;
    const latest = rows[0]?.["name"];
    const schema = typeof latest === "string" ? latest.slice(0, 3) : null;
    return Response.json({ ok: true, db, schema, seedPhotos: seedPhotos() }, { headers: NO_STORE });
  } catch {
    // Driver errors can include host details, so they stay in the function logs.
    console.error("health: database query failed");
    return Response.json({ ok: false, db, seedPhotos: seedPhotos(), error: "Database unreachable." }, { status: 503, headers: NO_STORE });
  }
}
