// Every database script resolves its connection through here, so local work and
// tests can't touch the live demo (main) by accident (SPEC §4, DECISIONS #25).

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

// Neon's pooled hosts add "-pooler" to the endpoint ID; strip it so both forms compare equal.
// Endpoint IDs aren't secret, so this is what scripts print instead of the URL.
export function endpointOf(url: string): string {
  const label = new URL(url).hostname.split(".")[0] ?? "";
  return label.replace(/-pooler$/, "");
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
