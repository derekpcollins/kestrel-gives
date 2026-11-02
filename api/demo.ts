// POST /api/demo: the demo bar's actions (SPEC §3.1, DECISIONS #81). Body is JSON:
//   { "action": "view-as", "userId": "3" }   sets the viewer cookie
//   { "action": "jump", "to": "ended" }       moves the event's dates
//   { "action": "restore" }                   reseeds everything (10-second global cooldown)
// Anyone may use them; the demo is shared. Answers with the new app state.
import { appStateIn } from "../lib/api/app-state.ts";
import { isHttps, json, problem, withDatabase } from "../lib/api/http.ts";
import { hasLocalCopy } from "../lib/api/local-copy.ts";
import { withTransaction } from "../lib/data/db.ts";
import { jumpIn } from "../lib/demo/jump.ts";
import { isJsonRequest, parseDemoAction } from "../lib/demo/requests.ts";
import { tryDemoLockIn, tryRestore } from "../lib/demo/restore.ts";
import { viewerCookie, viewerIdFrom } from "../lib/demo/viewer.ts";

const BUSY = "Someone else is changing the demo right now. Try again in a moment.";

export async function POST(request: Request): Promise<Response> {
  if (!isJsonRequest(request.headers.get("content-type"))) return problem(415, "Send JSON (Content-Type: application/json).");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, "The request body isn't valid JSON.");
  }
  const parsed = parseDemoAction(body);
  if ("error" in parsed) return problem(400, parsed.error);

  return withDatabase("demo", async (pool) => {
    let viewerId = viewerIdFrom(request.headers.get("cookie"));
    const headers: Record<string, string> = {};

    if (parsed.action === "view-as") {
      const { rows } = await pool.query<{ id: string }>(`SELECT id FROM users WHERE id = $1`, [parsed.userId]);
      if (!rows[0]) return problem(404, "There's no one with that id in the demo.");
      viewerId = rows[0].id;
      headers["Set-Cookie"] = viewerCookie(viewerId, isHttps(request));
    } else if (parsed.action === "jump") {
      const done = await withTransaction(pool, async (tx) => {
        if (!(await tryDemoLockIn(tx))) return false;
        await jumpIn(tx, parsed.to, new Date());
        return true;
      });
      if (!done) return problem(409, BUSY);
      console.log(`demo: jumped to ${parsed.to}`);
    } else {
      const outcome = await tryRestore(pool, "manual", new Date());
      if (outcome.status === "busy") return problem(409, BUSY);
      if (outcome.status === "cooldown") {
        return problem(429, `The demo was just restored. Try again in ${outcome.retryAfterSeconds} seconds.`, { "Retry-After": String(outcome.retryAfterSeconds) });
      }
      console.log("demo: restored (manual)");
    }

    const state = await withTransaction(pool, (tx) => appStateIn(tx, viewerId, process.env, hasLocalCopy));
    return json({ ok: true, ...state }, 200, headers);
  });
}
