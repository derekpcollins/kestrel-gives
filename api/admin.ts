// /api/admin: the Admin Dashboard (SPEC §8, §7.1, §7.3–7.8; DECISIONS #107–#111). Admins only:
// anyone else gets 403. Acts as the viewer cookie's user, like every endpoint (the demo's mock
// login, SPEC §3.1).
// - GET `?view=summary|people|proofs|items|settings|templates`.
// - POST `{ action, … }`: approve-proof, reject-proof, remove-bid, cancel-purchase, cancel-item, save-settings,
//   save-template, restore-template, reset-year. Each answers with a message and the refreshed
//   view it changed, so the page redraws from one answer.
import { parseAdminAction, parseAdminView, type AdminAction } from "../lib/api/admin-requests.ts";
import { deleteOwnFiles } from "../lib/api/files.ts";
import { json, problem, readJson, withDatabase } from "../lib/api/http.ts";
import { actingUserIn, resolvePhoto } from "../lib/api/item-answer.ts";
import { adminPeopleIn, adminSummaryIn } from "../lib/data/admin.ts";
import { adminCancelItemIn, adminCancelPurchaseIn, adminItemsIn, adminRemoveBidIn } from "../lib/data/admin-items.ts";
import { adminProofsIn, approveProofIn, rejectProofIn } from "../lib/data/admin-proofs.ts";
import { adminSettingsIn, adminTemplatesIn, resetYearIn, restoreTemplateIn, saveSettingsIn, saveTemplateIn } from "../lib/data/admin-settings.ts";
import { withRetriedTransaction, withTransaction, type Tx } from "../lib/data/db.ts";
import { tryDemoLockIn } from "../lib/demo/restore.ts";
import { viewerIdFrom } from "../lib/demo/viewer.ts";
import { storageFor } from "../lib/storage/index.ts";
import { ADMIN_REFUSALS, type AdminRefusal } from "../src/components/admin-rules.ts";
import type { AdminView } from "../src/admin-api.ts";

const ADMINS_ONLY = "Only admins can use the Admin Dashboard.";

function readView(tx: Tx, view: AdminView): Promise<unknown> {
  switch (view) {
    case "summary": return adminSummaryIn(tx);
    case "people": return adminPeopleIn(tx);
    case "proofs": return adminProofsIn(tx, resolvePhoto);
    case "items": return adminItemsIn(tx, resolvePhoto);
    case "settings": return adminSettingsIn(tx);
    case "templates": return adminTemplatesIn(tx);
  }
}

export async function GET(request: Request): Promise<Response> {
  const view = parseAdminView(new URL(request.url).searchParams);
  if (typeof view !== "string") return problem(400, view.error);
  const cookieId = viewerIdFrom(request.headers.get("cookie"));
  return withDatabase("admin", (pool) =>
    withTransaction(pool, async (tx) => {
      const viewer = await actingUserIn(tx, cookieId);
      if (!viewer) return problem(503, "The demo has no people yet.");
      if (viewer.role !== "admin") return problem(403, ADMINS_ONLY, {}, { code: "admins-only" });
      const answer = await readView(tx, view);
      return answer ? json(answer) : problem(404, "There's no current event.");
    }),
  );
}

/** The view each action changes, sent back with its message. */
const VIEW_AFTER: Record<AdminAction["action"], AdminView> = {
  "approve-proof": "proofs", "reject-proof": "proofs", "remove-bid": "items", "cancel-item": "items", "cancel-purchase": "items",
  "save-settings": "settings", "save-template": "templates", "restore-template": "templates", "reset-year": "summary",
};

type Outcome = { ok: true; message: string; files?: string[] } | AdminRefusal | { ok: false; code: "invalid"; message: string; problems: unknown[] };

/** " 1 approved proof went back to review." when a total change re-opened any (SPEC §7.6). */
const reopened = (n: number) => (n === 0 ? "" : n === 1 ? " 1 approved proof went back to review." : ` ${n} approved proofs went back to review.`);

