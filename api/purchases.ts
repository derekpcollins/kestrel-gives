// POST /api/purchases (SPEC §7.5, DECISIONS #88): `{ itemId }` buys one unit as the viewer
// cookie's user. Locks the item and takes one from stock in one transaction, so stock never
// goes below zero, and re-checks the buyer's proof (§7.6). Answers with the updated item.
import { actingUserIn, itemAnswerIn } from "../lib/api/item-answer.ts";
import { json, problem, readJson, withDatabase } from "../lib/api/http.ts";
import { parseBuyRequest } from "../lib/api/sale-requests.ts";
import { withTransaction } from "../lib/data/db.ts";
import { buyIn } from "../lib/data/sales.ts";
import { viewerIdFrom } from "../lib/demo/viewer.ts";
import { formatDollars } from "../src/components/form-rules.ts";
import { refusalStatus } from "../src/components/sale-rules.ts";
import type { ActionAnswer } from "../src/items-api.ts";

export async function POST(request: Request): Promise<Response> {
  const read = await readJson(request);
  if ("response" in read) return read.response;
  const buy = parseBuyRequest(read.body);
  if ("error" in buy) return problem(400, buy.error);
  const cookieId = viewerIdFrom(request.headers.get("cookie"));

  return withDatabase("purchases", (pool) =>
    withTransaction(pool, async (tx) => {
      const viewer = await actingUserIn(tx, cookieId);
      if (!viewer) return problem(503, "The demo has no people yet.");
      const outcome = await buyIn(tx, { itemId: buy.itemId, buyerId: viewer.id });
      if (!outcome.ok) {
        const { code, message } = outcome.refusal;
        return problem(code === "not-found" ? 404 : refusalStatus(code), message, {}, { code });
      }
      console.log(`purchases: bought one of item ${buy.itemId}`);
      const answer = await itemAnswerIn(tx, buy.itemId, viewer.id);
      const body: ActionAnswer = { ...answer!, message: `You bought the ${answer!.item.title} for ${formatDollars(outcome.priceCents / 100)}.` };
      return json(body, 201);
    }),
  );
}
