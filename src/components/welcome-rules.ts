// The welcome dialog's rules (SPEC v1.24 §3.1; DECISIONS entry 138): its words, and whether it
// shows on this page load. Pure, with no DOM, so node:test covers them.
import type { PageKey } from "./shell-rules.ts";

/** Remembers that this visitor has seen it (written when it shows, not when it's dismissed). */
export const WELCOME_KEY = "kestrel-welcome-seen";

export const WELCOME = {
  title: "Welcome to the Kestrel Gives demo",
  body: "A demo of an auction and instant sale tool I designed and built at a previous job, rebuilt from memory with fictional people and data. Switch who you're viewing as and where the event is, and try it out.",
  shared: "Everyone shares this demo, and it resets daily.",
  stepsIntro: "Try this:",
  steps: [
    "Switch between the seven people with Viewing as, including two admins.",
    "Move the event between phases with Event phase.",
    "Bid on a Silent Auction item, then switch to someone else and outbid it.",
    "As an admin, jump to Bidding ended, then check Totals in the Admin Dashboard.",
  ],
  closing: "Restore demo data puts everything back.",
  dismiss: "Start exploring",
  tour: { label: "See more things to try", href: "/guide" },
} as const;

export interface WelcomeContext {
  /** The page as the shell sees it (shell-rules' pageKeyFor). */
  page: PageKey;
  /** ?demo=off: clean screenshots, no demo content. */
  demoOff: boolean;
  /** The stored flag says it was seen. */
  seen: boolean;
  /** False when localStorage can't be read or written. */
  storageWorks: boolean;
  /** Already shown on this page load (only matters without storage). */
  shownThisLoad: boolean;
  /** Another dialog is open right now. */
  dialogOpen: boolean;
}

export type WelcomeDecision =
  /** Show it, and remember that it was seen. */
  | "show"
  /** Don't show it, but remember it as seen (the tour: the visitor already found it). */
  | "mark-seen"
  /** Don't show it, and leave it for a later page load. */
  | "skip";

/** Whether the welcome shows on this page load, once the page's data has arrived. */
export function welcomeDecision(c: WelcomeContext): WelcomeDecision {
  if (c.demoOff || c.dialogOpen) return "skip";
  if (c.storageWorks) {
    if (c.seen) return "skip";
    return c.page === "guide" ? "mark-seen" : "show";
  }
  // Without storage it can't be remembered, so it stays on Home, at most once per load.
  return c.page === "home" && !c.shownThisLoad ? "show" : "skip";
}
