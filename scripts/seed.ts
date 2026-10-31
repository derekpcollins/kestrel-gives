// Placeholder until Milestone 2 writes the real seed data. Proves the seed path end
// to end and, like the real one must be, is safe to re-run (SPEC §4).
import { Pool } from "@neondatabase/serverless";
import { databaseUrl, endpointOf } from "./db-target.ts";

const url = databaseUrl();
const pool = new Pool({ connectionString: url });

try {
  await pool.query(`
    INSERT INTO app_meta (key, value) VALUES ('seeded_at', now()::text)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`);
  const { rows } = await pool.query("SELECT count(*)::int AS count FROM app_meta");
  console.log(`Seeded ${endpointOf(url)}: app_meta has ${rows[0]?.count} row(s).`);
} finally {
  await pool.end();
}
