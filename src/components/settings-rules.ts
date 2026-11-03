// Event settings rules (SPEC §7.1, v1.17; DECISIONS #108). Shared by the admin form and the
// server. No DOM. Admins enter dates in the event's time zone ("2026-11-14T09:00", the value of
// a datetime-local input); they are stored in UTC. A wall time that doesn't exist (the hour the
// clocks skip) is refused; one that happens twice (the hour they repeat) means the first.

export const SETTINGS_LIMITS = {
  nameMax: 80,
  urlMax: 300,
  proofDaysMin: 1,
  proofDaysMax: 60,
  /** Whole dollars, in cents: the same cap as an item's starting bid or price. */
  moneyMaxCents: 1_000_000,
} as const;

/** The giving platform stub inside this site (SPEC §3). */
export const GIVING_STUB = "/giving";

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DAY = 86_400_000;

export function isTimeZone(zone: string): boolean {
  if (!zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function wallParts(ms: number, zone: string): number[] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return [get("year"), get("month"), get("day"), get("hour"), get("minute")];
}

/** The zone's offset from UTC at that instant, in ms (wall clock minus UTC). */
function offsetAt(ms: number, zone: string): number {
  const [y, mo, d, h, mi] = wallParts(ms, zone) as [number, number, number, number, number];
  return Date.UTC(y, mo - 1, d, h, mi) - Math.floor(ms / 60_000) * 60_000;
}

/** "2026-11-14T09:00" for that instant on the zone's wall clock. */
export function toZonedLocal(date: Date, zone: string): string {
  const [y, mo, d, h, mi] = wallParts(date.getTime(), zone) as [number, number, number, number, number];
  const two = (n: number) => String(n).padStart(2, "0");
  return `${y}-${two(mo)}-${two(d)}T${two(h)}:${two(mi)}`;
}

/**
 * The UTC instant for a wall time in the zone, or null if the text isn't a date-time or that
 * time doesn't exist there. Assumes at most one clock change within a day either side.
 */
export function fromZonedLocal(local: string, zone: string): Date | null {
  const m = LOCAL.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null;
  const candidates = [...new Set([wall - offsetAt(wall - DAY, zone), wall - offsetAt(wall + DAY, zone)])]
    .filter((t) => toZonedLocal(new Date(t), zone) === local)
    .sort((a, b) => a - b);
  return candidates.length ? new Date(candidates[0]!) : null;
}

export interface SettingsInput {
  name: string;
  timeZone: string;
  /** Wall times in `timeZone`, or "" for not set. */
  submissionsOpen: string;
  biddingOpens: string;
  biddingCloses: string;
  minStartingBidCents: number;
  bidIncrementCents: number;
  proofDeadlineDays: number;
  /** An https address, "/giving", or "" for none. */
  givingPlatformUrl: string;
}

export type SettingsField = keyof SettingsInput;

export interface SettingsProblem {
  field: SettingsField;
  message: string;
}

export interface CleanSettings {
  name: string;
  timeZone: string;
  dates: { submissionsOpenAt: Date; biddingOpensAt: Date; biddingClosesAt: Date } | null;
  minStartingBidCents: number;
  bidIncrementCents: number;
  proofDeadlineDays: number;
  givingPlatformUrl: string | null;
}

function money(cents: number, label: string, field: SettingsField): SettingsProblem | null {
  if (!Number.isInteger(cents) || cents % 100 !== 0) return { field, message: "Whole dollars only." };
  if (cents < 100) return { field, message: `Enter a ${label} of at least $1.` };
  if (cents > SETTINGS_LIMITS.moneyMaxCents) return { field, message: `Enter a ${label} of $${(SETTINGS_LIMITS.moneyMaxCents / 100).toLocaleString("en-US")} or less.` };
  return null;
}

/** "https://…", "/giving" or "": anything else is refused. */
export function givingUrlProblem(raw: string): string | null {
  const url = raw.trim();
  if (!url || url === GIVING_STUB) return null;
  if (url.length > SETTINGS_LIMITS.urlMax) return `Keep the address to ${SETTINGS_LIMITS.urlMax} characters.`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && parsed.hostname.includes(".")) return null;
  } catch {
    // falls through
  }
  return `Enter an address that starts with https://, or ${GIVING_STUB} for this demo's stand-in page.`;
}

