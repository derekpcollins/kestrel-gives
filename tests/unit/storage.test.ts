import { strict as assert } from "node:assert";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, test } from "node:test";
import { storageFor } from "../../lib/storage/index.ts";
import { localStorage } from "../../lib/storage/local.ts";
import { assertOwned } from "../../lib/storage/paths.ts";

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
    ["seed/items/a.jpg", "preview/"],
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
    const stored = await storage.put("items", new Uint8Array([1, 2, 3]), "image/png");
    assert.match(stored.pathname, /^test\/items\/[0-9a-f-]{36}\.png$/);
    await access(join(root, stored.pathname));
    await storage.delete([stored.pathname]);
    await assert.rejects(access(join(root, stored.pathname)));
  });

  test("a batch with one foreign path deletes nothing", async () => {
    const production = join(root, "production/items/live.jpg");
    await mkdir(dirname(production), { recursive: true });
    await writeFile(production, "live");
    const preview = localStorage("preview/", root);
    const own = await preview.put("items", new Uint8Array([1]), "image/jpeg");

    await assert.rejects(preview.delete([own.pathname, "production/items/live.jpg"]), /outside/);
    await access(production);
    await access(join(root, own.pathname));
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
