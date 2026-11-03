// /api/items, as the viewer cookie's user. Reading the event finalizes winners if bidding has
// closed (SPEC §7.1).
// - GET (DECISIONS #87): a browse list, `?type=auction|instant&sort=newest|price|bids`, or one
//   item, `?id=12`, with its photos and public bid history.
// - POST, PATCH `?id=`, DELETE `?id=` (SPEC §7.3, DECISIONS #94): submit, edit and delete. One
//   function holds all four, within the 12-function Hobby limit. Files of removed photos are
//   deleted after the commit.
import { actingUserIn, itemAnswerIn, resolvePhoto } from "../lib/api/item-answer.ts";
import { deleteOwnFiles } from "../lib/api/files.ts";
import { json, problem, readJson, withDatabase } from "../lib/api/http.ts";
import { parseItemId, parseItemWrite } from "../lib/api/item-requests.ts";
import { parseItemsQuery } from "../lib/api/sale-requests.ts";
import { withTransaction, type Id, type Tx } from "../lib/data/db.ts";
import { createItemIn, deleteItemIn, updateItemIn, type WriteRefusal } from "../lib/data/item-writes.ts";
import { storageFor } from "../lib/storage/index.ts";
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

const REFUSAL_STATUS = { "submissions-closed": 409, "not-yours": 403, cancelled: 409, "has-activity": 409 } as const;

function refused(outcome: WriteRefusal): Response {
  if (outcome.kind === "not-found") return problem(404, "That item doesn't exist.", {}, { code: "not-found" });
  if (outcome.kind === "invalid") return problem(422, "Check the highlighted fields.", {}, { code: "invalid", problems: outcome.problems });
  return problem(REFUSAL_STATUS[outcome.refusal.code], outcome.refusal.message, {}, { code: outcome.refusal.code });
}

export async function POST(request: Request): Promise<Response> {
  const read = await readJson(request);
  if ("response" in read) return read.response;
  const input = parseItemWrite(read.body);
  if ("error" in input) return problem(400, input.error);
  const cookieId = viewerIdFrom(request.headers.get("cookie"));

  return withDatabase("items", (pool) =>
    withTransaction(pool, async (tx) => {
      const viewer = await actingUserIn(tx, cookieId);
      if (!viewer) return problem(503, "The demo has no people yet.");
      const outcome = await createItemIn(tx, viewer, input);
      if (!outcome.ok) return refused(outcome);
      console.log(`items: created ${outcome.itemId}`);
      return json({ ok: true, id: outcome.itemId, message: "Thanks. Your item is in." }, 201);
    }),
  );
}

export async function PATCH(request: Request): Promise<Response> {
  const id = parseItemId(new URL(request.url).searchParams);
  if (typeof id !== "string") return problem(400, id.error);
  const read = await readJson(request);
  if ("response" in read) return read.response;
  const input = parseItemWrite(read.body);
  if ("error" in input) return problem(400, input.error);
  return writeThen("updated", request, (tx, viewer) => updateItemIn(tx, viewer, id, input), id, "Your changes are saved.");
}

export async function DELETE(request: Request): Promise<Response> {
  const id = parseItemId(new URL(request.url).searchParams);
  if (typeof id !== "string") return problem(400, id.error);
  return writeThen("deleted", request, (tx, viewer) => deleteItemIn(tx, viewer, id), id, "Your item is deleted.");
}

/** Runs an edit or delete, then (after the commit) deletes the files of removed photos. */
async function writeThen(
  verb: string,
  request: Request,
  write: (tx: Tx, viewer: { id: Id; role: "admin" | "employee" }) => ReturnType<typeof updateItemIn>,
  id: Id,
  message: string,
): Promise<Response> {
  const cookieId = viewerIdFrom(request.headers.get("cookie"));
  return withDatabase("items", async (pool) => {
    const result = await withTransaction(pool, async (tx) => {
      const viewer = await actingUserIn(tx, cookieId);
      if (!viewer) return problem(503, "The demo has no people yet.");
      const outcome = await write(tx, viewer);
      return outcome.ok ? outcome : refused(outcome);
    });
    if (result instanceof Response) return result;
    const deleted = await deleteOwnFiles(storageFor(), result.removedFiles, "items");
    console.log(`items: ${verb} ${id}; ${deleted} file(s) deleted`);
    return json({ ok: true, id, message });
  });
}