async function act(tx: Tx, adminId: string, a: AdminAction): Promise<Outcome> {
  switch (a.action) {
    case "approve-proof": {
      const r = await approveProofIn(tx, a.proofId, adminId, a.totalCents, a.fromStatus);
      return r.ok ? { ok: true, message: r.from === "rejected" ? "Proof approved instead. The rejection is cleared." : "Proof approved." } : r;
    }
    case "reject-proof": {
      const r = await rejectProofIn(tx, a.proofId, adminId, a.reason, a.fromStatus);
      return r.ok ? { ok: true, message: r.from === "approved" ? "Proof rejected instead. It's no longer confirmed, and they'll see your reason." : "Proof rejected. They'll see your reason." } : r;
    }
    case "remove-bid": {
      const r = await adminRemoveBidIn(tx, a.bidId, adminId);
      return r.ok ? { ok: true, message: `Bid removed. The top bid has been updated.${reopened(r.proofsReopened.length)}` } : r;
    }
    case "cancel-purchase": {
      const r = await adminCancelPurchaseIn(tx, a.purchaseId);
      return r.ok ? { ok: true, message: `Purchase cancelled.${r.restocked ? " The unit is back in stock." : ""}${reopened(r.proofsReopened.length)}` } : r;
    }
    case "cancel-item": {
      const r = await adminCancelItemIn(tx, a.itemId);
      return r.ok ? { ok: true, message: `Item cancelled. Its bids and purchases no longer count.${reopened(r.proofsReopened.length)}` } : r;
    }
    case "save-settings": {
      const r = await saveSettingsIn(tx, a.settings);
      return r.ok ? { ok: true, message: "Event settings saved." } : r;
    }
    case "save-template": {
      const r = await saveTemplateIn(tx, a.key, { subject: a.subject, body: a.body });
      return r.ok ? { ok: true, message: "Template saved." } : r;
    }
    case "restore-template": {
      const r = await restoreTemplateIn(tx, a.key);
      return r.ok ? { ok: true, message: "Template restored to its default." } : r;
    }
    case "reset-year": {
      // The demo lock keeps a Reset from racing a Restore, a Jump or a deploy.
      if (!(await tryDemoLockIn(tx))) return { ok: false, code: "busy", message: "Someone else is changing the demo right now. Try again in a moment." };
      const r = await resetYearIn(tx, a.confirmName);
      return r.ok ? { ok: true, message: `Reset done. ${r.eventName} is ready for its dates.`, files: r.files } : r;
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  const read = await readJson(request);
  if ("response" in read) return read.response;
  const action = parseAdminAction(read.body);
  if ("error" in action) return problem(400, action.error);
  const cookieId = viewerIdFrom(request.headers.get("cookie"));

  return withDatabase("admin", async (pool) => {
    // Reset touches every item table at once, so it retries on a deadlock like Restore (#105).
    const run = action.action === "reset-year" ? withRetriedTransaction : withTransaction;
    const result = await run(pool, async (tx) => {
      const viewer = await actingUserIn(tx, cookieId);
      if (!viewer) return problem(503, "The demo has no people yet.");
      if (viewer.role !== "admin") return problem(403, ADMINS_ONLY, {}, { code: "admins-only" });
      const outcome = await act(tx, viewer.id, action);
      if (!outcome.ok) {
        const { ok: _ok, message, ...details } = outcome;
        // A refusal rolls nothing back that matters: nothing was written before the check.
        return problem(ADMIN_REFUSALS[outcome.code], message, {}, details);
      }
      return outcome;
    });
    if (result instanceof Response) return result;
    let deleted = 0;
    if (result.files?.length) deleted = await deleteOwnFiles(storageFor(), result.files, "admin");
    console.log(`admin: ${action.action}${action.action === "reset-year" ? `; ${deleted} uploaded file(s) deleted` : ""}`);
    const view = VIEW_AFTER[action.action];
    const answer = await withTransaction(pool, (tx) => readView(tx, view));
    return json({ ok: true, message: result.message, view, answer });
  });
}
