// The last step of the Vercel build (DECISIONS #67). On a production build, and only once
// DATABASE_URL_UNPOOLED (the direct URL) is confirmed to be Neon's main branch, it applies
// pending migrations and seeds the demo if there is no event yet, all under one advisory
// lock so two builds can't race. Any other build skips it. Any failure fails the build, so the new
// deployment never goes live against a half-migrated database.
import { Pool } from "@neondatabase/serverless";
import { decideDeploy, runMigrations, withSchemaLock } from "./migrate-lib.ts";
import { withTransaction } from "../lib/data/db.ts";
import { PHOTOS_INSTALLED } from "../lib/seed/data.ts";
import { seedIfEmptyIn } from "../lib/seed/seed.ts";

const decision = decideDeploy(process.env);
if (decision.action === "skip") {
  console.log(`deploy-db: skipped, ${decision.reason}.`);
  process.exit(0);
}
if (decision.action === "refuse") {
  console.error(`deploy-db: refusing to touch the database: ${decision.reason}.`);
  process.exit(1);
}

const pool = new Pool({ connectionString: decision.url }); // already direct; see decideDeploy
try {
  console.log("deploy-db: production build; DATABASE_URL_UNPOOLED confirmed as the main branch (direct connection).");
  await withSchemaLock(pool, async () => {
    await runMigrations(pool);
    // "Empty" means no event row (DECISIONS #76); a seeded or live demo is never reseeded.
    // main is seeded once, so never with placeholder photos: wait for the real ones (2D).
    if (!PHOTOS_INSTALLED) {
      console.log("deploy-db: seed photos aren't installed yet (Stage 2D); not seeding.");
    } else {
      const seeded = await withTransaction(pool, (tx) => seedIfEmptyIn(tx, new Date()));
      console.log(seeded ? "deploy-db: no event found; seeded the demo." : "deploy-db: an event exists; not seeding.");
    }
  });
} catch (error) {
  // Driver errors can include host details; print the message only.
  console.error(`deploy-db: failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
