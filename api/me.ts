// GET /api/me (SPEC §8 › Your Items): the viewer's bids, wins and purchases, donated items,
// cancellations and proof status, for the current event. Acts as the viewer cookie's user.
import { actingUserIn, resolvePhoto } from "../lib/api/item-answer.ts";
import { json, problem, withDatabase } from "../lib/api/http.ts";
import { withTransaction } from "../lib/data/db.ts";
import { meAnswerIn } from "../lib/data/me.ts";
import { viewerIdFrom } from "../lib/demo/viewer.ts";

export async function GET(request: Request): Promise<Response> {
  const cookieId = viewerIdFrom(request.headers.get("cookie"));
  return withDatabase("me", (pool) =>
    withTransaction(pool, async (tx) => {
      const viewer = await actingUserIn(tx, cookieId);
      if (!viewer) return problem(503, "The demo has no people yet.");
      const answer = await meAnswerIn(tx, viewer, resolvePhoto);
      return answer ? json(answer) : problem(404, "There's no current event.");
    }),
  );
}
