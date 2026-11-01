// `npm run db:migrate`: applies pending migrations (dev branch unless --allow-main).
// Production is migrated by the build instead (scripts/deploy-db.ts, DECISIONS #67).
import { Pool } from "@neondatabase/serverless";
import { databaseUrl, endpointOf } from "./db-target.ts";
import { directUrl, runMigrations, withSchemaLock } from "./migrate-lib.ts";

const url = databaseUrl();
const pool = new Pool({ connectionString: directUrl(url) });
try {
  console.log(`Migrating ${endpointOf(url)}`);
  await withSchemaLock(pool, () => runMigrations(pool));
} finally {
  await pool.end();
}
