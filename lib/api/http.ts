// Shared bits for Vercel Functions: JSON responses that are never cached, and a database
// pool per request (Neon's serverless Pool over WebSocket; ended when the request is done).
import { Pool } from "@neondatabase/serverless";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function problem(status: number, error: string, headers: Record<string, string> = {}): Response {
  return json({ ok: false, error }, status, headers);
}

/** Cookies get Secure on https (deployed), not on plain http (vercel dev on localhost). */
export function isHttps(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

/**
 * Runs work with a pool on the pooled DATABASE_URL, and always ends it. Returns 503 if the
 * database isn't configured and 500 on any other failure. Driver messages can include host
 * details, so the log gets only the error's name and Postgres code.
 */
export async function withDatabase(label: string, work: (pool: Pool) => Promise<Response>): Promise<Response> {
  const url = process.env["DATABASE_URL"];
  if (!url) return problem(503, "Database not configured.");
  const pool = new Pool({ connectionString: url });
  try {
    return await work(pool);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    console.error(`${label}: failed: ${error instanceof Error ? error.name : "unknown error"}${typeof code === "string" ? ` (${code})` : ""}`);
    return problem(500, "Something went wrong. Please try again.");
  } finally {
    await pool.end();
  }
}
