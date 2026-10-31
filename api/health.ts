// Smoke test for the deploy pipeline: the function runs, reaches Postgres, and says
// which branch it's on, by label only, since the production site is public.
import { neon } from "@neondatabase/serverless";
import { databaseLabel } from "../lib/db-endpoint.ts";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  const url = process.env["DATABASE_URL"];
  if (!url) return Response.json({ ok: false, error: "Database not configured." }, { status: 503, headers: NO_STORE });

  const db = databaseLabel(url, process.env);
  try {
    await neon(url)`SELECT 1`;
    return Response.json({ ok: true, db }, { headers: NO_STORE });
  } catch {
    // Driver errors can include host details, so they stay in the function logs.
    console.error("health: database query failed");
    return Response.json({ ok: false, db, error: "Database unreachable." }, { status: 503, headers: NO_STORE });
  }
}
