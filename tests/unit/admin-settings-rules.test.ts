// Event settings and Email templates: the Admin Dashboard's words and choices (SPEC §7.1, §7.7; DECISIONS entry 116).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  liveProblems, PHASE_NAMES, phaseChange, phaseFor, preview, restoreDialog, TEMPLATE_WHEN, templateStatus, timeZones, VARIABLE_TEXT, zoneEffect, zoneHelp, zoneName,
} from "../../src/pages/admin-settings-rules.ts";
import { TEMPLATE_KEYS } from "../../lib/email-templates.ts";
import { VARIABLES } from "../../src/components/template-rules.ts";
import type { Phase } from "../../src/components/item-tile-rules.ts";
import { fromZonedLocal } from "../../src/components/settings-rules.ts";
import { phaseOf } from "../../lib/data/event.ts";

const NY = { timeZone: "America/New_York", submissionsOpen: "2026-10-20T22:00", biddingOpens: "2026-11-01T21:00", biddingCloses: "2026-11-05T21:00" };

describe("phaseFor", () => {
  test("matches the server's rule, with dates read in the event's zone", () => {
    assert.equal(phaseFor(NY, new Date("2026-10-20T12:00Z")), "upcoming");
    assert.equal(phaseFor(NY, new Date("2026-10-21T02:00Z")), "submission"); // 10 PM EDT on the 20th has passed
    assert.equal(phaseFor(NY, new Date("2026-11-03T12:00Z")), "live");
    assert.equal(phaseFor(NY, new Date("2026-11-06T01:59Z")), "live"); // 8:59 PM EST
    assert.equal(phaseFor(NY, new Date("2026-11-06T02:00Z")), "ended"); // 9 PM EST, after the clocks changed
  });
  test("agrees with the server's phaseOf at every hour around the dates", () => {
    const dates = { submissionsOpenAt: fromZonedLocal(NY.submissionsOpen, NY.timeZone), biddingOpensAt: fromZonedLocal(NY.biddingOpens, NY.timeZone), biddingClosesAt: fromZonedLocal(NY.biddingCloses, NY.timeZone) };
    for (let t = Date.parse("2026-10-19T00:00Z"); t < Date.parse("2026-11-08T00:00Z"); t += 30 * 60_000) {
      assert.equal(phaseFor(NY, new Date(t)), phaseOf(dates, new Date(t)), new Date(t).toISOString());
    }
  });
  test("the same wall times in another zone fall at other instants", () => {
    assert.equal(phaseFor({ ...NY, timeZone: "America/Los_Angeles" }, new Date("2026-11-06T02:30Z")), "live");
  });
  test("no dates is Not scheduled yet; some, or a time that doesn't exist, is unknown", () => {
    assert.equal(phaseFor({ ...NY, submissionsOpen: "", biddingOpens: "", biddingCloses: "" }, new Date()), "unscheduled");
    assert.equal(phaseFor({ ...NY, biddingCloses: "" }, new Date()), null);
    assert.equal(phaseFor({ ...NY, biddingOpens: "2026-03-08T02:30" }, new Date()), null);
  });
});

describe("phaseChange", () => {
  const phases = Object.keys(PHASE_NAMES) as Phase[];
  test("nothing to confirm when the phase stays", () => {
    for (const p of phases) assert.equal(phaseChange(p, p), null);
  });
  test("ending bidding, reopening and clearing the dates are danger; the rest confirm", () => {
    const end = phaseChange("live", "ended")!;
    assert.equal(end.variant, "danger");
    assert.equal(end.confirmLabel, "Save and end bidding");
    assert.match(end.body, /^This moves the event from "Bidding is open" to "Bidding has ended" as soon as you save\. .*winners are chosen/);
    const reopen = phaseChange("ended", "live")!;
    assert.equal(reopen.variant, "danger");
    assert.match(reopen.body, /winners are cleared .* go back to review/);
    assert.equal(phaseChange("live", "unscheduled")!.title, "Save without dates?");
    assert.equal(phaseChange("submission", "live")!.variant, "confirm");
    assert.equal(phaseChange("submission", "live")!.confirmLabel, "Save and open bidding");
    assert.match(phaseChange("live", "submission")!.body, /Employees can submit items; bidding waits for its date\.$/);
    assert.match(phaseChange("submission", "upcoming")!.body, /until submissions open\.$/);
  });
  test("every change has words", () => {
    for (const a of phases) for (const b of phases) if (a !== b) assert.ok(phaseChange(a, b)!.body.includes(PHASE_NAMES[b]));
  });
});

