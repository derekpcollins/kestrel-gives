// GET /api/items (DECISIONS #87): a browse list, `?type=auction|instant&sort=newest|price|bids`,
// or one item, `?id=12`, with its photos and public bid history. Acts as the viewer cookie's
// user. Reading the event finalizes winners if bidding has closed (SPEC §7.1).
import { actingUserIn, itemAnswerIn, resolvePhoto } from "../lib/api/item-answer.ts";
import { json, problem, withDatabase } from "../lib/api/http.ts";
import { parseItemsQuery } from "../lib/api/sale-requests.ts";
import { withTransaction } from "../lib/data/db.ts";
import { currentEventIn, phaseOf } from "../lib/data/event.ts";
import { listItemsIn } from "../lib/data/items.ts";
import { viewerIdFrom } from "../lib/demo/viewer.ts";
import type { BrowseAnswer } from "../src/items-api.ts";

export async function GET(request: Request): Promise<Response> {
  const query = parseItemsQuery(new URL(request.url).searchParams);
  if ("error" in query) return problem(400, query.error);
  const cookieId = viewerIdFrom(request.headers.get("cookie"));

  return withDatabase("items", (pool) =>
    withTransaction(pool, async (tx) => {
      const viewer = await actingUserIn(tx, cookieId);
      if (!viewer) return problem(503, "The demo has no people yet.");
      if (query.kind === "one") {
        const answer = await itemAnswerIn(tx, query.id, viewer.id);
        return answer ? json(answer) : problem(404, "That item doesn't exist.", {}, { code: "not-found" });
      }
      const event = await currentEventIn(tx);
      if (!event) return problem(404, "There's no current event.");
      const { rows: clock } = await tx.query<{ now: Date }>(`SELECT now() AS now`);
      const answer: BrowseAnswer = {
        ok: true, type: query.type, sort: query.sort, phase: phaseOf(event, clock[0]!.now),
        items: await listItemsIn(tx, event.id, query.type, query.sort, viewer.id, resolvePhoto),
      };
      return json(answer);
    }),
  );
}