/** Checks the whole form; either every problem by field or the values to store. */
export function checkSettings(input: SettingsInput): { problems: SettingsProblem[] } | { settings: CleanSettings } {
  const problems: SettingsProblem[] = [];
  const name = input.name.trim();
  if (!name) problems.push({ field: "name", message: "Enter the event's name." });
  else if (name.length > SETTINGS_LIMITS.nameMax) problems.push({ field: "name", message: `Keep the name to ${SETTINGS_LIMITS.nameMax} characters.` });

  const zoneOk = isTimeZone(input.timeZone);
  if (!zoneOk) problems.push({ field: "timeZone", message: "Choose a time zone from the list." });

  const fields = ["submissionsOpen", "biddingOpens", "biddingCloses"] as const;
  const filled = fields.filter((f) => input[f].trim() !== "");
  let dates: CleanSettings["dates"] = null;
  if (filled.length > 0 && filled.length < 3) {
    for (const f of fields) if (!input[f].trim()) problems.push({ field: f, message: "Set all three dates, or leave all three empty." });
  } else if (filled.length === 3 && zoneOk) {
    const parsed = fields.map((f) => {
      const at = fromZonedLocal(input[f].trim(), input.timeZone);
      if (!at) {
        problems.push({
          field: f,
          message: LOCAL.test(input[f].trim()) ? `That time doesn't exist in ${input.timeZone}, because the clocks change. Pick another time.` : "Enter a date and time.",
        });
      }
      return at;
    });
    const [open, opens, closes] = parsed;
    if (open && opens && closes) {
      if (opens < open) problems.push({ field: "biddingOpens", message: "Bidding can't open before submissions open." });
      if (closes <= opens) problems.push({ field: "biddingCloses", message: "Bidding has to close after it opens." });
      dates = { submissionsOpenAt: open, biddingOpensAt: opens, biddingClosesAt: closes };
    }
  }

  const minBid = money(input.minStartingBidCents, "minimum starting bid", "minStartingBidCents");
  if (minBid) problems.push(minBid);
  const increment = money(input.bidIncrementCents, "bid increment", "bidIncrementCents");
  if (increment) problems.push(increment);
  const days = input.proofDeadlineDays;
  if (!Number.isInteger(days) || days < SETTINGS_LIMITS.proofDaysMin || days > SETTINGS_LIMITS.proofDaysMax) {
    problems.push({ field: "proofDeadlineDays", message: `Enter a whole number of days from ${SETTINGS_LIMITS.proofDaysMin} to ${SETTINGS_LIMITS.proofDaysMax}.` });
  }
  const url = givingUrlProblem(input.givingPlatformUrl);
  if (url) problems.push({ field: "givingPlatformUrl", message: url });

  if (problems.length) return { problems };
  return {
    settings: {
      name, timeZone: input.timeZone, dates,
      minStartingBidCents: input.minStartingBidCents, bidIncrementCents: input.bidIncrementCents,
      proofDeadlineDays: days, givingPlatformUrl: input.givingPlatformUrl.trim() || null,
    },
  };
}

/** The next year's event name for Reset: the last four-digit year goes up by one. */
export function nextEventName(name: string): string {
  const m = /^(.*?)(\d{4})(\D*)$/.exec(name);
  if (m) return `${m[1]}${Number(m[2]) + 1}${m[3]}`;
  return `${name} (next year)`.slice(0, SETTINGS_LIMITS.nameMax);
}

/** Reset unlocks this long after bidding closes (SPEC §7.8). */
export const RESET_AFTER_DAYS = 30;

export function resetUnlocksAt(biddingClosesAt: Date | null): Date | null {
  return biddingClosesAt ? new Date(biddingClosesAt.getTime() + RESET_AFTER_DAYS * DAY) : null;
}

/** The typed confirmation must be the event's name (spaces at the ends ignored). */
export function resetNameMatches(typed: string, name: string): boolean {
  return typed.trim() === name.trim();
}
