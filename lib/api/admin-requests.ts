// Input checks for /api/admin (DECISIONS #111). Pure, so node:test covers them. Shape only: the
// field rules live in src/components (settings-rules, template-rules, admin-rules), shared
// with the admin pages.
import { asId } from "./item-requests.ts";
import type { AdminView } from "../../src/admin-api.ts";
import type { SettingsInput } from "../../src/components/settings-rules.ts";

export const ADMIN_VIEWS: readonly AdminView[] = ["summary", "people", "proofs", "items", "settings", "templates"];

export function parseAdminView(params: URLSearchParams): AdminView | { error: string } {
  const view = params.get("view") ?? "summary";
  return (ADMIN_VIEWS as readonly string[]).includes(view) ? (view as AdminView) : { error: `view must be one of ${ADMIN_VIEWS.join(", ")}.` };
}

export type AdminAction =
  | { action: "approve-proof"; proofId: string; totalCents: number }
  | { action: "reject-proof"; proofId: string; reason: string }
  | { action: "remove-bid"; bidId: string }
  | { action: "cancel-item"; itemId: string }
  | { action: "save-settings"; settings: SettingsInput }
  | { action: "save-template"; key: string; subject: string; body: string }
  | { action: "restore-template"; key: string }
  | { action: "reset-year"; confirmName: string };

const TEXT_MAX = 20_000;

function text(b: Record<string, unknown>, key: string, max = TEXT_MAX): string | null {
  const v = b[key];
  return typeof v === "string" && v.length <= max ? v : null;
}

function whole(b: Record<string, unknown>, key: string): number | null {
  const v = b[key];
  return typeof v === "number" && Number.isSafeInteger(v) ? v : null;
}

export function parseAdminAction(body: unknown): AdminAction | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { error: "Expected a JSON object." };
  const b = body as Record<string, unknown>;
  switch (b["action"]) {
    case "approve-proof": {
      const proofId = asId(b["proofId"]);
      const totalCents = whole(b, "totalCents");
      if (!proofId || totalCents === null) return { error: "approve-proof needs proofId and totalCents." };
      return { action: "approve-proof", proofId, totalCents };
    }
    case "reject-proof": {
      const proofId = asId(b["proofId"]);
      const reason = text(b, "reason", 2_000);
      if (!proofId || reason === null) return { error: "reject-proof needs proofId and reason." };
      return { action: "reject-proof", proofId, reason };
    }
    case "remove-bid": {
      const bidId = asId(b["bidId"]);
      return bidId ? { action: "remove-bid", bidId } : { error: "remove-bid needs bidId." };
    }
    case "cancel-item": {
      const itemId = asId(b["itemId"]);
      return itemId ? { action: "cancel-item", itemId } : { error: "cancel-item needs itemId." };
    }
    case "save-settings": {
      const s = b["settings"];
      if (typeof s !== "object" || s === null || Array.isArray(s)) return { error: "save-settings needs settings." };
      const o = s as Record<string, unknown>;
      const strings = ["name", "timeZone", "submissionsOpen", "biddingOpens", "biddingCloses", "givingPlatformUrl"] as const;
      const numbers = ["minStartingBidCents", "bidIncrementCents", "proofDeadlineDays"] as const;
      const out: Partial<SettingsInput> = {};
      for (const k of strings) {
        const v = text(o, k, 500);
        if (v === null) return { error: `settings.${k} must be text.` };
        out[k] = v;
      }
      for (const k of numbers) {
        const v = o[k];
        if (typeof v !== "number" || !Number.isFinite(v)) return { error: `settings.${k} must be a number.` };
        out[k] = v;
      }
      return { action: "save-settings", settings: out as SettingsInput };
    }
    case "save-template": {
      const key = text(b, "key", 40);
      const subject = text(b, "subject");
      const bodyText = text(b, "body");
      if (key === null || subject === null || bodyText === null) return { error: "save-template needs key, subject and body." };
      return { action: "save-template", key, subject, body: bodyText };
    }
    case "restore-template": {
      const key = text(b, "key", 40);
      return key === null ? { error: "restore-template needs key." } : { action: "restore-template", key };
    }
    case "reset-year": {
      const confirmName = text(b, "confirmName", 500);
      return confirmName === null ? { error: "reset-year needs confirmName." } : { action: "reset-year", confirmName };
    }
    default:
      return { error: "Unknown action." };
  }
}
