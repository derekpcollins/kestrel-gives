// The Admin Dashboard's Reset for next year section: its words (SPEC §7.8; DECISIONS #109,
// #111, #118). No DOM, so node:test covers them. The lock and the name check themselves are
// in src/components/settings-rules.ts, shared with the server.
import type { AdminSummary } from "../admin-api.ts";
import { when } from "../components/phase-banner-rules.ts";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export interface ResetStatus {
  pill: { label: string; tone: "neutral" | "warning" };
  text: string;
}

/** Locked (and until when), or ready. The time reads in the event's zone, as the banner's do. */
export function resetStatus(summary: Pick<AdminSummary, "reset" | "now" | "event">): ResetStatus {
  const { reset } = summary;
  if (reset.unlocked) return { pill: { label: "Ready", tone: "warning" }, text: "Bidding closed more than 30 days ago, so Reset for next year is ready." };
  if (!reset.unlocksAt) {
    return { pill: { label: "Locked", tone: "neutral" }, text: "Reset for next year unlocks 30 days after bidding closes. This event has no close date yet." };
  }
  const at = when(new Date(reset.unlocksAt), new Date(summary.now), summary.event.timeZone);
  return { pill: { label: "Locked", tone: "neutral" }, text: `Reset for next year unlocks ${at}, 30 days after bidding closes.` };
}

/** "16 items with their 40 photos", "42 bids", … , or "Nothing yet" for an empty event. */
export function resetDeletes(counts: AdminSummary["reset"]["counts"]): string[] {
  const list = [
    counts.items ? `${plural(counts.items, "item")}${counts.photos ? ` with ${counts.items === 1 ? "its" : "their"} ${plural(counts.photos, "photo")}` : ""}` : "",
    counts.bids ? plural(counts.bids, "bid") : "",
    counts.purchases ? plural(counts.purchases, "purchase") : "",
    counts.proofs ? plural(counts.proofs, "proof") : "",
  ].filter(Boolean);
  return list.length ? list : ["Nothing yet: this event has no items, bids, purchases or proofs."];
}

/** What stays: the same list SPEC §7.8 gives, with next year's name. */
export function resetKeeps(eventName: string, nextName: string): string[] {
  return [
    "People and their roles",
    "The three charities",
    "Email templates",
    `Event settings, copied to ${nextName} with the dates cleared`,
    `${eventName}'s own record, which the app no longer shows`,
  ];
}

/** "16 items with their 40 photos, 42 bids and 9 purchases" */
function joined(parts: readonly string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export interface ResetDialog {
  title: string;
  body: string;
  confirmLabel: string;
  busyLabel: string;
  confirmText: string;
}

/** The type-to-confirm dialog: what goes, what stays, and that the demo is shared. */
export function resetDialog(summary: Pick<AdminSummary, "reset" | "event">): ResetDialog {
  const { counts, nextName } = summary.reset;
  const name = summary.event.name;
  const any = counts.items + counts.bids + counts.purchases + counts.proofs > 0;
  const deletes = any ? `This deletes ${joined(resetDeletes(counts))} from ${name}.` : `${name} has no items, bids, purchases or proofs to delete.`;
  return {
    title: "Reset for next year?",
    body: `${deletes} People, charities, email templates and settings stay, and ${nextName} starts with no dates. The demo is shared, so this empties it for everyone until someone restores the demo data. This can't be undone.`,
    confirmLabel: "Reset for next year",
    busyLabel: "Resetting…",
    confirmText: name,
  };
}
