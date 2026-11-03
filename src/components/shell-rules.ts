// The shell's rules (SPEC §3.1, §8): which nav links show in each phase and which Jump to
// button is pressed. Pure, with no DOM, so node:test covers them.
import type { EventView } from "../app-state.ts";

/** "item" is an item page: no nav link is the current page there. */
export type PageKey = "home" | "silent-auction" | "instant-sale" | "your-items" | "submit" | "admin" | "item";

const PAGE_KEYS: readonly PageKey[] = ["home", "silent-auction", "instant-sale", "your-items", "submit", "admin", "item"];

/**
 * Which page the nav treats as current, from the body's data-page and the path. Edit item
 * shares the submit page's HTML, but it's an item's page, not Submit an Item, so no nav
 * link is current there.
 */
export function pageKeyFor(dataPage: string | undefined, path: string): PageKey {
  const page = PAGE_KEYS.find((p) => p === dataPage) ?? "home";
  return page === "submit" && /^\/items\/[^/]+\/edit\/?$/.test(path) ? "item" : page;
}

export interface NavLink {
  key: PageKey;
  label: string;
  href: string;
}

/** The main nav's links for this phase, in SPEC §8's order. */
export function navLinks(phase: string | undefined): NavLink[] {
  const links: NavLink[] = [
    { key: "home", label: "Home", href: "/" },
    { key: "silent-auction", label: "Silent Auction", href: "/silent-auction" },
    { key: "instant-sale", label: "Instant Sale", href: "/instant-sale" },
    { key: "your-items", label: "Your Items", href: "/your-items" },
  ];
  if (phase === "submission") links.push({ key: "submit", label: "Submit an Item", href: "/submit" });
  return links;
}

export type JumpValue = "submission" | "live" | "ending-soon" | "ended" | "after";
export const JUMPS: ReadonlyArray<{ value: JumpValue; label: string }> = [
  { value: "submission", label: "Submissions open" },
  { value: "live", label: "Bidding live" },
  { value: "ending-soon", label: "Ending soon" },
  { value: "ended", label: "Bidding ended" },
  { value: "after", label: "30+ days after" },
];
/** The demo bar's note (SPEC §3.1, v1.11). */
export const SHARED_NOTE = "Shared demo · resets daily";

/** Which Jump to button shows as pressed for the event as it is now. */
export function currentJump(event: Pick<EventView, "phase" | "endingSoon" | "proofDeadline"> | null, now: Date): JumpValue | null {
  if (!event) return null;
  if (event.phase === "submission") return "submission";
  if (event.phase === "live") return event.endingSoon ? "ending-soon" : "live";
  return event.proofDeadline && new Date(event.proofDeadline).getTime() <= now.getTime() ? "after" : "ended";
}

