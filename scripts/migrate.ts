// Applies numbered SQL files in migrations/ once each, in order, recording them in
// schema_migrations (SPEC §4). Each file runs in its own transaction.
import { readdir, readFile } from "node:fs/promises";
import { Pool } from "@neondatabase/serverless";
import { databaseUrl, endpointOf } from "./db-target.ts";

const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);
const FILE_NAME = /^\d{3}_[a-z0-9_]+\.sql$/;

const url = databaseUrl();
const pool = new Pool({ connectionString: url });

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
  const misnamed = files.filter((name) => !FILE_NAME.test(name));
  if (misnamed.length > 0) throw new Error(`Migration files must look like 001_name.sql: ${misnamed.join(", ")}`);

  console.log(`Migrating ${endpointOf(url)}`);
  let applied = 0;
  for (const name of files) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serializes concurrent runs: a second runner waits here, then sees the row and skips.
      await client.query("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");
      const done = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
      if (done.rowCount) {
        await client.query("ROLLBACK");
        continue;
      }
      await client.query(await readFile(new URL(name, MIGRATIONS_DIR), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      console.log(`  applied ${name}`);
      applied++;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  console.log(applied > 0 ? `${applied} applied.` : "Up to date.");
} finally {
  await pool.end();
}
