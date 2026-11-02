// What every page needs to draw its shell (DECISIONS #81): who is viewing, everyone they
// could view as, the current event and its phase, and the charities. Served by GET /api/app
// and returned by POST /api/demo after each change, so the page redraws from one answer.
import type { Tx } from "../data/db.ts";
import { currentEventIn, phaseOf, proofDeadlineOf, type Phase } from "../data/event.ts";
import { resolveViewer, type Person } from "../demo/viewer.ts";
import { photoUrl } from "../seed/photo-url.ts";
import { ENDING_SOON_HOURS } from "../../src/components/thresholds.ts";

type Env = Readonly<Record<string, string | undefined>>;

export interface AppState {
  /** The server's time, so the page can show countdowns without trusting the device clock. */
  now: string;
  viewer: Person | null;
  people: Person[];
  event: null | {
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
  };
  charities: Array<{ id: string; name: string; description: string; logoUrl: string }>;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function appStateIn(tx: Tx, viewerId: string | null, env: Env, hasLocalCopy: (key: string) => boolean): Promise<AppState> {
  const event = await currentEventIn(tx);
  const { rows: users } = await tx.query<{ id: string; first_name: string; last_name: string; role: "admin" | "employee" }>(
    `SELECT id, first_name, last_name, role FROM users ORDER BY id`,
  );
  const people = users.map((u) => ({ id: u.id, firstName: u.first_name, lastName: u.last_name, role: u.role }));
  const { rows: charities } = await tx.query<{ id: string; name: string; description: string; logo_path: string }>(
    `SELECT id, name, description, logo_path FROM charities ORDER BY position`,
  );
  const { rows: clock } = await tx.query<{ now: Date }>(`SELECT now() AS now`);
  const now = clock[0]?.now ?? new Date();

  let shownEvent: AppState["event"] = null;
  if (event) {
    const phase = phaseOf(event, now);
    const closesIn = event.biddingClosesAt ? event.biddingClosesAt.getTime() - now.getTime() : Infinity;
    shownEvent = {
      id: event.id, name: event.name, timeZone: event.timeZone,
      submissionsOpenAt: iso(event.submissionsOpenAt), biddingOpensAt: iso(event.biddingOpensAt), biddingClosesAt: iso(event.biddingClosesAt),
      proofDeadline: iso(proofDeadlineOf(event)),
      phase,
      endingSoon: phase === "live" && closesIn <= ENDING_SOON_HOURS * 3_600_000,
      winnersFinalized: event.winnersFinalizedAt !== null,
      givingPlatformUrl: event.givingPlatformUrl,
    };
  }

  return {
    now: now.toISOString(),
    viewer: resolveViewer(people, viewerId),
    people,
    event: shownEvent,
    charities: charities.map((c) => ({ id: c.id, name: c.name, description: c.description, logoUrl: photoUrl(c.logo_path, env, hasLocalCopy) })),
  };
}
