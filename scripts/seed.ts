// `npm run db:seed`: replaces the data with the demo seed (dev branch unless --allow-main).
import { Pool } from "@neondatabase/serverless";
import { databaseUrl, endpointOf } from "./db-target.ts";
import { seed } from "./seed-lib.ts";
import { directUrl, withSchemaLock } from "./migrate-lib.ts";

const url = databaseUrl();
const pool = new Pool({ connectionString: directUrl(url) });
try {
  const summary = await withSchemaLock(pool, () => seed(pool));
  console.log(`Seeded ${endpointOf(url)}: ${summary}.`);
} finally {
  await pool.end();
}
