// The shape of GET /api/app and POST /api/demo answers (DECISIONS #81). Types only: shared by
// the server (lib/api/app-state.ts) and the pages, so the two can't drift.
import type { Phase } from "./components/item-tile-rules.ts";

export interface PersonView {
  id: string;
  firstName: string;
  lastName: string;
  role: "admin" | "employee";
}

export interface EventView {
  id: string;
  name: string;
  timeZone: string;
  submissionsOpenAt: string | null;
  biddingOpensAt: string | null;
  biddingClosesAt: string | null;
  proofDeadline: string | null;
  phase: Phase;
  /** Live, with bidding closing within ENDING_SOON_HOURS. */
  endingSoon: boolean;
  winnersFinalized: boolean;
  givingPlatformUrl: string | null;
  /** The default and lowest starting bid for new items (the submit form, SPEC §7.3). */
  minStartingBidCents: number;
}

export interface CharityView {
  id: string;
  name: string;
  description: string;
  logoUrl: string;
}

export interface AppState {
  /** The server's time, so the page doesn't trust the device clock for phases. */
  now: string;
  viewer: PersonView | null;
  people: PersonView[];
  event: EventView | null;
  charities: CharityView[];
  /**
   * The shared demo was just reset for next year: an earlier event exists and the current one
   * has no items (SPEC v1.17 §7.8). Home and the Admin Dashboard offer Restore demo data.
   */
  demoReset: boolean;
}
