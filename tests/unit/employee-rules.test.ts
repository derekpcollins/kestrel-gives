// Milestone 5 rules with no database: uploads (DECISIONS #91–#93), item forms (#94), proof
// (#95), request shapes, and where uploaded files are shown from.
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { parseItemId, parseItemWrite, parseProofRequest, parseUploadPurpose } from "../../lib/api/item-requests.ts";
import { deleteOwnFiles } from "../../lib/api/files.ts";
import { clearUploads } from "../../lib/demo/restore.ts";
import { BLOB_ADVANCED_PER_MONTH, BLOB_UPLOAD_STOP, blobStopFor } from "../../lib/data/blob-budget.ts";
import { PLACEHOLDER_PHOTO } from "../../lib/seed/data.ts";
import { photoUrl } from "../../lib/seed/photo-url.ts";
import type { Storage } from "../../lib/storage/index.ts";
import { deleteBlock, editBlock, itemProblems, lockedFields, submitBlock, type ItemInput } from "../../src/components/item-form-rules.ts";
import { amountWarning, deadlineWords, proofBlock, totalChanged } from "../../src/components/proof-rules.ts";
import {
  MAX_UPLOAD_BYTES, resizedSize, sniffImageType, UPLOAD_CAPS, UPLOAD_MESSAGES, uploadCapRefusal,
} from "../../src/components/upload-rules.ts";

describe("upload checks (#53, #92, #93)", () => {
  test("the file's first bytes decide the type, not its name", () => {
    assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0])), "image/jpeg");
    assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    assert.equal(sniffImageType(webp), "image/webp");
    assert.equal(sniffImageType(new TextEncoder().encode("GIF89a......")), null);
    assert.equal(sniffImageType(new TextEncoder().encode("<svg xmlns=")), null);
    assert.equal(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WAVE")), null);
    assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8])), null, "too short");
  });

  test("the cap is 4 MB, under Vercel's 4.5 MB request limit", () => {
    assert.equal(MAX_UPLOAD_BYTES, 4 * 1024 * 1024);
    assert.ok(MAX_UPLOAD_BYTES < 4.5 * 1000 * 1000);
  });

  test("daily caps: everyone's is checked first, then the person's", () => {
    assert.equal(uploadCapRefusal({ person: 0, everyone: 0 }), null);
    assert.equal(uploadCapRefusal({ person: UPLOAD_CAPS.perPersonPerDay - 1, everyone: UPLOAD_CAPS.everyonePerDay - 1 }), null);
    assert.equal(uploadCapRefusal({ person: UPLOAD_CAPS.perPersonPerDay, everyone: 3 }), UPLOAD_MESSAGES.personCap);
    assert.equal(uploadCapRefusal({ person: 0, everyone: UPLOAD_CAPS.everyonePerDay }), UPLOAD_MESSAGES.everyoneCap);
    assert.match(UPLOAD_MESSAGES.personCap, /You've uploaded 10 pictures today.*Try again tomorrow\./);
  });

  test("a person's cap fits an item with five photos, a proof and a few retries", () => {
    assert.ok(UPLOAD_CAPS.perPersonPerDay >= 5 + 1 + 2);
    assert.ok(UPLOAD_CAPS.perPersonPerDay < UPLOAD_CAPS.everyonePerDay);
  });

  test("resizing keeps the shape, caps the long side at 1600 and never enlarges", () => {
    assert.deepEqual(resizedSize(4000, 3000), { width: 1600, height: 1200 });
    assert.deepEqual(resizedSize(3000, 4000), { width: 1200, height: 1600 });
    assert.deepEqual(resizedSize(800, 600), { width: 800, height: 600 });
    assert.deepEqual(resizedSize(10000, 10), { width: 1600, height: 2 });
    assert.deepEqual(resizedSize(100000, 1), { width: 1600, height: 1 }, "never zero");
  });
});

