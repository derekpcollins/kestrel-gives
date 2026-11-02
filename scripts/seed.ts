// `npm run db:seed`: replaces the data with the demo seed (dev branch unless --allow-main).
// The e2e global setup runs it before every test run, so dev always starts from the seed.
import { Pool } from "@neondatabase/serverless";
import { withTransaction } from "../lib/data/db.ts";
import { seedIn } from "../lib/seed/seed.ts";
import { databaseUrl, endpointOf } from "./db-target.ts";
import { directUrl, withSchemaLock } from "./migrate-lib.ts";

const url = databaseUrl();
const pool = new Pool({ connectionString: directUrl(url) });
try {
  const s = await withSchemaLock(pool, () => withTransaction(pool, (tx) => seedIn(tx, new Date())));
  console.log(`Seeded ${endpointOf(url)}: ${s.users} users, ${s.items} items, ${s.photos} photos, ${s.bids} bids, ${s.purchases} purchases, ${s.proofs} proofs.`);
} finally {
  await pool.end();
}
