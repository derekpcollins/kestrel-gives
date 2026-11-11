// The guide's rules (Things to try, /guide; owner, guide plan; DECISIONS entries 127 and 128). Pure,
// with no DOM, so node:test covers them: each scenario's viewer and phase, what Set me up will
// change on the shared demo, and the checks that the state a scenario needs is still there.
// Scenarios find items and people by title and name, never by numeric id, because another
// visitor may have changed the demo since the seed.
import type { AdminProof } from "../admin-api.ts";
import type { PersonView } from "../app-state.ts";
import type { ItemSummary } from "../items-api.ts";
import type { MeAnswer } from "../me-api.ts";
import { JUMPS, type JumpValue } from "../components/shell-rules.ts";

export type ScenarioId = "outbid" | "last-one" | "win" | "review" | "change" | "submit";

/** What a scenario needs read before it says Ready. */
export type Needs = "auction-items" | "instant-items" | "jules-me" | "proofs" | "none";

export interface Scenario {
  id: ScenarioId;
  /** First name of who Set me up views as at the end. */
  viewer: string;
  phase: JumpValue;
  /** Whose view the check reads, if not the final viewer's (Change the outcome reads Jules's). */
  checkAs?: string;
  needs: Needs;
}

export const SCENARIOS: readonly Scenario[] = [
  { id: "outbid", viewer: "Jules", phase: "live", needs: "auction-items" },
  { id: "last-one", viewer: "Jules", phase: "live", needs: "instant-items" },
  { id: "win", viewer: "Jules", phase: "ended", needs: "jules-me" },
  { id: "review", viewer: "Maya", phase: "ended", needs: "proofs" },
  { id: "change", viewer: "Maya", phase: "ended", checkAs: "Jules", needs: "jules-me" },
  { id: "submit", viewer: "Jules", phase: "submission", needs: "none" },
];

export const OUTBID_ITEM = "Lakeside Cabin Weekend";
export const LAST_ONE_ITEM = "Homemade hot sauce trio";

export const jumpLabel = (value: JumpValue) => JUMPS.find((j) => j.value === value)?.label ?? value;
export const fullName = (p: Pick<PersonView, "firstName" | "lastName">) => `${p.firstName} ${p.lastName}`;
export const personNamed = (people: readonly PersonView[], first: string) => people.find((p) => p.firstName === first) ?? null;

/** Whether the demo is already where a scenario needs it. Ending soon is still bidding live. */
export function phaseMatches(target: JumpValue, current: JumpValue | null): boolean {
  if (target === "live") return current === "live" || current === "ending-soon";
  return current === target;
}

export interface SetupEffect {
  /** Changes only this browser (the viewer cookie). */
  you: string;
  /** Changes the shared demo for everyone, or null if the phase is already right. */
  everyone: string | null;
}

/** The line beside Set me up: who it changes, said before the click. */
export function setupEffect(s: Scenario, current: JumpValue | null): SetupEffect {
  const you = `Just you: viewing as ${s.viewer}.`;
  if (phaseMatches(s.phase, current)) return { you, everyone: null };
  const everyone = s.phase === "submission"
    ? "Everyone: opens submissions, which clears bids, purchases and proofs (it asks first)."
    : `Everyone: moves the demo to ${jumpLabel(s.phase)}.`;
  return { you, everyone };
}

/** A check's answer: Ready with where to start, or what happened and how to recover. */
export type CheckResult =
  | { ok: true; start: { href: string; label: string }; note?: string }
  | { ok: false; title: string; text: string };

const RESTORE = "Restore demo data puts it back as seeded, for everyone, then press Set me up again.";

export function checkOutbid(items: readonly ItemSummary[]): CheckResult {
  const item = items.find((i) => i.title === OUTBID_ITEM);
  if (!item) return { ok: false, title: `${OUTBID_ITEM} isn't in the Silent Auction`, text: `Someone may have cancelled it. ${RESTORE}` };
  return { ok: true, start: { href: `/items/${item.id}`, label: `Go to ${OUTBID_ITEM}` } };
}

export function checkLastOne(items: readonly ItemSummary[]): CheckResult {
  const item = items.find((i) => i.title === LAST_ONE_ITEM);
  if (!item) return { ok: false, title: `${LAST_ONE_ITEM} isn't in the Instant Sale`, text: `Someone may have cancelled it. ${RESTORE}` };
  if (!item.remaining) return { ok: false, title: `${LAST_ONE_ITEM} is sold out`, text: `Someone bought the last one. ${RESTORE}` };
  const left = item.remaining === 1 ? "1 left, so one purchase sells it out." : `${item.remaining} left.`;
  return { ok: true, start: { href: `/items/${item.id}`, label: `Go to ${LAST_ONE_ITEM}` }, note: left };
}

/** Titles in quotes, since some have commas ("Guitar lessons, four weeks"). */
const wonTitles = (me: MeAnswer) => me.wins.filter((w) => w.kind === "won").map((w) => `“${w.title}”`);

export function checkWin(me: MeAnswer): CheckResult {
  const won = wonTitles(me);
  if (won.length === 0) return { ok: false, title: "Jules hasn't won anything right now", text: `Someone removed Jules's winning bids, or cleared the activity. ${RESTORE}` };
  const latest = me.proof.latest;
  const note = latest
    ? `Jules already uploaded proof (${latest.status}). You can look around, or start over: ${RESTORE}`
    : `Jules won ${listWords(won)}.`;
  return { ok: true, start: { href: "/your-items", label: "Go to Your Items" }, note };
}

/** Jules's waiting proof if there is one (the story from scenario 3), otherwise anyone's. */
export function checkReview(proofs: readonly AdminProof[]): CheckResult {
  const waiting = proofs.filter((p) => p.status === "pending");
  const jules = waiting.find((p) => p.person.firstName === "Jules");
  const pick = jules ?? waiting[0];
  if (!pick) return { ok: false, title: "No proofs are waiting for review", text: `Someone reviewed them. Do scenario 3 to add one, or: ${RESTORE}` };
  const note = jules
    ? "Jules's proof from scenario 3 is waiting."
    : `${fullName(pick.person)}'s proof is waiting. Jules's isn't (it hasn't been uploaded, or someone reviewed it), so review ${pick.person.firstName}'s.`;
  return { ok: true, start: { href: "/admin/proofs", label: "Go to Proof review" }, note };
}

/** Removing a winning bid needs one; the proof part of the story needs Jules's approved proof. */
export function checkChange(me: MeAnswer): CheckResult {
  const won = wonTitles(me);
  if (won.length === 0) return { ok: false, title: "Jules isn't winning anything right now", text: `Someone removed Jules's winning bids, or cleared the activity. ${RESTORE}` };
  const status = me.proof.latest?.status;
  const proof = status === "approved"
    ? "Jules's proof is approved, so watch it go back to pending."
    : status === "pending"
      ? "Jules's proof is still waiting for review. Approve it in scenario 4 first to see it go back to pending, or go on and watch the total change."
      : "Jules has no approved proof, so you'll see the total change. Do scenarios 3 and 4 first to see the proof go back to pending too.";
  return { ok: true, start: { href: "/admin/items", label: "Go to Admin › Items" }, note: `Jules is winning ${listWords(won)}. ${proof}` };
}

export function checkSubmit(): CheckResult {
  return { ok: true, start: { href: "/submit", label: "Go to Submit an Item" } };
}

/** "A", "A and B", "A, B and C". */
export function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The Ready line once the viewer and phase are set. */
export const readyText = (viewer: PersonView, phase: JumpValue) => `Viewing as ${fullName(viewer)}, ${jumpLabel(phase)}.`;
