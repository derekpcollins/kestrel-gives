// Every database script resolves its connection through here, so local work and
// tests can't touch the live demo (main) by accident (SPEC §4, DECISIONS #25).
import { endpointOf } from "../lib/db-endpoint.ts";

export { endpointOf };

export function databaseUrl(argv: readonly string[] = process.argv): string {
  const url = process.env["DATABASE_URL"];
  if (!url) fail("DATABASE_URL is not set. Run with --env-file=.env.local.");

  const mainEndpoint = process.env["NEON_MAIN_ENDPOINT"];
  if (!mainEndpoint) fail("NEON_MAIN_ENDPOINT is not set, so the main-branch guard can't run. Add it to .env.local.");

  if (endpointOf(url) === mainEndpoint && !argv.includes("--allow-main")) {
    fail("Refusing to run against the main (live demo) branch. Pass --allow-main if that's intended.");
  }
  return url;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
