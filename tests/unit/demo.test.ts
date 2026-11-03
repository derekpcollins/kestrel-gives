// Event phases and the demo API's pure parts (SPEC §3.1, §7.1, DECISIONS #80, #81).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { phaseOf, proofDeadlineOf } from "../../lib/data/event.ts";
import { JUMP_TARGETS, isJumpTarget, jumpDates, type JumpTarget } from "../../lib/demo/jump.ts";
import { cronAuthorized, isJsonRequest, parseDemoAction } from "../../lib/demo/requests.ts";
import { resolveViewer, viewerCookie, viewerIdFrom, type Person } from "../../lib/demo/viewer.ts";
import { ENDING_SOON_HOURS } from "../../src/components/thresholds.ts";

const HOUR = 3_600_000;
const NOW = new Date("2026-11-02T18:37:12Z");
const at = (h: number) => new Date(NOW.getTime() + h * HOUR);

describe("phaseOf", () => {
  const event = { submissionsOpenAt: at(-100), biddingOpensAt: at(-10), biddingClosesAt: at(10) };
  test("submission before bidding opens, live until it closes, ended from the close on", () => {
    assert.equal(phaseOf(event, at(-11)), "submission");
    assert.equal(phaseOf(event, at(-10)), "live");
    assert.equal(phaseOf(event, at(9.99)), "live");
    assert.equal(phaseOf(event, at(10)), "ended");
  });
  test("not scheduled while any date is missing (SPEC v1.17, DECISIONS #108)", () => {
    assert.equal(phaseOf({ submissionsOpenAt: null, biddingOpensAt: null, biddingClosesAt: null }, NOW), "unscheduled");
    assert.equal(phaseOf({ ...event, biddingClosesAt: null }, at(1000)), "unscheduled");
    assert.equal(phaseOf({ ...event, submissionsOpenAt: null }, at(0)), "unscheduled");
  });
  test("upcoming until submissions open, then the submission window", () => {
    assert.equal(phaseOf(event, at(-100.01)), "upcoming");
    assert.equal(phaseOf(event, at(-100)), "submission");
  });
  test("the proof deadline is the close plus the event's days", () => {
    assert.deepEqual(proofDeadlineOf({ biddingClosesAt: at(0), proofDeadlineDays: 7 }), at(7 * 24));
    assert.equal(proofDeadlineOf({ biddingClosesAt: null, proofDeadlineDays: 7 }), null);
  });
});

describe("jumpDates", () => {
  const expected: Record<JumpTarget, string> = { submission: "submission", live: "live", "ending-soon": "live", ended: "ended", after: "ended" };
  for (const target of JUMP_TARGETS) {
    test(`${target}: lands in its phase, in date order, on the hour`, () => {
      const d = jumpDates(target, NOW);
      assert.equal(phaseOf(d, NOW), expected[target]);
      assert.ok(d.submissionsOpenAt < d.biddingOpensAt && d.biddingOpensAt < d.biddingClosesAt);
      assert.ok(d.submissionsOpenAt <= NOW, "submissions have opened");
      for (const date of Object.values(d)) assert.equal(date.getTime() % HOUR, 0);
    });
  }
  test("live is the seed's shape: closes in two days (rounded down to the hour)", () => {
    assert.equal(jumpDates("live", NOW).biddingClosesAt.toISOString(), "2026-11-04T18:00:00.000Z");
  });
  test("ending soon closes inside the threshold; live doesn't", () => {
    const left = (t: JumpTarget) => (jumpDates(t, NOW).biddingClosesAt.getTime() - NOW.getTime()) / HOUR;
    assert.ok(left("ending-soon") > 0 && left("ending-soon") < ENDING_SOON_HOURS);
    assert.ok(left("live") > ENDING_SOON_HOURS);
  });
  test("30+ days after: closed 31 days ago, so past the proof deadline", () => {
    const d = jumpDates("after", NOW);
    assert.equal(Math.round((NOW.getTime() - d.biddingClosesAt.getTime()) / (24 * HOUR)), 31);
    assert.ok(proofDeadlineOf({ biddingClosesAt: d.biddingClosesAt, proofDeadlineDays: 7 })! < NOW);
  });
  test("only the five targets are accepted", () => {
    assert.ok(isJumpTarget("ending-soon"));
    for (const bad of ["Ended", "", null, 3, "toString"]) assert.equal(isJumpTarget(bad), false);
  });
});

