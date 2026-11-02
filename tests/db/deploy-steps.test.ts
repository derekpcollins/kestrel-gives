// One-off deploy steps against real Postgres on dev (DECISIONS #84). Self-test steps use
// names starting "selftest-" and are deleted afterwards; the real m3-land-live-demo step is
// only ever run inside a rolled-back transaction here, and deploy-db itself is run only in
// ways that must not touch the database.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { promisify } from "node:util";
import { Pool } from "@neondatabase/serverless";
import { databaseUrl } from "../../scripts/db-target.ts";
import { DEPLOY_STEPS, runDeploySteps, type DeployStep } from "../../scripts/deploy-steps.ts";
import { directUrl } from "../../scripts/migrate-lib.ts";
import { phaseOf } from "../../lib/data/event.ts";
import { jumpIn } from "../../lib/demo/jump.ts";

const run = promisify(execFile);
const quiet = () => {};
let pool: Pool;
const devDirect = () => directUrl(databaseUrl([]));
const selftest = () => `selftest-${randomUUID().slice(0, 8)}`;
const recorded = async (name: string) => (await pool.query(`SELECT 1 FROM deploy_steps WHERE name = $1`, [name])).rowCount === 1;

before(() => {
  pool = new Pool({ connectionString: devDirect() });
});
after(async () => {
  await pool.query(`DELETE FROM deploy_steps WHERE name LIKE 'selftest-%'`);
  await pool.end();
});

function counting(name: string, delayMs = 0): DeployStep & { calls: number } {
  const step = {
    name,
    calls: 0,
    run: async () => {
      step.calls++;
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return "did the thing";
    },
  };
  return step;
}

describe("deploy steps", () => {
  test("a step runs once; a re-deploy skips it", async () => {
    const step = counting(selftest());
    const lines: string[] = [];
    assert.deepEqual(await runDeploySteps(pool, [step], { log: (l) => lines.push(l) }), { ran: [step.name], skipped: [] });
    assert.deepEqual(await runDeploySteps(pool, [step], { log: (l) => lines.push(l) }), { ran: [], skipped: [step.name] });
    assert.equal(step.calls, 1);
    assert.equal(await recorded(step.name), true);
    assert.deepEqual(lines, [`deploy-db: step ${step.name}: did the thing.`, `deploy-db: step ${step.name} already ran; skipped.`]);
  });

  test("two builds at once: the work runs once", async () => {
    const step = counting(selftest(), 500);
    const [a, b] = await Promise.all([runDeploySteps(pool, [step], { log: quiet }), runDeploySteps(pool, [step], { log: quiet })]);
    assert.equal(step.calls, 1);
    assert.deepEqual([...a.ran, ...b.ran], [step.name]);
    assert.deepEqual([...a.skipped, ...b.skipped], [step.name]);
  });

  test("a failed step leaves no record, so the next deploy runs it", async () => {
    const name = selftest();
    const failing: DeployStep = { name, run: async () => { throw new Error("boom"); } };
    await assert.rejects(runDeploySteps(pool, [failing], { log: quiet }), /boom/);
    assert.equal(await recorded(name), false);
    const fixed = counting(name);
    assert.deepEqual((await runDeploySteps(pool, [fixed], { log: quiet })).ran, [name]);
  });

  test("bad or repeated names are refused before anything runs", async () => {
    const step = counting(selftest());
    await assert.rejects(runDeploySteps(pool, [step, step], { log: quiet }), /unique/);
    await assert.rejects(runDeploySteps(pool, [{ ...step, name: "Bad Name" }], { log: quiet }), /Bad deploy step names/);
    assert.equal(step.calls, 0);
  });

  test("m3-land-live-demo restores the demo to live and logs a deploy restore (rolled back)", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await jumpIn(client, "after", new Date());
      const step = DEPLOY_STEPS.find((s) => s.name === "m3-land-live-demo")!;
      assert.equal(await step.run(client, new Date()), "restored the demo data (bidding live)");
      const { rows: [e] } = await client.query<{ subs: Date; opens: Date; closes: Date; now: Date }>(
        `SELECT submissions_open_at AS subs, bidding_opens_at AS opens, bidding_closes_at AS closes, now() AS now FROM events WHERE is_current`,
      );
      assert.equal(phaseOf({ submissionsOpenAt: e!.subs, biddingOpensAt: e!.opens, biddingClosesAt: e!.closes }, e!.now), "live");
      const { rows } = await client.query<{ source: string }>(`SELECT source FROM demo_restores ORDER BY id DESC LIMIT 1`);
      assert.equal(rows[0]?.source, "deploy");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});

describe("deploy-db never runs steps off production", () => {
  // The real script, as Vercel runs it, pointed at dev. Every case must leave the database alone.
  const deployDb = (env: Record<string, string | undefined>) =>
    run(process.execPath, ["scripts/deploy-db.ts"], { env: { PATH: process.env["PATH"], ...env } as NodeJS.ProcessEnv })
      .then((r) => ({ code: 0, out: r.stdout + r.stderr }))
      .catch((e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout + e.stderr }));
  const endpoints = () => ({ NEON_MAIN_ENDPOINT: process.env["NEON_MAIN_ENDPOINT"], NEON_DEV_ENDPOINT: process.env["NEON_DEV_ENDPOINT"] });

  test("preview, development and local builds skip", async () => {
    for (const VERCEL_ENV of ["preview", "development", undefined]) {
      const r = await deployDb({ VERCEL_ENV, DATABASE_URL_UNPOOLED: devDirect(), ...endpoints() });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /deploy-db: skipped, not a production build/);
      assert.doesNotMatch(r.out, /step /);
    }
    assert.equal(await recorded("m3-land-live-demo"), false, "never recorded on dev");
  });

  test("a production build pointed at dev refuses before touching it", async () => {
    const r = await deployDb({ VERCEL_ENV: "production", DATABASE_URL_UNPOOLED: devDirect(), ...endpoints() });
    assert.equal(r.code, 1);
    assert.match(r.out, /refusing to touch the database: DATABASE_URL_UNPOOLED is not the main branch/);
    assert.doesNotMatch(r.out, /step /);
    assert.equal(await recorded("m3-land-live-demo"), false);
  });
});
