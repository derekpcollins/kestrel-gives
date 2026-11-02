// POST /api/bids (SPEC §7.4, DECISIONS #88): `{ itemId, amountCents, seenHighBidCents? }`, as the
// viewer cookie's user. Locks the item, checks the rules with the database clock, and saves
// in one transaction. Answers with the updated item, or a refusal with the new minimum.
import { actingUserIn, itemAnswerIn } from "../lib/api/item-answer.ts";
import { json, problem, readJson, withDatabase } from "../lib/api/http.ts";
import { parseBidRequest } from "../lib/api/sale-requests.ts";
import { withTransaction } from "../lib/data/db.ts";
import { placeBidIn } from "../lib/data/sales.ts";
import { viewerIdFrom } from "../lib/demo/viewer.ts";
import { formatDollars } from "../src/components/form-rules.ts";
import { refusalStatus } from "../src/components/sale-rules.ts";
import type { ActionAnswer } from "../src/items-api.ts";

export async function POST(request: Request): Promise<Response> {
  const read = await readJson(request);
  if ("response" in read) return read.response;
  const bid = parseBidRequest(read.body);
  if ("error" in bid) return problem(bid.error === "Whole dollars only." ? 422 : 400, bid.error, {}, bid.error === "Whole dollars only." ? { code: "not-whole-dollars" } : {});
  const cookieId = viewerIdFrom(request.headers.get("cookie"));

  return withDatabase("bids", (pool) =>
    withTransaction(pool, async (tx) => {
      const viewer = await actingUserIn(tx, cookieId);
      if (!viewer) return problem(503, "The demo has no people yet.");
      const outcome = await placeBidIn(tx, { ...bid, bidderId: viewer.id });
      if (!outcome.ok) {
        const { code, message } = outcome.refusal;
        const status = code === "not-found" ? 404 : refusalStatus(code);
        return problem(status, message, {}, { code, minimumBidCents: outcome.minimumBidCents, highBidCents: outcome.highBidCents });
      }
      console.log(`bids: placed on item ${bid.itemId}`);
      const answer = await itemAnswerIn(tx, bid.itemId, viewer.id);
      const body: ActionAnswer = { ...answer!, message: `Your bid of ${formatDollars(outcome.amountCents / 100)} is in. You're the high bidder.` };
      return json(body, 201);
    }),
  );
}
