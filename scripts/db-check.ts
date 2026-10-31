// Run after any Vercel CLI command that may have rewritten .env.local: confirms
// DATABASE_URL points at the dev branch and the main-branch guard is configured.
// Prints only endpoint IDs, never URLs.
import { Pool } from "@neondatabase/serverless";
import { endpointOf } from "./db-target.ts";

const url = process.env["DATABASE_URL"] || undefined;
const mainEndpoint = process.env["NEON_MAIN_ENDPOINT"] || undefined;
const devEndpoint = process.env["NEON_DEV_ENDPOINT"] || undefined;

const problems: string[] = [];
if (!url) problems.push("DATABASE_URL is not set.");
if (!mainEndpoint) problems.push("NEON_MAIN_ENDPOINT is not set, so the main-branch guard can't run.");
if (!devEndpoint) problems.push("NEON_DEV_ENDPOINT is not set, so there's nothing to compare DATABASE_URL against.");

const current = url ? endpointOf(url) : undefined;
console.log(`DATABASE_URL       → ${current ?? "(missing)"}`);
console.log(`NEON_DEV_ENDPOINT  → ${devEndpoint ?? "(missing)"}`);
console.log(`NEON_MAIN_ENDPOINT → ${mainEndpoint ?? "(missing)"}`);

if (current && current === mainEndpoint) problems.push("DATABASE_URL points at main (the live demo). Put the dev URL back in .env.local.");
else if (current && devEndpoint && current !== devEndpoint) problems.push("DATABASE_URL doesn't point at the dev branch.");

if (url && problems.length === 0) {
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    problems.push(`Couldn't connect to dev: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await pool.end();
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exit(1);
}
console.log("✓ DATABASE_URL points at dev and the guard is configured.");
