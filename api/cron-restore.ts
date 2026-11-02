// GET /api/cron-restore: the daily Restore demo data (SPEC §3.1, DECISIONS #80). Called by
// Vercel cron (vercel.json) with `Authorization: Bearer <CRON_SECRET>`; refuses everything
// if CRON_SECRET isn't set. Vercel may deliver a run twice, so a second run within the hour
// is skipped. Same restore code and lock as the demo bar.
import { json, problem, withDatabase } from "../lib/api/http.ts";
import { cronAuthorized } from "../lib/demo/requests.ts";
import { tryRestore } from "../lib/demo/restore.ts";

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request.headers.get("authorization"), process.env["CRON_SECRET"])) return problem(401, "Unauthorized.");
  return withDatabase("cron-restore", async (pool) => {
    const outcome = await tryRestore(pool, "cron", new Date());
    console.log(`cron-restore: ${outcome.status}`);
    if (outcome.status === "busy") return problem(409, "Busy; another restore, jump or deploy holds the lock.");
    return json({ ok: true, status: outcome.status });
  });
}