describe("item forms (SPEC §7.3, #94)", () => {
  const dev = { id: "4", role: "employee" as const };
  const maya = { id: "1", role: "admin" as const };
  const fresh = { submitterId: "4", cancelled: false, hasActivity: false };

  test("employees submit only in the submission window; admins any time (§7.1)", () => {
    assert.equal(submitBlock("employee", "submission"), null);
    assert.equal(submitBlock("employee", "live")?.code, "submissions-closed");
    assert.equal(submitBlock("employee", "ended")?.message, "Submissions are closed. Only admins can add items now.");
    assert.equal(submitBlock("admin", "live"), null);
    assert.equal(submitBlock("admin", "ended"), null);
  });

  test("the submitter and admins edit; nobody edits a cancelled item", () => {
    assert.equal(editBlock(dev, fresh), null);
    assert.equal(editBlock(maya, fresh), null);
    assert.equal(editBlock({ id: "5", role: "employee" }, fresh)?.code, "not-yours");
    assert.equal(editBlock(maya, { ...fresh, cancelled: true })?.code, "cancelled");
  });

  test("delete only with no bids or purchases (removed and cancelled ones count)", () => {
    assert.equal(deleteBlock(dev, fresh), null);
    assert.equal(deleteBlock(dev, { ...fresh, hasActivity: true })?.code, "has-activity");
    assert.equal(deleteBlock(maya, { ...fresh, hasActivity: true })?.code, "has-activity");
    assert.equal(deleteBlock({ id: "5", role: "employee" }, fresh)?.code, "not-yours");
  });

  test("sale type and money lock once there is activity", () => {
    assert.deepEqual(lockedFields(false), []);
    assert.deepEqual(lockedFields(true), ["type", "startingBid", "price", "quantity"]);
  });

  const auction: ItemInput = { type: "auction", title: "Pottery class", description: "Two hours.", startingBidCents: 2_000, photoCount: 1 };
  const settings = { minStartingBidCents: 1_000 };

  test("a complete item has no problems", () => {
    assert.deepEqual(itemProblems(auction, settings), {});
    assert.deepEqual(itemProblems({ type: "instant", title: "Candles", description: "Three.", priceCents: 1_500, quantity: 4, photoCount: 5 }, settings), {});
  });

  test("each field says what's wrong, in the form's words", () => {
    assert.deepEqual(itemProblems({ ...auction, title: "  ", description: "", startingBidCents: null, photoCount: 0 }, settings), {
      title: "Enter a title.", description: "Enter a description.", startingBid: "Enter a starting bid.", photos: "Add at least one photo.",
    });
    assert.equal(itemProblems({ ...auction, title: "x".repeat(81) }, settings).title, "Use 80 characters or fewer.");
    assert.equal(itemProblems({ ...auction, startingBidCents: 2_050 }, settings).startingBid, "Whole dollars only.");
    assert.equal(itemProblems({ ...auction, startingBidCents: 500 }, settings).startingBid, "Enter at least $10.");
    assert.equal(itemProblems({ ...auction, startingBidCents: 100_100_00 }, settings).startingBid, "Enter $10,000 or less.");
    assert.equal(itemProblems({ ...auction, photoCount: 6 }, settings).photos, "Use 5 photos or fewer.");
    const instant: ItemInput = { type: "instant", title: "t", description: "d", priceCents: null, quantity: 0, photoCount: 1 };
    assert.deepEqual(itemProblems(instant, settings), { price: "Enter a price.", quantity: "Enter a whole number, 1 or more." });
    assert.equal(itemProblems({ ...instant, priceCents: 1_000, quantity: 101 }, settings).quantity, "Enter 100 or fewer.");
  });
});

