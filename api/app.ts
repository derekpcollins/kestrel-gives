// GET /api/app: the shell's data (DECISIONS #81): viewer, people, event and phase, charities.
// Reading the event finalizes winners if bidding has closed (SPEC §7.1), exactly once.
import { appStateIn } from "../lib/api/app-state.ts";
import { json, withDatabase } from "../lib/api/http.ts";
import { hasLocalCopy } from "../lib/api/local-copy.ts";
import { withTransaction } from "../lib/data/db.ts";
import { viewerIdFrom } from "../lib/demo/viewer.ts";

export async function GET(request: Request): Promise<Response> {
  const viewerId = viewerIdFrom(request.headers.get("cookie"));
  return withDatabase("app", async (pool) => {
    const state = await withTransaction(pool, (tx) => appStateIn(tx, viewerId, process.env, hasLocalCopy));
    return json({ ok: true, ...state });
  });
}
