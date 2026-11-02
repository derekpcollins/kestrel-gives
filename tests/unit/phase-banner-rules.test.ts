// The phase banner's words (SPEC §8, §7.1): one per phase, in the viewer's time zone with
// the zone labeled, never with payment words.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { durationWords, phaseBanner, type BannerEvent } from "../../src/components/phase-banner-rules.ts";

const HOUR = 3_600_000;
const NOW = new Date("2026-11-02T18:30:00Z"); // Monday 1:30 PM in New York (EST)
const iso = (h: number) => new Date(NOW.getTime() + h * HOUR).toISOString();
const NY = "America/New_York";
const event = (e: Partial<BannerEvent>): BannerEvent => ({ phase: "live", endingSoon: false, biddingOpensAt: iso(-48), biddingClosesAt: iso(48), proofDeadline: iso(48 + 7 * 24), ...e });

describe("phase banner", () => {
  test("submission window: when bidding opens", () => {
    const b = phaseBanner(event({ phase: "submission", biddingOpensAt: iso(4 * 24 - 0.5) }), NOW, NY)!;
    assert.equal(b.title, "Submissions are open");
    assert.equal(b.text, "Submit an item until bidding opens on Friday, November 6 at 1:00 PM EST.");
  });
  test("live: time left and the close, in the viewer's zone", () => {
    const b = phaseBanner(event({ biddingClosesAt: iso(47.5) }), NOW, NY)!;
    assert.deepEqual([b.title, b.text], ["Bidding is open", "Bidding ends in 47 hours, on Wednesday, November 4 at 1:00 PM EST."]);
    const la = phaseBanner(event({ biddingClosesAt: iso(47.5) }), NOW, "America/Los_Angeles")!;
    assert.equal(la.text, "Bidding ends in 47 hours, on Wednesday, November 4 at 10:00 AM PST.");
    const three = phaseBanner(event({ biddingClosesAt: iso(72.5) }), NOW, NY)!;
    assert.equal(three.text, "Bidding ends in 3 days, on Thursday, November 5 at 2:00 PM EST.");
  });
  test("ending soon: today or tomorrow", () => {
    const today = phaseBanner(event({ endingSoon: true, biddingClosesAt: iso(3.5) }), NOW, NY)!;
    assert.deepEqual([today.title, today.text], ["Bidding ends soon", "Bidding closes in 3 hours, today at 5:00 PM EST."]);
    const tomorrow = phaseBanner(event({ endingSoon: true, biddingClosesAt: iso(19.5) }), NOW, NY)!;
    assert.equal(tomorrow.text, "Bidding closes in 19 hours, tomorrow at 9:00 AM EST.");
  });
  test("ended: winners donate and upload proof by the deadline", () => {
    const b = phaseBanner(event({ phase: "ended", biddingClosesAt: iso(-1.5), proofDeadline: iso(-1.5 + 7 * 24) }), NOW, NY)!;
    assert.deepEqual([b.title, b.text], ["Bidding has ended", "Winners, please donate and upload proof by Monday, November 9 at 12:00 PM EST."]);
  });
  test("30+ days after: the deadline has passed", () => {
    const b = phaseBanner(event({ phase: "ended", biddingClosesAt: iso(-31 * 24), proofDeadline: iso(-24 * 24 - 0.5) }), NOW, NY)!;
    assert.deepEqual([b.title, b.text], ["Bidding has ended", "The proof deadline was Friday, October 9. Thanks to everyone who took part."]);
  });
  test("another year shows the year; no event, no banner", () => {
    const b = phaseBanner(event({ phase: "ended", proofDeadline: "2025-12-01T17:00:00Z" }), NOW, NY)!;
    assert.match(b.text, /Monday, December 1, 2025/);
    assert.equal(phaseBanner(null, NOW, NY), null);
  });
  test("durations round down; whole days only from 48 hours", () => {
    const words = (h: number) => durationWords(h * HOUR);
    // The 48-hour boundary: days from exactly 48 hours, hours just below.
    assert.equal(words(48), "2 days");
    assert.equal(words(47.99), "47 hours");
    assert.equal(words(71.99), "2 days");
    assert.equal(words(72), "3 days");
    // The 24-hour boundary: hours on both sides, never "1 day".
    assert.equal(words(24), "24 hours");
    assert.equal(words(24.5), "24 hours");
    assert.equal(words(23.99), "23 hours");
    assert.deepEqual([2, 1.99, 1, 0.99, 0.001].map(words), ["2 hours", "1 hour", "1 hour", "59 minutes", "1 minute"]);
  });
  test("no payment words in any banner", () => {
    const all = [
      phaseBanner(event({ phase: "submission" }), NOW, NY), phaseBanner(event({}), NOW, NY), phaseBanner(event({ endingSoon: true, biddingClosesAt: iso(5) }), NOW, NY),
      phaseBanner(event({ phase: "ended", proofDeadline: iso(5) }), NOW, NY), phaseBanner(event({ phase: "ended", proofDeadline: iso(-5) }), NOW, NY),
    ];
    for (const b of all) assert.doesNotMatch(`${b!.title} ${b!.text}`, /\b(pay|paid|payment|checkout)\b/i);
  });
});
