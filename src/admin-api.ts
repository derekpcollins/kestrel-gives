// The shapes of GET and POST /api/admin answers (SPEC §8 › Admin Dashboard). Types only:
// shared by the server (lib/data/admin*.ts) and the admin pages, so the two can't drift.
import type { Phase } from "./components/item-tile-rules.ts";
import type { ProofStatus } from "./components/proof-rules.ts";
import type { SettingsInput } from "./components/settings-rules.ts";
import type { Variable } from "./components/template-rules.ts";

export type AdminView = "summary" | "people" | "proofs" | "items" | "settings" | "templates";

export interface PersonName {
  id: string;
  firstName: string;
  lastName: string;
}

export interface SaleSplit {
  auctionCents: number;
  instantCents: number;
  grandCents: number;
}

/** SPEC v1.17 §8, DECISIONS #107. */
export interface AdminTotals {
  /** Winning bids and non-cancelled purchases, on items that aren't cancelled. */
  pledged: SaleSplit;
  /**
   * Sale types: what people with an approved latest proof owe (covered totals). Grand: the sum
   * of the amounts on those approved proofs. The two can differ; `gap` says by how much.
   */
  confirmed: SaleSplit;
  /** What the people with an approved latest proof owe in all (confirmed auction + instant). */
  approvedOwedCents: number;
  approvedPeople: number;
  /** "Approved proofs: $1,240 against $1,300 owed by those people, $60 short", or null with none approved. */
  gapLine: string | null;
  /** While bidding is live: the current high bids on active items (not a pledge yet). */
  leadingBidsCents: number | null;
}

export interface ResetState {
  /** When Reset for next year unlocks (30 days after bidding closes), or null with no close date. */
  unlocksAt: string | null;
  unlocked: boolean;
  /** The name next year's event gets ("Kestrel Gives 2027"). */
  nextName: string;
  /** What a Reset would delete from this event, for its dialog. Removed bids and cancelled items count too. */
  counts: { items: number; photos: number; bids: number; purchases: number; proofs: number };
}

export interface AdminEvent {
  id: string;
  name: string;
  timeZone: string;
  phase: Phase;
  submissionsOpenAt: string | null;
  biddingOpensAt: string | null;
  biddingClosesAt: string | null;
  proofDeadline: string | null;
}

export interface AdminSummary {
  ok: true;
  now: string;
  event: AdminEvent;
  totals: AdminTotals;
  pendingProofs: number;
  activeItems: number;
  reset: ResetState;
  /** The shared demo was just reset for next year: an earlier event exists and this one has no items (SPEC v1.17 §7.8). */
  demoReset: boolean;
}

export interface AdminProofBrief {
  id: string;
  status: ProofStatus;
  amountCents: number;
  /** The total the proof was uploaded (or approved) against. */
  owedCents: number;
  createdAt: string;
}

export interface AdminPerson extends PersonName {
  role: "admin" | "employee";
  /** Bids that aren't removed, on items that aren't cancelled. */
  bidCount: number;
  wins: number;
  purchases: number;
  totalCents: number;
  proof: AdminProofBrief | null;
}

export interface AdminPeople {
  ok: true;
  now: string;
  phase: Phase;
  proofDeadline: string | null;
  people: AdminPerson[];
}

export interface AdminProof extends AdminProofBrief {
  person: PersonName;
  /** The person's donation total now. */
  totalCents: number;
  /** The amount is below the total now. */
  short: boolean;
  /** The total changed since this proof was uploaded. */
  totalChanged: boolean;
  rejectionReason: string | null;
  imageUrl: string;
  reviewedAt: string | null;
  reviewer: PersonName | null;
}

export interface AdminProofs {
  ok: true;
  now: string;
  proofDeadline: string | null;
  /** Each person's latest proof: pending first (oldest first), then the rest (newest first). */
  proofs: AdminProof[];
}

export interface AdminBid {
  id: string;
  bidder: PersonName;
  amountCents: number;
  createdAt: string;
  removedAt: string | null;
  removedBy: PersonName | null;
  /** The high bid (or, after the close, the winner). */
  isTop: boolean;
}

/** One purchase of an instant-sale item, cancelled ones included (owner, 6D review; DECISIONS #115). */
export interface AdminPurchase {
  id: string;
  buyer: PersonName;
  priceCents: number;
  createdAt: string;
  cancelledAt: string | null;
  /** The buyer's latest proof status, so the cancel dialog can say whether it goes back to review. */
  buyerProof: ProofStatus | null;
}

export interface AdminItem {
  id: string;
  type: "auction" | "instant";
  title: string;
  /** The first photo, resolved; "" if none. */
  coverUrl: string;
  cancelled: boolean;
  cancelledAt: string | null;
  submitter: PersonName;
  startingBidCents: number | null;
  priceCents: number | null;
  quantity: number | null;
  remaining: number | null;
  /** Non-cancelled purchases. */
  purchases: number;
  /** Instant sale: every purchase, newest first, cancelled ones included and marked. */
  purchaseList: AdminPurchase[];
  highBidCents: number | null;
  /** Newest first, removed ones included and marked. */
  bids: AdminBid[];
}

export interface AdminItems {
  ok: true;
  now: string;
  phase: Phase;
  items: AdminItem[];
}

export interface AdminSettings {
  ok: true;
  now: string;
  /** The form's values, with dates as wall times in the event's zone. */
  values: SettingsInput;
}

export interface AdminTemplate {
  key: string;
  label: string;
  subject: string;
  body: string;
  variables: Variable[];
  /** Subject and body are the defaults. */
  isDefault: boolean;
  updatedAt: string;
}

export interface AdminTemplates {
  ok: true;
  templates: AdminTemplate[];
}
