// The Admin Dashboard's Event settings and Email templates sections: their words and choices
// (SPEC §7.1, §7.7; DECISIONS #108, #111, #116). No DOM, so node:test covers them. The field
// rules themselves are shared with the server (src/components/settings-rules.ts and
// template-rules.ts), so the form and the API can't disagree.
import type { Phase } from "../components/item-tile-rules.ts";
import { fromZonedLocal, toZonedLocal, type SettingsInput } from "../components/settings-rules.ts";
import { fillTemplate, tokenProblems, type Variable } from "../components/template-rules.ts";

// ---------------------------------------------------------------------------------------------
// Event settings

/** The phase the saved dates would put the event in at `now`: the same rule as the server's phaseOf. */
export function phaseFor(values: Pick<SettingsInput, "timeZone" | "submissionsOpen" | "biddingOpens" | "biddingCloses">, now: Date): Phase | null {
  const raw = [values.submissionsOpen, values.biddingOpens, values.biddingCloses].map((v) => v.trim());
  if (raw.every((v) => v === "")) return "unscheduled";
  if (raw.some((v) => v === "")) return null;
  const [open, opens, closes] = raw.map((v) => fromZonedLocal(v, values.timeZone));
  if (!open || !opens || !closes) return null;
  const t = now.getTime();
  if (t < open.getTime()) return "upcoming";
  if (t < opens.getTime()) return "submission";
  if (t < closes.getTime()) return "live";
  return "ended";
}

export const PHASE_NAMES: Readonly<Record<Phase, string>> = {
  unscheduled: "Not scheduled yet",
  upcoming: "Before submissions open",
  submission: "Submissions open",
  live: "Bidding is open",
  ended: "Bidding has ended",
};

export interface SaveConfirm {
  variant: "confirm" | "danger";
  title: string;
  body: string;
  confirmLabel: string;
}

/**
 * When saving moves the event to another phase, say what changes before it happens (the dates
 * drive everything, SPEC §7.1). Null when the phase stays the same.
 */
export function phaseChange(before: Phase, after: Phase): SaveConfirm | null {
  if (before === after) return null;
  const move = `This moves the event from "${PHASE_NAMES[before]}" to "${PHASE_NAMES[after]}" as soon as you save.`;
  if (after === "ended") {
    return { variant: "danger", title: "Save and end bidding now?", confirmLabel: "Save and end bidding",
      body: `${move} The close time has passed, so bidding ends, winners are chosen, and the proof deadline starts.` };
  }
  if (before === "ended") {
    return { variant: "danger", title: "Save and reopen the event?", confirmLabel: "Save and reopen",
      body: `${move} The winners are cleared and chosen again at the new close, and approved proofs that no longer match a total go back to review.` };
  }
  if (after === "unscheduled") {
    return { variant: "danger", title: "Save without dates?", confirmLabel: "Save without dates",
      body: `${move} Employees can't submit, bid or buy until the dates are set again.` };
  }
  if (after === "live") {
    return { variant: "confirm", title: "Save and open bidding now?", confirmLabel: "Save and open bidding",
      body: `${move} Everyone can bid and buy right away.` };
  }
  return { variant: "confirm", title: "Save and change the phase?", confirmLabel: "Save settings",
    body: `${move} ${after === "submission" ? "Employees can submit items; bidding waits for its date." : "Employees can't submit, bid or buy until submissions open."}` };
}

function zonePart(zone: string, style: "short" | "longGeneric", at: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: style }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
}

/** The city in an IANA id: "America/New_York" → "New York", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
const cityOf = (zone: string) => zone.slice(zone.lastIndexOf("/") + 1).replaceAll("_", " ");

/**
 * A zone's friendly name, "Eastern Time (New York)" (owner, 6E review). The stored value stays
 * the IANA id. Zones the browser only names by offset read "GMT+03:00 (Istanbul)"; UTC is
 * "Coordinated Universal Time". An unknown id is shown as it is.
 */
export function zoneName(zone: string, at = new Date()): string {
  let generic = "";
  try {
    generic = zonePart(zone, "longGeneric", at);
  } catch {
    return zone;
  }
  const city = cityOf(zone);
  if (zone === "UTC" || zone === "Etc/UTC") return "Coordinated Universal Time";
  if (!generic || generic.includes(city)) return generic || zone;
  return `${generic} (${city})`;
}

/** The zone named in passing: "Eastern" for Eastern Time, "GMT+3" where the browser has no name. */
function zoneWord(zone: string, at: Date): string {
  const generic = zonePart(zone, "longGeneric", at);
  if (!generic || generic.startsWith("GMT")) return zonePart(zone, "short", at);
  return generic.replace(/ (Standard )?Time$/, "");
}

/** "Times are in Eastern Time (New York), currently EST." for the dates' help line. */
export function zoneHelp(zone: string, now: Date): string {
  let short = "";
  try {
    short = zonePart(zone, "short", now);
  } catch {
    return "Choose a time zone first.";
  }
  return `Times are in ${zoneName(zone, now)}${short ? `, currently ${short}` : ""}. Set all three, or leave all three empty for "Not scheduled yet".`;
}

