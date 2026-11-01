// Seed steps shared by `npm run db:seed` and the production build's seed-if-empty step.
// Placeholder until 2C writes the real seed: it only stamps app_meta, which proves the
// path end to end. Like the real one, it is safe to re-run (SPEC §4).
import type { Pool } from "@neondatabase/serverless";

/** True when the database has never been seeded. The production build seeds only then. */
export async function isEmpty(pool: Pool): Promise<boolean> {
  const { rows } = await pool.query("SELECT 1 FROM app_meta WHERE key = 'seeded_at'");
  return rows.length === 0;
}

export async function seed(pool: Pool): Promise<string> {
  await pool.query(`
    INSERT INTO app_meta (key, value) VALUES ('seeded_at', now()::text)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`);
  const { rows } = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM app_meta");
  return `app_meta has ${rows[0]?.count} row(s)`;
}
