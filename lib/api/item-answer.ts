// What the item page needs in one answer (DECISIONS #87, #88): the item, the phase, the
// minimum bid and its hint, and whether the viewer can act. Served by GET /api/items?id= and
// returned after every bid or purchase, so the page redraws from one answer.
import type { Id, Tx } from "../data/db.ts";
import { currentEventIn, phaseOf } from "../data/event.ts";
import { itemDetailIn, type ResolvePhoto } from "../data/items.ts";
import { resolveViewer, type Person } from "../demo/viewer.ts";
import { photoUrl } from "../seed/photo-url.ts";
import { hasLocalCopy } from "./local-copy.ts";
import { bidBlock, bidHint, buyBlock, minimumBidCents } from "../../src/components/sale-rules.ts";
import type { ItemAnswer } from "../../src/items-api.ts";

/** The person acting: the viewer cookie's user, else Jules (lib/demo/viewer.ts). */
export async function actingUserIn(tx: Tx, cookieId: Id | null): Promise<Person | null> {
  const { rows } = await tx.query<{ id: Id; first_name: string; last_name: string; role: "admin" | "employee" }>(
    `SELECT id, first_name, last_name, role FROM users ORDER BY id`,
  );
  return resolveViewer(rows.map((u) => ({ id: u.id, firstName: u.first_name, lastName: u.last_name, role: u.role })), cookieId);
}

export const resolvePhoto: ResolvePhoto = (stored) => photoUrl(stored, process.env, hasLocalCopy);

export async function itemAnswerIn(tx: Tx, itemId: Id, viewerId: Id, resolve: ResolvePhoto = resolvePhoto): Promise<ItemAnswer | null> {
  const event = await currentEventIn(tx);
  if (!event) return null;
  const item = await itemDetailIn(tx, event.id, itemId, viewerId, resolve);
  if (!item) return null;
  const { rows: clock } = await tx.query<{ now: Date }>(`SELECT now() AS now`);
  const now = clock[0]!.now;
  const phase = phaseOf(event, now);
  const common = { phase, cancelled: item.cancelled, viewerIsSubmitter: item.submitter.id === viewerId };

  if (item.type === "auction") {
    const money = { startingBidCents: item.startingBidCents!, incrementCents: event.bidIncrementCents, highBidCents: item.highBidCents };
    return {
      ok: true, now: now.toISOString(), phase, incrementCents: event.bidIncrementCents, item,
      minimumBidCents: minimumBidCents(money), bidHint: bidHint(money),
      blocked: bidBlock({ ...common, ...money, viewerIsHighBidder: item.viewerIsTopBidder }),
    };
  }
  return {
    ok: true, now: now.toISOString(), phase, incrementCents: event.bidIncrementCents, item,
    minimumBidCents: null, bidHint: null,
    blocked: buyBlock({ ...common, remaining: item.remaining ?? 0 }),
  };
}
