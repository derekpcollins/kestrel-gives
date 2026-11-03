import { strict as assert } from "node:assert";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, test } from "node:test";
import { storageFor } from "../../lib/storage/index.ts";
import { blobStorage } from "../../lib/storage/blob.ts";
import { localStorage } from "../../lib/storage/local.ts";
import { assertOwned, uploadPathname } from "../../lib/storage/paths.ts";
import type { BlobLister } from "../../lib/storage/blob.ts";

describe("storage prefixes: a preview can never delete the live demo's files", () => {
  test("accepts paths inside its own prefix", () => {
    assert.equal(assertOwned("preview/items/a.jpg", "preview/"), "preview/items/a.jpg");
    assert.equal(assertOwned("production/proofs/b.webp", "production/"), "production/proofs/b.webp");
  });

  const outside: Array<[string, string]> = [
    ["production/items/a.jpg", "preview/"],
    ["preview/items/a.jpg", "production/"],
    ["previewx/items/a.jpg", "preview/"],
    ["preview/../production/items/a.jpg", "preview/"],
    ["preview/./items/a.jpg", "preview/"],
    ["preview//items/a.jpg", "preview/"],
    ["preview/", "preview/"],
    ["/preview/items/a.jpg", "preview/"],
    ["https://store.public.blob.vercel-storage.com/production/items/a.jpg", "production/"],
    ["", "preview/"],
  ];
  for (const [pathname, prefix] of outside) {
    test(`rejects ${JSON.stringify(pathname)} for ${prefix}`, () => {
      assert.throws(() => assertOwned(pathname, prefix), /outside this environment's storage/);
    });
  }

  test("rejects malformed prefixes", () => {
    assert.throws(() => assertOwned("a/b.jpg", ""), /Invalid storage prefix/);
    assert.throws(() => assertOwned("a/b.jpg", "a"), /Invalid storage prefix/);
    assert.throws(() => assertOwned("other/b.jpg", "other/"), /Invalid storage prefix/);
  });
});

describe("seed photos (seed/) can never be deleted by the app (DECISIONS #77)", () => {
  for (const prefix of ["production/", "preview/", "development/", "test/"]) {
    test(`${prefix} can't touch seed/ keys`, () => {
      assert.throws(() => assertOwned("seed/candles-1.jpg", prefix), /seed photos are never deleted/);
      assert.throws(() => assertOwned("seed/items/a.jpg", prefix), /seed photos are never deleted/);
    });
  }

  test("no storage, Blob or local, can be made for the seed/ prefix", () => {
    assert.throws(() => blobStorage("seed/"), /Invalid storage prefix/);
    assert.throws(() => localStorage("seed/"), /Invalid storage prefix/);
    assert.throws(() => assertOwned("seed/candles-1.jpg", "seed/"), /Invalid storage prefix/);
  });

  test("a batch with one seed key deletes nothing", async () => {
    const root = await mkdtemp(join(tmpdir(), "kestrel-seed-"));
    try {
      const seedFile = join(root, "seed/candles-1.jpg");
      await mkdir(dirname(seedFile), { recursive: true });
      await writeFile(seedFile, "seed");
      const preview = localStorage("preview/", root);
      const own = await preview.put(uploadPathname("preview/", "photos", "image/jpeg"), new Uint8Array([1]), "image/jpeg");
      await assert.rejects(preview.delete([own.pathname, "seed/candles-1.jpg"]), /seed photos are never deleted/);
      await access(seedFile);
      await access(join(root, own.pathname));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("local storage driver", () => {
  let root: string;
  before(async () => {
    root = await mkdtemp(join(tmpdir(), "kestrel-storage-"));
  });
  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("put writes under the prefix; delete removes it", async () => {
    const storage = localStorage("test/", root);
    const stored = await storage.put(uploadPathname("test/", "photos", "image/png"), new Uint8Array([1, 2, 3]), "image/png");
    assert.match(stored.pathname, /^test\/photos\/[0-9a-f-]{36}\.png$/);
    await access(join(root, stored.pathname));
    await storage.delete([stored.pathname]);
    await assert.rejects(access(join(root, stored.pathname)));
  });

  test("a batch with one foreign path deletes nothing", async () => {
    const production = join(root, "production/items/live.jpg");
    await mkdir(dirname(production), { recursive: true });
    await writeFile(production, "live");
    const preview = localStorage("preview/", root);
    const own = await preview.put(uploadPathname("preview/", "photos", "image/jpeg"), new Uint8Array([1]), "image/jpeg");

    await assert.rejects(preview.delete([own.pathname, "production/items/live.jpg"]), /outside/);
    await access(production);
    await access(join(root, own.pathname));
  });
});

describe("writing and clearing uploads", () => {
  let root: string;
  before(async () => {
    root = await mkdtemp(join(tmpdir(), "kestrel-clear-"));
  });
  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("put refuses a pathname outside its prefix, or under seed/", async () => {
    const preview = localStorage("preview/", root);
    await assert.rejects(preview.put("production/photos/a.jpg", new Uint8Array([1]), "image/jpeg"), /outside/);
    await assert.rejects(preview.put("seed/a.jpg", new Uint8Array([1]), "image/jpeg"), /seed photos/);
  });

  test("local clear removes only its own prefix and counts the files", async () => {
    const seedFile = join(root, "seed/candles-1.jpg");
    const otherFile = join(root, "production/photos/live.jpg");
    for (const file of [seedFile, otherFile]) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, "keep");
    }
    const dev = localStorage("development/", root);
    await dev.put(uploadPathname("development/", "photos", "image/jpeg"), new Uint8Array([1]), "image/jpeg");
    await dev.put(uploadPathname("development/", "proofs", "image/png"), new Uint8Array([1]), "image/png");
    assert.equal(await dev.clear(), 2);
    await assert.rejects(access(join(root, "development")));
    await access(seedFile);
    await access(otherFile);
    assert.equal(await dev.clear(), 0, "clearing an empty prefix is fine");
  });

  function fakeLister(pages: string[][]): BlobLister & { listed: string[]; deleted: string[][] } {
    const listed: string[] = [];
    const deleted: string[][] = [];
    return {
      listed,
      deleted,
      async list({ prefix, cursor }) {
        listed.push(prefix);
        const at = cursor ? Number(cursor) : 0;
        const blobs = (pages[at] ?? []).map((pathname) => ({ pathname }));
        const hasMore = at + 1 < pages.length;
        return hasMore ? { blobs, hasMore, cursor: String(at + 1) } : { blobs, hasMore };
      },
      async del(pathnames) {
        deleted.push(pathnames);
      },
    };
  }

  test("blob clear lists page by page under its prefix and deletes each page", async () => {
    const lister = fakeLister([["preview/photos/a.jpg", "preview/proofs/b.png"], ["preview/photos/c.webp"]]);
    const count = await blobStorage("preview/", lister).clear();
    assert.equal(count, 3);
    assert.deepEqual(lister.listed, ["preview/", "preview/"]);
    assert.deepEqual(lister.deleted, [["preview/photos/a.jpg", "preview/proofs/b.png"], ["preview/photos/c.webp"]]);
  });

  test("blob clear stops, deleting nothing from that page, if a listed path isn't its own", async () => {
    const lister = fakeLister([["preview/photos/a.jpg", "seed/candles-1.jpg"]]);
    await assert.rejects(blobStorage("preview/", lister).clear(), /seed photos/);
    assert.deepEqual(lister.deleted, []);
    const foreign = fakeLister([["preview/photos/a.jpg", "production/photos/live.jpg"]]);
    await assert.rejects(blobStorage("preview/", foreign).clear(), /outside/);
    assert.deepEqual(foreign.deleted, []);
  });
});

describe("storageFor picks the backend", () => {
  test("Production and Preview with a token use Blob under their own prefix", () => {
    assert.deepEqual(pick({ VERCEL_ENV: "production", BLOB_READ_WRITE_TOKEN: "x" }), ["blob", "production/"]);
    assert.deepEqual(pick({ VERCEL_ENV: "preview", BLOB_READ_WRITE_TOKEN: "x" }), ["blob", "preview/"]);
  });

  test("local dev and tests use the local folder, even with a pulled token", () => {
    assert.deepEqual(pick({ VERCEL_ENV: "development", BLOB_READ_WRITE_TOKEN: "x" }), ["local", "development/"]);
    assert.deepEqual(pick({ BLOB_READ_WRITE_TOKEN: "x", NODE_ENV: "test" }), ["local", "test/"]);
    assert.deepEqual(pick({ VERCEL_ENV: "preview" }), ["local", "development/"]);
  });

  function pick(env: Record<string, string>): [string, string] {
    const storage = storageFor(env);
    return [storage.kind, storage.prefix];
  }
});
