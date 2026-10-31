// Identifies which Neon branch a connection string points at, by endpoint ID.
// Endpoint IDs stay server-side: public responses only ever get the label.

export type DatabaseLabel = "main" | "dev" | "unknown";

// Neon's pooled hosts add "-pooler" to the endpoint ID; strip it so both forms compare equal.
export function endpointOf(url: string): string {
  const label = new URL(url).hostname.split(".")[0] ?? "";
  return label.replace(/-pooler$/, "");
}

export function databaseLabel(url: string, env: Readonly<Record<string, string | undefined>>): DatabaseLabel {
  const endpoint = endpointOf(url);
  if (endpoint === env["NEON_MAIN_ENDPOINT"]) return "main";
  if (endpoint === env["NEON_DEV_ENDPOINT"]) return "dev";
  return "unknown";
}
