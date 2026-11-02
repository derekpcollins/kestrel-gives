// Request checks for the demo endpoints (DECISIONS #80, #81). Pure, so node:test covers them.
import { timingSafeEqual } from "node:crypto";
import { isJumpTarget, type JumpTarget } from "./jump.ts";

export type DemoAction =
  | { action: "view-as"; userId: string }
  | { action: "jump"; to: JumpTarget }
  | { action: "restore" };

/** The demo action in a POST body, or a message saying what's wrong with it. */
export function parseDemoAction(body: unknown): DemoAction | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { error: "Expected a JSON object." };
  const b = body as Record<string, unknown>;
  switch (b["action"]) {
    case "view-as": {
      const id = b["userId"];
      const text = typeof id === "number" && Number.isSafeInteger(id) ? String(id) : id;
      return typeof text === "string" && /^[1-9]\d{0,17}$/.test(text) ? { action: "view-as", userId: text } : { error: "userId must be a user id." };
    }
    case "jump":
      return isJumpTarget(b["to"]) ? { action: "jump", to: b["to"] } : { error: "to must be submission, live, ending-soon, ended or after." };
    case "restore":
      return { action: "restore" };
    default:
      return { error: "action must be view-as, jump or restore." };
  }
}

/** True for a JSON content type (with or without a charset). Blocks simple cross-site form posts. */
export function isJsonRequest(contentType: string | null): boolean {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() === "application/json";
}

/**
 * Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. Fails closed: with no secret
 * configured nothing is authorized. Compared in constant time.
 */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
