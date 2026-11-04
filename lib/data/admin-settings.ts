// The Admin Dashboard's Event settings, Email templates and Reset for next year (SPEC §7.1,
// §7.7, §7.8; DECISIONS #116, #118). Split from lib/data/admin.ts.

import type { Id, Tx } from "./db.ts";
import { currentEventIn } from "./event.ts";
import { setEventDatesIn } from "./event-dates.ts";
import { isTemplateKey, TEMPLATE_DEFAULTS, TEMPLATE_KEYS } from "../email-templates.ts";
import type { AdminRefusal } from "../../src/components/admin-rules.ts";
import { checkSettings, nextEventName, resetNameMatches, resetUnlocksAt, toZonedLocal, type SettingsInput, type SettingsProblem } from "../../src/components/settings-rules.ts";
import { templateProblems, type TemplateFields, type TemplateProblem } from "../../src/components/template-rules.ts";
import type { AdminSettings, AdminTemplates } from "../../src/admin-api.ts";
import { dbNow, refuse } from "./admin.ts";

// Event settings

export async function adminSettingsIn(tx: Tx): Promise<AdminSettings | null> {
  const event = await currentEventIn(tx);
  if (!event) return null;
  const now = await dbNow(tx);
  const local = (d: Date | null) => (d ? toZonedLocal(d, event.timeZone) : "");
  return {
    ok: true,
    now: now.toISOString(),
    values: {
      name: event.name, timeZone: event.timeZone,
      submissionsOpen: local(event.submissionsOpenAt), biddingOpens: local(event.biddingOpensAt), biddingCloses: local(event.biddingClosesAt),
      minStartingBidCents: event.minStartingBidCents, bidIncrementCents: event.bidIncrementCents,
      proofDeadlineDays: event.proofDeadlineDays, givingPlatformUrl: event.givingPlatformUrl ?? "",
    },
  };
}

/**
 * Saves the event settings (SPEC §7.1). Dates arrive as wall times in the chosen zone. New
 * dates go through setEventDatesIn, the same path Jump to uses, so winners are cleared or
 * finalized to match and proofs re-checked.
 */
