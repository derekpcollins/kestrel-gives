// The "demo was reset" offer's words (SPEC v1.17 §7.8, DECISIONS #109). No DOM, so node:test
// covers them. Home and the Admin Dashboard show it while the shared demo is just reset.

export const RESET_OFFER_TITLE = "The demo was reset for next year";

/** What happened and what Restore does; admins also hear how to start the new year instead. */
export function resetOfferText(eventName: string | null, forAdmin: boolean): string {
  const event = eventName ?? "The event";
  const first = `Someone reset this shared demo, so ${event} has no items or dates yet. Restore demo data brings back the seeded items, bids, purchases and proofs, with bidding live, for everyone.`;
  return forAdmin ? `${first} To start the new year instead, set its dates in Event settings and add items.` : first;
}
