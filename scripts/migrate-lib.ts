// Migration engine shared by `npm run db:migrate` (local, dev branch) and the production
// build step (scripts/deploy-db.ts). Plain SQL files in migrations/, applied once each, in
// order, one transaction per file, recorded with a checksum (SPEC §4, DECISIONS #67).
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "@neondatabase/serverless";
import { endpointOf } from "../lib/db-endpoint.ts";

export const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);
const FILE_NAME = /^\d{3}_[a-z0-9_]+\.sql$/;

/** One key for every process that changes the schema or seeds: migrate, deploy-db, seed, and the demo's Jump and Restore (lib/data/locks.ts). */
import { SCHEMA_LOCK_KEY } from "../lib/data/locks.ts";
export { SCHEMA_LOCK_KEY };

// ---- Pure helpers (unit-tested in tests/unit/migrate-lib.test.ts) ----

/** CRLF and lone CR become LF, so a checkout on Windows can't change a checksum. */
export function normalizeSql(sql: string): string {
  return sql.replace(/\r\n?/g, "\n");
}

export function checksumOf(sql: string): string {
  return createHash("sha256").update(normalizeSql(sql), "utf8").digest("hex");
}

/**
 * The direct (unpooled) form of a Neon connection string, for the local scripts (migrate,
 * seed, tests), whose .env.local has only the pooled DATABASE_URL. Neon's "-pooler" host runs
 * PgBouncer in transaction mode, where a session-level advisory lock doesn't hold (the next
 * query can land on another backend), so migrations and seeding always connect directly.
 * The production build doesn't use this: it reads DATABASE_URL_UNPOOLED (decideDeploy).
 */
export function directUrl(url: string): string {
  const parsed = new URL(url);
  const [first, ...rest] = parsed.hostname.split(".");
  parsed.hostname = [(first ?? "").replace(/-pooler$/, ""), ...rest].join(".");
  return parsed.toString();
}

export interface MigrationFile {
  name: string;
  sql: string;
}

export interface AppliedRow {
  name: string;
  checksum: string | null;
}

/** Problems that must stop a run before anything is applied. */
export function verifyApplied(files: readonly MigrationFile[], applied: readonly AppliedRow[]): string[] {
  const problems: string[] = [];
  const byName = new Map(files.map((file) => [file.name, file]));
  for (const row of applied) {
    const file = byName.get(row.name);
    if (!file) problems.push(`${row.name} was applied but its file is missing from migrations/.`);
    else if (row.checksum !== null && row.checksum !== checksumOf(file.sql)) {
      problems.push(`${row.name} changed after it was applied. Add a new migration instead of editing it.`);
    }
  }
  return problems;
}

export type DeployDecision =
  | { action: "skip"; reason: string }
  | { action: "refuse"; reason: string }
  | { action: "run"; url: string };

/**
 * Whether the build may touch the database. Only a Vercel production build, and only over
 * DATABASE_URL_UNPOOLED (the Neon integration's direct, Production-only URL) once its
 * endpoint is confirmed to be the main branch. Everything else skips (not production) or
 * refuses (production, but no direct URL that is provably main). There is deliberately no
 * fallback to DATABASE_URL: a missing or wrong direct URL fails the build.
 */
export function decideDeploy(env: Readonly<Record<string, string | undefined>>): DeployDecision {
  const vercelEnv = env["VERCEL_ENV"];
  if (vercelEnv !== "production") {
    return { action: "skip", reason: `not a production build (VERCEL_ENV=${vercelEnv ?? "unset"}); dev is migrated locally and by the tests` };
  }
  const url = env["DATABASE_URL_UNPOOLED"];
  const main = env["NEON_MAIN_ENDPOINT"];
  const dev = env["NEON_DEV_ENDPOINT"];
  if (!url) return { action: "refuse", reason: "DATABASE_URL_UNPOOLED is not set" };
  if (!main) return { action: "refuse", reason: "NEON_MAIN_ENDPOINT is not set, so the connection can't be confirmed as main" };
  if (main === dev) return { action: "refuse", reason: "NEON_MAIN_ENDPOINT and NEON_DEV_ENDPOINT are the same; check the settings" };
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { action: "refuse", reason: "DATABASE_URL_UNPOOLED isn't a valid URL" };
  }
  if ((host.split(".")[0] ?? "").endsWith("-pooler")) return { action: "refuse", reason: "DATABASE_URL_UNPOOLED is a pooled host; the advisory lock needs a direct connection" };
  if (endpointOf(url) !== main) return { action: "refuse", reason: "DATABASE_URL_UNPOOLED is not the main branch" };
  return { action: "run", url };
}

