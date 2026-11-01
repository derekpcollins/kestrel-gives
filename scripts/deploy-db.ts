// The last step of the Vercel build (DECISIONS #67). On a production build, and only once
// DATABASE_URL is confirmed to be Neon's main branch, it applies pending migrations and
// seeds the demo if the database has never been seeded, all under one advisory lock so two
// builds can't race. Any other build skips it. Any failure fails the build, so the new
// deployment never goes live against a half-migrated database.
import { Pool } from "@neondatabase/serverless";
import { decideDeploy, directUrl, runMigrations, withSchemaLock } from "./migrate-lib.ts";
import { isEmpty, seed } from "./seed-lib.ts";

const decision = decideDeploy(process.env);
if (decision.action === "skip") {
  console.log(`deploy-db: skipped, ${decision.reason}.`);
  process.exit(0);
}
if (decision.action === "refuse") {
  console.error(`deploy-db: refusing to touch the database: ${decision.reason}.`);
  process.exit(1);
}

const pool = new Pool({ connectionString: directUrl(decision.url) });
try {
  console.log("deploy-db: production build on the main branch.");
  await withSchemaLock(pool, async () => {
    await runMigrations(pool);
    if (await isEmpty(pool)) console.log(`deploy-db: first deploy, seeded (${await seed(pool)}).`);
    else console.log("deploy-db: data already present, not seeding.");
  });
} catch (error) {
  // Driver errors can include host details; print the message only.
  console.error(`deploy-db: failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