describe("time zone", () => {
  const NOV = new Date("2026-11-03T12:00Z");
  test("help names the zone in words and its abbreviation then", () => {
    assert.equal(zoneHelp("America/New_York", NOV), 'Times are in Eastern Time (New York), currently EST. Set all three, or leave all three empty for "Not scheduled yet".');
    assert.match(zoneHelp("America/New_York", new Date("2026-07-01T12:00Z")), /currently EDT\./);
    assert.equal(zoneHelp("Nowhere/Land", new Date()), "Choose a time zone first.");
  });
  test("friendly names: generic name and city; UTC; unknown ids as they are", () => {
    assert.equal(zoneName("America/New_York", NOV), "Eastern Time (New York)");
    assert.equal(zoneName("America/Los_Angeles", NOV), "Pacific Time (Los Angeles)");
    assert.equal(zoneName("America/Argentina/Buenos_Aires", NOV), "Argentina Standard Time (Buenos Aires)");
    assert.equal(zoneName("UTC", NOV), "Coordinated Universal Time");
    assert.equal(zoneName("Nowhere/Land", NOV), "Nowhere/Land");
  });
  test("the list keeps IANA ids as values, sorted by friendly name, with the saved zone kept even if the browser doesn't know it", () => {
    assert.deepEqual(timeZones("Europe/Oslo", ["America/New_York"], NOV), [
      { value: "Europe/Oslo", label: "Central European Time (Oslo)" },
      { value: "America/New_York", label: "Eastern Time (New York)" },
    ]);
    assert.deepEqual(timeZones("America/New_York", ["America/New_York"], NOV).map((z) => z.value), ["America/New_York"]);
  });
  const dates = { submissionsOpen: "2026-12-01T09:00", biddingOpens: "2026-12-03T09:00", biddingCloses: "2026-12-05T21:00" };
  test("changing the zone says what the close becomes, and what that is in the saved zone (the date when it differs)", () => {
    assert.equal(zoneEffect("America/New_York", { timeZone: "America/Los_Angeles", ...dates }),
      "Bidding now closes at 9:00 PM PST (Dec 6 at midnight Eastern).");
    assert.equal(zoneEffect("America/New_York", { timeZone: "America/Chicago", ...dates, biddingCloses: "2026-12-05T11:00" }),
      "Bidding now closes at 11:00 AM CST (noon Eastern).");
    assert.equal(zoneEffect("America/Los_Angeles", { timeZone: "Asia/Kolkata", ...dates }),
      "Bidding now closes at 9:00 PM GMT+5:30 (7:30 AM Pacific).");
  });
  test("no line when the zone is unchanged or the dates aren't all set", () => {
    assert.equal(zoneEffect("America/New_York", { timeZone: "America/New_York", ...dates }), null);
    assert.equal(zoneEffect("America/New_York", { timeZone: "America/Los_Angeles", ...dates, biddingOpens: "" }), null);
    assert.equal(zoneEffect("America/New_York", { timeZone: "America/Los_Angeles", ...dates, biddingCloses: "nope" }), null);
  });
});

describe("templates", () => {
  test("every template says when it would be sent, and every variable what it stands for", () => {
    for (const key of TEMPLATE_KEYS) assert.ok(TEMPLATE_WHEN[key], key);
    for (const v of VARIABLES) assert.ok(VARIABLE_TEXT[v], v);
  });
  test("the preview fills sample data and leaves anything else as typed", () => {
    assert.deepEqual(preview("You won {{item_name}}", "Hi {{first_name}}, {{nope}}"), { subject: "You won Lakeside Cabin Weekend", body: "Hi Jules, {{nope}}" });
  });
  test("live problems are only about variables", () => {
    assert.equal(liveProblems("", ["first_name"]), null);
    assert.equal(liveProblems("Hi {{first_name}}", ["first_name"]), null);
    assert.equal(liveProblems("Hi {{fist_name}}", ["first_name"]), "{{fist_name}} isn't a variable. Did you mean {{first_name}}?");
    assert.equal(liveProblems("{{rejection_reason}} {{x", ["first_name"]), "{{rejection_reason}} can't be used in this template. Check the braces: each variable is written like {{first_name}}.");
  });
  test("status pill and Restore default dialog", () => {
    assert.deepEqual(templateStatus(true), { label: "Default", tone: "neutral" });
    assert.deepEqual(templateStatus(false), { label: "Edited", tone: "warning" });
    const d = restoreDialog("Outbid");
    assert.equal(d.title, "Restore the default Outbid template?");
    assert.equal(d.variant, "danger");
    assert.equal(d.cancelLabel, "Keep my version");
  });
});