// ---- Database steps ----

export interface MigrateOptions {
  dir?: URL;
  table?: string;
  log?: (line: string) => void;
}

export async function readMigrations(dir: URL = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  const misnamed = names.filter((name) => !FILE_NAME.test(name));
  if (misnamed.length > 0) throw new Error(`Migration files must look like 001_name.sql: ${misnamed.join(", ")}`);
  return Promise.all(names.map(async (name) => ({ name, sql: await readFile(new URL(name, dir), "utf8") })));
}

/**
 * Holds a session-level Postgres advisory lock on one dedicated connection while `work`
 * runs, so two builds (or a build and a local run) can't migrate or seed at once. Waits up
 * to `timeoutMs` for another holder to finish, then gives up.
 */
export async function withSchemaLock<T>(
  pool: Pool,
  work: () => Promise<T>,
  { key = SCHEMA_LOCK_KEY, timeoutMs = 120_000, log = console.log }: { key?: number; timeoutMs?: number; log?: (line: string) => void } = {},
): Promise<T> {
  const client = await pool.connect();
  try {
    const deadline = Date.now() + timeoutMs;
    let waiting = false;
    for (;;) {
      const { rows } = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [key]);
      if (rows[0]?.locked) break;
      if (Date.now() > deadline) throw new Error("Another migration or seed is still running; gave up waiting for the schema lock.");
      if (!waiting) log("Waiting for another migration or seed to finish…");
      waiting = true;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    try {
      return await work();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [key]);
    }
  } finally {
    client.release();
  }
}

/** Applies pending migrations. Call inside withSchemaLock. Returns how many were applied. */
export async function runMigrations(pool: Pool, { dir = MIGRATIONS_DIR, table = "schema_migrations", log = console.log }: MigrateOptions = {}): Promise<number> {
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(`Bad migrations table name: ${table}`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${table} (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS checksum text`);

  const files = await readMigrations(dir);
  const { rows: applied } = await pool.query<AppliedRow>(`SELECT name, checksum FROM ${table} ORDER BY name`);
  const problems = verifyApplied(files, applied);
  if (problems.length > 0) throw new Error(`Migrations stopped before applying anything:\n  ${problems.join("\n  ")}`);

  // Rows from before checksums existed get theirs now: the file is trusted as first seen.
  for (const row of applied.filter((r) => r.checksum === null)) {
    const file = files.find((f) => f.name === row.name);
    if (file) {
      await pool.query(`UPDATE ${table} SET checksum = $1 WHERE name = $2 AND checksum IS NULL`, [checksumOf(file.sql), row.name]);
      log(`  recorded checksum for ${row.name}`);
    }
  }

  const done = new Set(applied.map((row) => row.name));
  let count = 0;
  for (const file of files.filter((f) => !done.has(f.name))) {
    await inTransaction(pool, async (client) => {
      await client.query(normalizeSql(file.sql));
      await client.query(`INSERT INTO ${table} (name, checksum) VALUES ($1, $2)`, [file.name, checksumOf(file.sql)]);
    });
    log(`  applied ${file.name}`);
    count++;
  }
  log(count > 0 ? `${count} applied.` : "Up to date.");
  return count;
}

async function inTransaction(pool: Pool, work: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await work(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