/** "9:00 PM", or "midnight" and "noon" on the hour. */
function clockWords(date: Date, zone: string): string {
  const local = toZonedLocal(date, zone).slice(11, 16);
  if (local === "00:00") return "midnight";
  if (local === "12:00") return "noon";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(date);
}

/**
 * Under the dates, once the time zone is changed and the dates are set (owner, 6E review;
 * DECISIONS entry 116 keeps the typed wall times): what the close becomes, and what that is in the
 * saved zone. "Bidding now closes at 9:00 PM PST (Dec 6 at midnight Eastern)." The date shows
 * in the brackets only when the two zones are on different days. Null otherwise.
 */
export function zoneEffect(savedZone: string, values: Pick<SettingsInput, "timeZone" | "submissionsOpen" | "biddingOpens" | "biddingCloses">): string | null {
  const zone = values.timeZone;
  if (!zone || zone === savedZone) return null;
  if ([values.submissionsOpen, values.biddingOpens, values.biddingCloses].some((v) => !v.trim())) return null;
  let closes: Date | null = null;
  try {
    closes = fromZonedLocal(values.biddingCloses.trim(), zone);
  } catch {
    return null;
  }
  if (!closes) return null;
  const there = toZonedLocal(closes, savedZone);
  const day = there.slice(0, 10) === values.biddingCloses.trim().slice(0, 10) ? ""
    : `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: savedZone }).format(closes)} at `;
  return `Bidding now closes at ${clockWords(closes, zone)} ${zonePart(zone, "short", closes)} (${day}${clockWords(closes, savedZone)} ${zoneWord(savedZone, closes)}).`;
}

/** Every IANA zone the browser knows, with the current one kept even if it doesn't, by friendly name. */
export function timeZones(current: string, known: readonly string[], at = new Date()): { value: string; label: string }[] {
  const list = [...known];
  if (current && !list.includes(current)) list.unshift(current);
  return list.map((value) => ({ value, label: zoneName(value, at) })).sort((a, b) => a.label.localeCompare(b.label, "en-US"));
}

/** Labels, help and the name used in messages, by field (DESIGN-SYSTEM.md › Form field). */
export const SETTINGS_TEXT = {
  name: { label: "Event name", help: "Shown in the header, the phase banner and Reset." },
  timeZone: { label: "Time zone", help: "Dates are entered and stored in this zone; everyone sees times in their own zone." },
  dates: { legend: "Dates" },
  submissionsOpen: { label: "Submissions open" },
  biddingOpens: { label: "Bidding opens" },
  biddingCloses: { label: "Bidding closes" },
  minStartingBidCents: { label: "Default minimum starting bid", help: "Whole dollars. A silent auction item's starting bid can't be lower." },
  bidIncrementCents: { label: "Bid increment", help: "Whole dollars. Each bid must beat the top bid by at least this much." },
  proofDeadlineDays: { label: "Proof deadline", help: "Days after bidding closes. Winners and buyers upload proof by then." },
  givingPlatformUrl: { label: "Giving platform address", help: "Where people donate. An https:// address, or /giving for this demo's stand-in page. Leave empty for none." },
} as const;

// ---------------------------------------------------------------------------------------------
// Email templates

/** When a real deployment would send each template. Nothing is sent here (SPEC §7.7). */
export const TEMPLATE_WHEN: Readonly<Record<string, string>> = {
  bid_receipt: "After someone places a bid.",
  outbid: "When someone's bid is beaten.",
  winner: "When bidding closes, to each winner.",
  purchase_receipt: "After someone buys an instant-sale item.",
  proof_rejected: "When an admin rejects a proof.",
  item_cancelled: "When an admin cancels an item someone bid on or bought.",
};

/** What each variable stands for, in the Insert variable menu. */
export const VARIABLE_TEXT: Readonly<Record<Variable, string>> = {
  first_name: "first name",
  item_name: "item name",
  amount: "the bid or price",
  donation_total: "their donation total",
  proof_deadline: "the proof deadline",
  rejection_reason: "why the proof was rejected",
};

export interface TemplatePreview {
  subject: string;
  body: string;
}

/** The live preview: sample seed data in place of each variable (SPEC §7.7). */
export function preview(subject: string, body: string): TemplatePreview {
  return { subject: fillTemplate(subject), body: fillTemplate(body) };
}

/** Inline problems while typing: only the variable checks (empty fields are reported on save). */
export function liveProblems(text: string, allowed: readonly Variable[]): string | null {
  const problems = tokenProblems(text, allowed);
  return problems.length ? problems.join(" ") : null;
}

export function templateStatus(isDefault: boolean): { label: string; tone: "neutral" | "warning" } {
  return isDefault ? { label: "Default", tone: "neutral" } : { label: "Edited", tone: "warning" };
}

export function restoreDialog(label: string): SaveConfirm & { cancelLabel: string } {
  return {
    variant: "danger", title: `Restore the default ${label} template?`, confirmLabel: "Restore default", cancelLabel: "Keep my version",
    body: "Its subject and body go back to the default words. Your changes to this template are replaced. This can't be undone.",
  };
}
