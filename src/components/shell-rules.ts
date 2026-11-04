// The shell's rules (SPEC §3.1, §8): which nav links show in each phase and which Jump to
// button is pressed. Pure, with no DOM, so node:test covers them.
import type { EventView } from "../app-state.ts";

/** "item" is an item page: no nav link is the current page there, nor on the giving stub or the tour. */
export type PageKey = "home" | "silent-auction" | "instant-sale" | "your-items" | "submit" | "admin" | "item" | "proof" | "giving" | "guide";

const PAGE_KEYS: readonly PageKey[] = ["home", "silent-auction", "instant-sale", "your-items", "submit", "admin", "item", "proof", "giving", "guide"];

/**
 * Which page the nav treats as current, from the body's data-page and the path. Edit item
 * shares the submit page's HTML, but it's an item's page, not Submit an Item, so no nav
 * link is current there. The giving stub isn't in the nav, so nothing is current on it.
 */
export function pageKeyFor(dataPage: string | undefined, path: string): PageKey {
  const page = PAGE_KEYS.find((p) => p === dataPage) ?? "home";
  if (page === "submit" && /^\/items\/[^/]+\/edit\/?$/.test(path)) return "item";
  // The proof page lives under Your Items (/your-items/proof), so that link is current there.
  return page === "proof" ? "your-items" : page;
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
/** The tour's link in the demo bar (SPEC v1.21 §3.1): the open bar, and the strip where it fits. */
export const TOUR_LINK = { href: "/guide", open: "New here? Take the 5-minute tour", strip: "Take the 5-minute tour" } as const;
/** The demo bar's note (SPEC §3.1, v1.11). */
export const SHARED_NOTE = "Shared demo · resets daily";

/** What Jump to "Submissions open" does, said before it happens (owner, 7A review; DECISIONS entry 124). */
export const SUBMISSION_JUMP_TEXT =
  "Submissions open clears bids, purchases and proofs, with their uploaded files. Items stay. Restore demo data brings them back. The demo is shared, so this changes it for everyone.";

/** Which Jump to button shows as pressed for the event as it is now. */
export function currentJump(event: Pick<EventView, "phase" | "endingSoon" | "proofDeadline"> | null, now: Date): JumpValue | null {
  if (!event) return null;
  if (event.phase === "unscheduled" || event.phase === "upcoming") return null;
  if (event.phase === "submission") return "submission";
  if (event.phase === "live") return event.endingSoon ? "ending-soon" : "live";
  return event.proofDeadline && new Date(event.proofDeadline).getTime() <= now.getTime() ? "after" : "ended";
}