export async function saveSettingsIn(tx: Tx, input: SettingsInput): Promise<{ ok: true } | AdminRefusal | { ok: false; code: "invalid"; message: string; problems: SettingsProblem[] }> {
  const checked = checkSettings(input);
  if ("problems" in checked) return { ok: false, code: "invalid", message: "Check the highlighted fields.", problems: checked.problems };
  const { rows } = await tx.query<{ id: Id }>(`SELECT id FROM events WHERE is_current FOR UPDATE`);
  const eventId = rows[0]?.id;
  if (!eventId) return refuse("not-found", "There's no current event.");
  const s = checked.settings;
  await tx.query(
    `UPDATE events SET name = $2, time_zone = $3, min_starting_bid_cents = $4, bid_increment_cents = $5,
            proof_deadline_days = $6, giving_platform_url = $7 WHERE id = $1`,
    [eventId, s.name, s.timeZone, s.minStartingBidCents, s.bidIncrementCents, s.proofDeadlineDays, s.givingPlatformUrl],
  );
  await setEventDatesIn(tx, eventId, s.dates, await dbNow(tx));
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Email templates

export async function adminTemplatesIn(tx: Tx): Promise<AdminTemplates> {
  const { rows } = await tx.query<{ key: string; subject: string; body: string; updated_at: Date }>(`SELECT key, subject, body, updated_at FROM email_templates`);
  const stored = new Map(rows.map((r) => [r.key, r]));
  return {
    ok: true,
    templates: TEMPLATE_KEYS.flatMap((key) => {
      const row = stored.get(key);
      if (!row) return [];
      const d = TEMPLATE_DEFAULTS[key];
      return [{
        key, label: d.label, subject: row.subject, body: row.body, variables: [...d.variables],
        isDefault: row.subject === d.subject && row.body === d.body, updatedAt: row.updated_at.toISOString(),
      }];
    }),
  };
}

export async function saveTemplateIn(tx: Tx, key: string, fields: TemplateFields): Promise<{ ok: true } | AdminRefusal | { ok: false; code: "invalid"; message: string; problems: TemplateProblem[] }> {
  if (!isTemplateKey(key)) return refuse("not-found", "That template doesn't exist.");
  const problems = templateProblems(fields, TEMPLATE_DEFAULTS[key].variables);
  if (problems.length) return { ok: false, code: "invalid", message: "Check the highlighted fields.", problems };
  const done = await tx.query(`UPDATE email_templates SET subject = $2, body = $3, updated_at = now() WHERE key = $1`, [key, fields.subject.trim(), fields.body.trim()]);
  if (done.rowCount === 0) return refuse("not-found", "That template doesn't exist.");
  return { ok: true };
}

export async function restoreTemplateIn(tx: Tx, key: string): Promise<{ ok: true } | AdminRefusal> {
  if (!isTemplateKey(key)) return refuse("not-found", "That template doesn't exist.");
  const d = TEMPLATE_DEFAULTS[key];
  const done = await tx.query(`UPDATE email_templates SET subject = $2, body = $3, updated_at = now() WHERE key = $1`, [key, d.subject, d.body]);
  if (done.rowCount === 0) return refuse("not-found", "That template doesn't exist.");
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Reset for next year

export interface ResetDone {
  ok: true;
  eventId: Id;
  eventName: string;
  /** Uploaded files to delete after the commit (lib/api/files.ts keeps to this environment's own). */
  files: string[];
}

/**
 * Reset for next year (SPEC §7.8). The caller holds the demo lock, so it can't race a Restore
 * or a Jump. Locked until 30 days after bidding closes (database clock); the admin types the
 * event's name. Wipes this event's items, photos, bids, purchases and proofs, and every upload
 * record; keeps people, charities, templates and the old event; adds next year's event with
 * the settings copied and no dates, so it starts "Not scheduled yet" (v1.17).
 */
export async function resetYearIn(tx: Tx, typedName: string): Promise<ResetDone | AdminRefusal> {
  const { rows } = await tx.query<{ id: Id; name: string; bidding_closes_at: Date | null }>(
    `SELECT id, name, bidding_closes_at FROM events WHERE is_current FOR UPDATE`,
  );
  const event = rows[0];
  if (!event) return refuse("not-found", "There's no current event.");
  const unlocks = resetUnlocksAt(event.bidding_closes_at);
  const now = await dbNow(tx);
  if (!unlocks || now < unlocks) {
    return refuse("locked", unlocks ? "Reset for next year unlocks 30 days after bidding closes." : "Reset for next year unlocks 30 days after bidding closes, and this event has no close date.");
  }
  if (!resetNameMatches(typedName, event.name)) return refuse("wrong-name", `Type the event's name, ${event.name}, to confirm.`);

  const { rows: files } = await tx.query<{ path: string }>(
    `SELECT pathname AS path FROM uploads
     UNION SELECT p.path FROM item_photos p JOIN items i ON i.id = p.item_id WHERE i.event_id = $1 AND p.source = 'upload'
     UNION SELECT image_path FROM proofs WHERE event_id = $1 AND image_path NOT LIKE '/seed/%'`,
    [event.id],
  );
  await tx.query(`UPDATE items SET winning_bid_id = NULL WHERE event_id = $1 AND winning_bid_id IS NOT NULL`, [event.id]);
  await tx.query(`DELETE FROM proofs WHERE event_id = $1`, [event.id]);
  await tx.query(`DELETE FROM purchases p USING items i WHERE i.id = p.item_id AND i.event_id = $1`, [event.id]);
  await tx.query(`DELETE FROM bids b USING items i WHERE i.id = b.item_id AND i.event_id = $1`, [event.id]);
  await tx.query(`DELETE FROM items WHERE event_id = $1`, [event.id]); // photos cascade
  await tx.query(`DELETE FROM uploads`);
  await tx.query(`UPDATE events SET is_current = false WHERE id = $1`, [event.id]);
  const name = nextEventName(event.name);
  const { rows: added } = await tx.query<{ id: Id }>(
    `INSERT INTO events (name, time_zone, min_starting_bid_cents, bid_increment_cents, proof_deadline_days, giving_platform_url, is_current)
     SELECT $2, time_zone, min_starting_bid_cents, bid_increment_cents, proof_deadline_days, giving_platform_url, true
       FROM events WHERE id = $1
     RETURNING id`,
    [event.id, name],
  );
  return { ok: true, eventId: added[0]!.id, eventName: name, files: files.map((f) => f.path) };
}
