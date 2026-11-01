// Smoke test for the deploy pipeline: the function runs, reaches Postgres, and says
// which branch it's on, by label only, since the production site is public. "schema" is
// the number of the latest applied migration ("002"), so a deploy's migration is visible.
import { neon } from "@neondatabase/serverless";
import { databaseLabel } from "../lib/db-endpoint.ts";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  const url = process.env["DATABASE_URL"];
  if (!url) return Response.json({ ok: false, error: "Database not configured." }, { status: 503, headers: NO_STORE });

  const db = databaseLabel(url, process.env);
  try {
    const rows = await neon(url)`SELECT max(name) AS name FROM schema_migrations`;
    const latest = rows[0]?.["name"];
    const schema = typeof latest === "string" ? latest.slice(0, 3) : null;
    return Response.json({ ok: true, db, schema }, { headers: NO_STORE });
  } catch {
    // Driver errors can include host details, so they stay in the function logs.
    console.error("health: database query failed");
    return Response.json({ ok: false, db, error: "Database unreachable." }, { status: 503, headers: NO_STORE });
  }
}
