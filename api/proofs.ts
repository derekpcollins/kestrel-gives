// POST /api/proofs (SPEC §7.6, DECISIONS #95): `{ amountCents, uploadId }`, as the viewer
// cookie's user. The screenshot is uploaded first (POST /api/uploads?purpose=proof). Records the
// donation total it covers and answers with the viewer's updated proof view. An amount below
// the total is allowed; the form warns and an admin decides.
import { actingUserIn, resolvePhoto } from "../lib/api/item-answer.ts";
import { json, problem, readJson, withDatabase } from "../lib/api/http.ts";
import { parseProofRequest } from "../lib/api/item-requests.ts";
import { withTransaction } from "../lib/data/db.ts";
import { currentEventIn } from "../lib/data/event.ts";
import { proofViewIn } from "../lib/data/me.ts";
import { submitProofIn } from "../lib/data/proofs.ts";
import { viewerIdFrom } from "../lib/demo/viewer.ts";

const STATUS = { "not-found": 404, "nothing-owed": 409, approved: 409, "bad-image": 422 } as const;

export async function POST(request: Request): Promise<Response> {
  const read = await readJson(request);
  if ("response" in read) return read.response;
  const proof = parseProofRequest(read.body);
  if ("error" in proof) return problem(proof.field ? 422 : 400, proof.error, {}, proof.field ? { code: "bad-amount", field: proof.field } : {});
  const cookieId = viewerIdFrom(request.headers.get("cookie"));

  return withDatabase("proofs", (pool) =>
    withTransaction(pool, async (tx) => {
      const viewer = await actingUserIn(tx, cookieId);
      if (!viewer) return problem(503, "The demo has no people yet.");
      const outcome = await submitProofIn(tx, viewer.id, proof);
      if (!outcome.ok) return problem(STATUS[outcome.code], outcome.message, {}, { code: outcome.code });
      console.log("proofs: uploaded");
      const event = await currentEventIn(tx);
      const view = await proofViewIn(tx, event!, viewer.id, resolvePhoto);
      return json({ ok: true, proof: view, message: "Thanks. Your proof is in, and an admin will review it." }, 201);
    }),
  );
}
