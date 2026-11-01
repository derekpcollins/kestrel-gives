// Status thresholds (SPEC §10, DECISIONS #61). The one place these numbers live; the item
// tile rules, and later the item page and API, import them from here. No DOM, so the
// server and node:test can load it.

/** "Ending soon" shows when bidding closes within this many hours. */
export const ENDING_SOON_HOURS = 24;

/** An instant-sale item shows "N left" when this many or fewer remain. */
export const LOW_STOCK = 3;
