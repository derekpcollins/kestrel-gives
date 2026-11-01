// The migration engine against real Postgres on the dev branch (DECISIONS #67). Uses its own
// folder, tracking table, schema and lock key, so it never touches the real migrations.
// Runs through the main-branch guard: it refuses main.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, beforeEach, describe, test } from "node:test";
import { Pool } from "@neondatabase/serverless";
import { databaseUrl } from "../../scripts/db-target.ts";
import { checksumOf, directUrl, runMigrations, withSchemaLock } from "../../scripts/migrate-lib.ts";

const TABLE = "schema_migrations_selftest";
const KEY = 74_012_099; // not the real schema lock, so a dev server's migrate can't block this
const quiet = () => {};

describe("migrations on dev", () => {
  let pool: Pool;
  let folder: string;
  let dir: URL;
  const write = (name: string, sql: string) => writeFile(join(folder, name), sql);
  const run = () => runMigrations(pool, { dir, table: TABLE, log: quiet });
  const tables = async () =>
    (await pool.query<{ t: string }>("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'migrate_selftest' ORDER BY 1")).rows.map((r) => r.t);
  const recorded = async () => (await pool.query<{ name: string }>(`SELECT name FROM ${TABLE} ORDER BY name`)).rows.map((r) => r.name);

  before(() => {
    pool = new Pool({ connectionString: directUrl(databaseUrl([])) });
  });
  beforeEach(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${TABLE}; DROP SCHEMA IF EXISTS migrate_selftest CASCADE; CREATE SCHEMA migrate_selftest`);
    folder = await mkdtemp(join(tmpdir(), "kestrel-migrations-"));
    dir = pathToFileURL(folder + "/");
  });
  after(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${TABLE}; DROP SCHEMA IF EXISTS migrate_selftest CASCADE`);
    await pool.end();
    await rm(folder, { recursive: true, force: true });
  });

  test("applies files once, in order, with checksums; a second run is up to date", async () => {
    await write("002_b.sql", "CREATE TABLE migrate_selftest.b (a_id int REFERENCES migrate_selftest.a (id));");
    await write("001_a.sql", "CREATE TABLE migrate_selftest.a (id int PRIMARY KEY);\r\n"); // CRLF on purpose
    assert.equal(await run(), 2);
    assert.deepEqual(await tables(), ["a", "b"]);
    const { rows } = await pool.query<{ checksum: string }>(`SELECT checksum FROM ${TABLE} WHERE name = '001_a.sql'`);
    assert.equal(rows[0]?.checksum, checksumOf("CREATE TABLE migrate_selftest.a (id int PRIMARY KEY);\n"));
    assert.equal(await run(), 0);
  });

  test("a failing file rolls back completely and isn't recorded; earlier files stay", async () => {
    await write("001_a.sql", "CREATE TABLE migrate_selftest.a (id int PRIMARY KEY);");
    await write("002_bad.sql", "CREATE TABLE migrate_selftest.half (id int); SELECT no_such_function();");
    await assert.rejects(run(), /no_such_function/);
    assert.deepEqual(await tables(), ["a"]);
    assert.deepEqual(await recorded(), ["001_a.sql"]);
  });

  test("an edited applied file stops the run before any pending file is applied", async () => {
    await write("001_a.sql", "CREATE TABLE migrate_selftest.a (id int PRIMARY KEY);");
    await run();
    await write("001_a.sql", "CREATE TABLE migrate_selftest.a (id bigint PRIMARY KEY);");
    await write("002_b.sql", "CREATE TABLE migrate_selftest.b (id int);");
    await assert.rejects(run(), /001_a\.sql changed after it was applied/);
    assert.deepEqual(await tables(), ["a"]);
  });

  test("rows from before checksums get one recorded on the next run", async () => {
    await write("001_a.sql", "CREATE TABLE migrate_selftest.a (id int PRIMARY KEY);");
    await run();
    await pool.query(`UPDATE ${TABLE} SET checksum = NULL`);
    await run();
    const { rows } = await pool.query<{ checksum: string | null }>(`SELECT checksum FROM ${TABLE}`);
    assert.equal(rows[0]?.checksum, checksumOf("CREATE TABLE migrate_selftest.a (id int PRIMARY KEY);"));
  });

  test("two runs at once: the advisory lock makes the second wait, and each file applies once", async () => {
    await write("001_a.sql", "CREATE TABLE migrate_selftest.a (id int PRIMARY KEY); SELECT pg_sleep(1);");
    await write("002_b.sql", "CREATE TABLE migrate_selftest.b (id int);");
    const order: string[] = [];
    const locked = (label: string) =>
      withSchemaLock(pool, async () => {
        order.push(`${label} start`);
        const applied = await run();
        order.push(`${label} end`);
        return applied;
      }, { key: KEY, log: quiet, timeoutMs: 20_000 });
    const results = await Promise.all([locked("first"), locked("second")]);
    assert.deepEqual(results.sort(), [0, 2]); // one applied both, the other found nothing to do
    assert.deepEqual(order.map((step) => step.split(" ")[1]), ["start", "end", "start", "end"]); // never overlapped
    assert.deepEqual(await recorded(), ["001_a.sql", "002_b.sql"]);
  });
});
