// What the phase banner says (SPEC §8 › Phase banners, §7.1). Pure: no DOM, so node:test
// covers it. Times are stored in UTC and shown in the viewer's time zone with the zone
// labeled (SPEC §7.1); the zone is a parameter so tests can pin it.
import type { EventView } from "../app-state.ts";

export interface PhaseBannerText {
  title: string;
  text: string;
  /** An icon name from icons.ts (kept as a plain union so this file stays DOM-free for the server's type check). */
  icon: "clock" | "alert" | "check";
  /** Ending soon: drawn with the bright treatment in both modes. */
  urgent?: boolean;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const LOCALE = "en-US";

export type BannerEvent = Pick<EventView, "phase" | "endingSoon" | "biddingOpensAt" | "biddingClosesAt" | "proofDeadline"> & Partial<Pick<EventView, "name" | "submissionsOpenAt">>;

/** Which sale the page is about: the live and ending-soon wording follows it (owner, 4E). */
export type BannerSale = "auction" | "instant";

/**
 * The banner for the event right now, or null if there's no event. While the event is live,
 * Instant Sale and instant-sale item pages talk about the sale ("The instant sale is open.
 * It ends in 47 hours, on …"); every other page talks about bidding. Submission and ended are
 * the same everywhere.
 */
export function phaseBanner(event: BannerEvent | null, now: Date, timeZone?: string, sale: BannerSale = "auction"): PhaseBannerText | null {
  if (!event) return null;
  const at = (iso: string | null) => (iso ? new Date(iso) : null);
  const opens = at(event.biddingOpensAt);
  const closes = at(event.biddingClosesAt);
  const deadline = at(event.proofDeadline);

  if (event.phase === "unscheduled") {
    return { title: "Not scheduled yet", text: `Dates for ${event.name ?? "this year's event"} aren't set yet. Check back soon.`, icon: "clock" };
  }
  if (event.phase === "upcoming") {
    const start = at(event.submissionsOpenAt ?? null);
    return { title: "Submissions open soon", text: start ? `Submissions open ${when(start, now, timeZone)}.` : "Submissions aren't open yet.", icon: "clock" };
  }
  if (event.phase === "submission") {
    return {
      title: "Submissions are open",
      text: opens ? `Submit an item until bidding opens ${when(opens, now, timeZone)}.` : "Submit an item for this year's auction.",
      icon: "clock",
    };
  }
  if (event.phase === "live") {
    const instant = sale === "instant";
    if (!closes) {
      return instant
        ? { title: "The instant sale is open", text: "Buy instant-sale items while they last.", icon: "clock" }
        : { title: "Bidding is open", text: "Place bids and claim instant-sale items.", icon: "clock" };
    }
    const left = durationWords(closes.getTime() - now.getTime());
    const close = when(closes, now, timeZone);
    if (event.endingSoon) {
      return instant
        ? { title: "The instant sale ends soon", text: `It closes in ${left}, ${close}.`, icon: "alert", urgent: true }
        : { title: "Bidding ends soon", text: `Bidding closes in ${left}, ${close}.`, icon: "alert", urgent: true };
    }
    return instant
      ? { title: "The instant sale is open", text: `It ends in ${left}, ${close}.`, icon: "clock" }
      : { title: "Bidding is open", text: `Bidding ends in ${left}, ${close}.`, icon: "clock" };
  }
  if (deadline && deadline.getTime() > now.getTime()) {
    return { title: "Bidding has ended", text: `Winners, please donate and upload proof by ${when(deadline, now, timeZone, false)}.`, icon: "check" };
  }
  return {
    title: "Bidding has ended",
    text: deadline ? `The proof deadline was ${dateWords(deadline, now, timeZone)}. Thanks to everyone who took part.` : "Thanks to everyone who took part.",
    icon: "check",
  };
}

/**
 * "3 days", "47 hours", "1 hour", "45 minutes": rounded down, so it never overstates the
 * time left. Whole days only from 48 hours up (owner, 3B review); below that, hours.
 */
export function durationWords(ms: number): string {
  if (ms >= 2 * DAY) return `${Math.floor(ms / DAY)} days`;
  if (ms >= 2 * HOUR) return `${Math.floor(ms / HOUR)} hours`;
  if (ms >= HOUR) return "1 hour";
  const minutes = Math.max(1, Math.floor(ms / MINUTE));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/**
 * "today at 1:00 PM EST", "tomorrow at …", or "on Wednesday, November 4 at 1:00 PM EST".
 * `on` is false where the sentence already has a preposition ("by Monday, November 9 …").
 */
export function when(date: Date, now: Date, timeZone?: string, on = true): string {
  const time = new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone }).format(date);
  const days = calendarDaysBetween(now, date, timeZone);
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  return `${on ? "on " : ""}${dateWords(date, now, timeZone)} at ${time}`;
}

/** "Wednesday, November 4", with the year only when it isn't the current one. */
export function dateWords(date: Date, now: Date, timeZone?: string): string {
  const sameYear = ymd(date, timeZone).slice(0, 4) === ymd(now, timeZone).slice(0, 4);
  return new Intl.DateTimeFormat(LOCALE, { weekday: "long", month: "long", day: "numeric", year: sameYear ? undefined : "numeric", timeZone }).format(date);
}

function ymd(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(date);
}

function calendarDaysBetween(from: Date, to: Date, timeZone?: string): number {
  const day = (d: Date) => Date.parse(`${ymd(d, timeZone)}T00:00:00Z`) / DAY;
  return Math.round(day(to) - day(from));
}