describe("viewer cookie", () => {
  const people: Person[] = [
    { id: "1", firstName: "Maya", lastName: "Okafor", role: "admin" },
    { id: "3", firstName: "Jules", lastName: "Ferreira", role: "employee" },
  ];
  test("reads only a well-formed id from kg_viewer", () => {
    assert.equal(viewerIdFrom("theme=dark; kg_viewer=3; other=x"), "3");
    for (const bad of [null, "", "kg_viewer=", "kg_viewer=0", "kg_viewer=3x", "kg_viewer=-1", "xkg_viewer=3"]) assert.equal(viewerIdFrom(bad), null, String(bad));
  });
  test("missing or unknown means Jules", () => {
    assert.equal(resolveViewer(people, "1")?.firstName, "Maya");
    assert.equal(resolveViewer(people, null)?.firstName, "Jules");
    assert.equal(resolveViewer(people, "99")?.firstName, "Jules");
    assert.equal(resolveViewer([], "1"), null);
  });
  test("HttpOnly, SameSite=Lax, Path=/; Secure only on https", () => {
    const c = viewerCookie("3", true);
    assert.match(c, /^kg_viewer=3; /);
    for (const part of ["Path=/", "HttpOnly", "SameSite=Lax", "Secure"]) assert.ok(c.split("; ").includes(part), part);
    assert.ok(!viewerCookie("3", false).includes("Secure"));
  });
});

describe("demo requests", () => {
  test("parses the three actions and rejects anything else", () => {
    assert.deepEqual(parseDemoAction({ action: "view-as", userId: "4" }), { action: "view-as", userId: "4" });
    assert.deepEqual(parseDemoAction({ action: "view-as", userId: 4 }), { action: "view-as", userId: "4" });
    assert.deepEqual(parseDemoAction({ action: "jump", to: "after" }), { action: "jump", to: "after" });
    assert.deepEqual(parseDemoAction({ action: "restore" }), { action: "restore" });
    for (const bad of [null, [], "restore", {}, { action: "drop" }, { action: "jump", to: "later" }, { action: "view-as", userId: "1; DROP" }, { action: "view-as", userId: 1.5 }]) {
      assert.ok("error" in parseDemoAction(bad), JSON.stringify(bad));
    }
  });
  test("needs a JSON content type", () => {
    assert.ok(isJsonRequest("application/json"));
    assert.ok(isJsonRequest("Application/JSON; charset=utf-8"));
    for (const bad of [null, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) assert.equal(isJsonRequest(bad), false);
  });
  test("cron auth fails closed and needs the exact bearer secret", () => {
    assert.ok(cronAuthorized("Bearer s3cret-value", "s3cret-value"));
    assert.equal(cronAuthorized("Bearer s3cret-value", undefined), false);
    assert.equal(cronAuthorized("Bearer s3cret-value", ""), false);
    assert.equal(cronAuthorized(null, "s3cret-value"), false);
    assert.equal(cronAuthorized("Bearer s3cret-valuX", "s3cret-value"), false);
    assert.equal(cronAuthorized("bearer s3cret-value", "s3cret-value"), false);
    assert.equal(cronAuthorized("Bearer ", ""), false);
  });
});

describe("Vercel config", () => {
  test("one daily cron, to the restore endpoint, inside the Hobby plan's limits", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons?: Array<{ path: string; schedule: string }> };
    assert.deepEqual(config.crons, [{ path: "/api/cron-restore", schedule: "0 8 * * *" }]);
    // Hobby: once a day at most, so fixed minute and hour fields.
    const [minute, hour, ...rest] = config.crons![0]!.schedule.split(" ");
    assert.match(minute!, /^\d+$/);
    assert.match(hour!, /^\d+$/);
    assert.deepEqual(rest, ["*", "*", "*"]);
  });
  test("no more than the Hobby plan's 12 functions", () => {
    assert.ok(readdirSync("api").filter((f) => f.endsWith(".ts")).length <= 12);
  });
});