describe("donation proof (SPEC §7.6, #95)", () => {
  test("anyone who owes something may upload, from their first purchase on", () => {
    assert.equal(proofBlock({ totalCents: 0, latest: null })?.code, "nothing-owed");
    assert.equal(proofBlock({ totalCents: 4_500, latest: null }), null);
    assert.equal(proofBlock({ totalCents: 4_500, latest: { status: "pending", owedCents: 4_500 } }), null, "replacing a pending proof is fine");
    assert.equal(proofBlock({ totalCents: 4_500, latest: { status: "rejected", owedCents: 4_500 } }), null, "rejected: upload again");
    assert.equal(proofBlock({ totalCents: 4_500, latest: { status: "approved", owedCents: 4_500 } })?.code, "approved");
    assert.equal(proofBlock({ totalCents: 9_000, latest: { status: "approved", owedCents: 4_500 } }), null, "the total changed");
  });

  test("an amount below the total warns but is allowed", () => {
    assert.equal(amountWarning(4_500, 4_500), null);
    assert.equal(amountWarning(5_000, 4_500), null);
    assert.equal(amountWarning(4_000, 10_500), "That's less than your $105 donation total. You can still submit; an admin will review it.");
  });

  test("the banner shows when the total moved since the latest proof", () => {
    assert.equal(totalChanged({ totalCents: 4_500, latest: null }), false);
    assert.equal(totalChanged({ totalCents: 4_500, latest: { status: "approved", owedCents: 4_500 } }), false);
    assert.equal(totalChanged({ totalCents: 9_000, latest: { status: "rejected", owedCents: 4_500 } }), true);
  });

  test("days left, due today, and late", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000);
    assert.equal(deadlineWords(null, now), null);
    assert.equal(deadlineWords(at(6 * 24 + 1), now), "6 days left");
    assert.equal(deadlineWords(at(24), now), "1 day left");
    assert.equal(deadlineWords(at(3), now), "Due today");
    assert.equal(deadlineWords(at(-3), now), "1 day late");
    assert.equal(deadlineWords(at(-49), now), "3 days late");
  });
});

describe("request shapes", () => {
  const body = { type: "auction", title: "Pottery", description: "Two hours.", startingBidCents: 2_000, photos: [{ uploadId: "7" }, { photoId: 3 }] };

  test("an item write keeps ids as strings and leaves field rules to the shared module", () => {
    assert.deepEqual(parseItemWrite(body), { type: "auction", title: "Pottery", description: "Two hours.", startingBidCents: 2_000, photos: [{ uploadId: "7" }, { photoId: "3" }] });
    assert.deepEqual(parseItemWrite({ ...body, startingBidCents: 2_050 }), { ...parseItemWrite(body), startingBidCents: 2_050 }, "whole dollars is a field rule");
  });

  test("bad shapes are refused before any query", () => {
    assert.ok("error" in parseItemWrite(null));
    assert.ok("error" in parseItemWrite({ ...body, type: "raffle" }));
    assert.ok("error" in parseItemWrite({ ...body, title: 5 }));
    assert.ok("error" in parseItemWrite({ ...body, title: "x".repeat(1_000) }));
    assert.ok("error" in parseItemWrite({ ...body, priceCents: "12" }));
    assert.ok("error" in parseItemWrite({ ...body, photos: "a.jpg" }));
    assert.ok("error" in parseItemWrite({ ...body, photos: [{ uploadId: "1", photoId: "2" }] }));
    assert.ok("error" in parseItemWrite({ ...body, photos: [{ path: "production/photos/x.jpg" }] }), "never a raw path");
    assert.ok("error" in parseItemWrite({ ...body, photos: Array(11).fill({ uploadId: "1" }) }));
  });

  test("ids, purposes and proofs", () => {
    assert.equal(parseItemId(new URLSearchParams("id=12")), "12");
    assert.ok(typeof parseItemId(new URLSearchParams("id=0")) !== "string");
    assert.equal(parseUploadPurpose(new URLSearchParams("purpose=proof")), "proof");
    assert.ok(typeof parseUploadPurpose(new URLSearchParams("purpose=avatar")) !== "string");
    assert.deepEqual(parseProofRequest({ amountCents: 4_500, uploadId: "9" }), { amountCents: 4_500, uploadId: "9" });
    assert.deepEqual(parseProofRequest({ amountCents: 4_550, uploadId: "9" }), { error: "Whole dollars only.", field: "amount" });
    assert.deepEqual(parseProofRequest({ uploadId: "9" }), { error: "Enter the amount you donated.", field: "amount" });
    assert.ok("error" in parseProofRequest({ amountCents: 4_500 }));
  });
});

