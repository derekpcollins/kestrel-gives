// POST /api/uploads?purpose=photo|proof (SPEC §4 › File storage; DECISIONS #91–#93). The body is
// the picture itself, already resized by the browser. The server is the backstop: at most 4 MB,
// and the file's first bytes must show a JPEG, PNG or WebP (the claimed type is ignored). The
// daily caps are checked and the row recorded before the file is written, so Restore can always
// find it. Answers 201 with the upload's id, for the item or proof form to attach.
// GET /api/uploads?file=<pathname> serves a local dev file (#91); it answers 404 on Vercel,
// where files are served by Blob.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { actingUserIn } from "../lib/api/item-answer.ts";
import { json, problem, withDatabase } from "../lib/api/http.ts";
import { parseUploadPurpose } from "../lib/api/item-requests.ts";
import { withTransaction } from "../lib/data/db.ts";
import { forgetUploadIn, reserveUploadIn } from "../lib/data/uploads.ts";
import { viewerIdFrom } from "../lib/demo/viewer.ts";
import { storageFor } from "../lib/storage/index.ts";
import { LOCAL_UPLOADS_DIR } from "../lib/storage/local.ts";
import { assertOwned, IMAGE_EXTENSIONS } from "../lib/storage/paths.ts";
import { MAX_UPLOAD_BYTES, sniffImageType, UPLOAD_MESSAGES } from "../src/components/upload-rules.ts";

/** Reads at most `limit` + 1 bytes, so an oversized body is refused without reading it all. */
async function readCapped(request: Request, limit: number): Promise<Uint8Array | "too-big"> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return "too-big";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

const TYPE_BY_EXTENSION = Object.fromEntries(Object.entries(IMAGE_EXTENSIONS).map(([type, ext]) => [ext, type]));

export async function GET(request: Request): Promise<Response> {
  const storage = storageFor();
  const file = new URL(request.url).searchParams.get("file") ?? "";
  const type = TYPE_BY_EXTENSION[file.slice(file.lastIndexOf(".") + 1)];
  const notFound = () => new Response("Not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (storage.kind !== "local" || !type) return notFound();
  try {
    assertOwned(file, storage.prefix);
  } catch {
    return notFound();
  }
  try {
    const bytes = await readFile(join(LOCAL_UPLOADS_DIR, file));
    return new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return notFound();
  }
}

export async function POST(request: Request): Promise<Response> {
  const purpose = parseUploadPurpose(new URL(request.url).searchParams);
  if (typeof purpose !== "string") return problem(400, purpose.error);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_UPLOAD_BYTES) return problem(413, UPLOAD_MESSAGES.tooBig, {}, { code: "too-big" });
  const bytes = await readCapped(request, MAX_UPLOAD_BYTES);
  if (bytes === "too-big") return problem(413, UPLOAD_MESSAGES.tooBig, {}, { code: "too-big" });
  const type = sniffImageType(bytes);
  if (!type) return problem(415, UPLOAD_MESSAGES.notImage, {}, { code: "not-image" });
  const cookieId = viewerIdFrom(request.headers.get("cookie"));
  const storage = storageFor();

  return withDatabase("uploads", async (pool) => {
    const reserved = await withTransaction(pool, async (tx) => {
      const viewer = await actingUserIn(tx, cookieId);
      if (!viewer) return null;
      return reserveUploadIn(tx, { userId: viewer.id, purpose, type, bytes: bytes.byteLength, prefix: storage.prefix });
    });
    if (!reserved) return problem(503, "The demo has no people yet.");
    if (!reserved.ok) return problem(429, reserved.message, {}, { code: "upload-cap" });
    try {
      const stored = await storage.put(reserved.pathname, bytes, type);
      console.log(`uploads: stored a ${purpose} (${bytes.byteLength} bytes)`);
      return json({ ok: true, id: reserved.id, url: stored.url }, 201);
    } catch (error) {
      await withTransaction(pool, (tx) => forgetUploadIn(tx, reserved.id));
      throw error;
    }
  });
}