describe("uploaded files: where they show from, and clearing them", () => {
  const none = () => false;
  test("uploads resolve to the Blob base when deployed, the local folder otherwise", () => {
    const env = { VERCEL_ENV: "preview", SEED_PHOTOS_BASE_URL: "https://abc123.public.blob.vercel-storage.com" };
    assert.equal(photoUrl("preview/photos/a.jpg", env, none), "https://abc123.public.blob.vercel-storage.com/preview/photos/a.jpg");
    assert.equal(photoUrl("development/photos/a.jpg", {}, none), "/api/uploads?file=development%2Fphotos%2Fa.jpg");
    assert.equal(photoUrl("production/photos/a.jpg", { VERCEL_ENV: "production" }, none), PLACEHOLDER_PHOTO, "no base URL: the placeholder");
  });

  function fakeStorage(kind: "blob" | "local", prefix = "preview/"): Storage & { clears: number; deleted: string[][] } {
    const s = {
      kind, prefix, clears: 0, deleted: [] as string[][],
      async put() { throw new Error("unused"); },
      async delete(paths: readonly string[]) { s.deleted.push([...paths]); },
      async clear() { s.clears += 1; return { files: 3, lists: 1 }; },
    };
    return s;
  }

  test("Blob: a manual Restore lists only after an upload; the cron always sweeps (#91)", async () => {
    const blob = fakeStorage("blob");
    assert.deepEqual(await clearUploads(blob, "manual", false), { files: 0, lists: 0 });
    assert.equal(blob.clears, 0, "no list operation spent");
    assert.deepEqual(await clearUploads(blob, "manual", true), { files: 3, lists: 1 });
    assert.deepEqual(await clearUploads(blob, "cron", false), { files: 3, lists: 1 });
    assert.equal(blob.clears, 2);
  });

  test("local Restore always clears; a failed clear is logged, not thrown", async () => {
    const local = fakeStorage("local", "development/");
    assert.deepEqual(await clearUploads(local, "manual", false), { files: 3, lists: 1 });
    const broken = { ...fakeStorage("blob"), async clear(): Promise<{ files: number; lists: number }> { throw new Error("network"); } };
    const quiet = console.error;
    console.error = () => {};
    try {
      assert.deepEqual(await clearUploads(broken, "cron", true), { files: 0, lists: 1 }, "a failed clear still counts a list");
    } finally {
      console.error = quiet;
    }
  });

  test("after an edit, only this environment's own files are deleted", async () => {
    const preview = fakeStorage("blob");
    assert.equal(await deleteOwnFiles(preview, ["preview/photos/a.jpg", "development/photos/b.jpg"], "test"), 1);
    assert.deepEqual(preview.deleted, [["preview/photos/a.jpg"]]);
    assert.equal(await deleteOwnFiles(preview, ["development/photos/b.jpg"], "test"), 0);
    assert.equal(preview.deleted.length, 1);
  });
});

describe("the Blob circuit breaker (#96)", () => {
  test("uploads stop at 75% of the monthly allowance, split between Production and Preview", () => {
    const total = Object.values(BLOB_UPLOAD_STOP).reduce((a, b) => a + b, 0);
    assert.equal(total, BLOB_ADVANCED_PER_MONTH * 0.75);
    assert.ok(BLOB_UPLOAD_STOP["production/"]! > BLOB_UPLOAD_STOP["preview/"]!);
  });

  test("only Blob storage is counted; an unknown Blob prefix gets no budget", () => {
    assert.equal(blobStopFor({ kind: "blob", prefix: "production/" }), 1_200);
    assert.equal(blobStopFor({ kind: "blob", prefix: "preview/" }), 300);
    assert.equal(blobStopFor({ kind: "local", prefix: "development/" }), null);
    assert.equal(blobStopFor({ kind: "blob", prefix: "development/" }), 0);
  });

  test("the refusal says uploads are paused and the rest still works", () => {
    assert.match(UPLOAD_MESSAGES.paused, /^Uploads are paused for now.*Everything else still works\.$/);
  });
});
