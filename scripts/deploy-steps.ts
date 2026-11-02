// One-off data steps for the production deploy (DECISIONS #84). deploy-db runs them after
// migrations, inside the same advisory lock, and only on a production build confirmed to be
// on Neon's main branch (decideDeploy). Each step is recorded in deploy_steps in the same
// transaction as its work, so it runs once: a re-deploy finds the row and skips it, and two
// builds racing can't both run it (the second waits on the first's row, then skips).
import type { Pool } from "@neondatabase/serverless";
import { withTransaction, type Tx } from "../lib/data/db.ts";
import { restoreIn } from "../lib/demo/restore.ts";

export interface DeployStep {
  /** Lowercase words joined by hyphens; never reused or renamed once it has run. */
  name: string;
  /** The work, inside the step's transaction. Returns a line for the build log. */
  run(tx: Tx, now: Date): Promise<string>;
}

export const STEP_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The steps, in the order they run. Append only. */
export const DEPLOY_STEPS: readonly DeployStep[] = [
  {
    // Milestone 3: main was seeded once on the 2C/2D push, with dates relative to then, so by
    // the time the pages read it, bidding there has closed. Restore once so the live site opens
    // in the live phase; the demo bar and the daily cron keep it fresh after that.
    name: "m3-land-live-demo",
    run: async (tx, now) => {
      await restoreIn(tx, "deploy", now);
      return "restored the demo data (bidding live)";
    },
  },
];

export interface StepsOptions {
  now?: Date;
  log?: (line: string) => void;
  table?: string;
}

/** Runs each step not yet recorded. Call inside withSchemaLock. Returns what ran and what was skipped. */
export async function runDeploySteps(pool: Pool, steps: readonly DeployStep[], { now = new Date(), log = console.log, table = "deploy_steps" }: StepsOptions = {}): Promise<{ ran: string[]; skipped: string[] }> {
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(`Bad deploy steps table name: ${table}`);
  const names = steps.map((s) => s.name);
  const bad = names.filter((n) => !STEP_NAME.test(n));
  if (bad.length) throw new Error(`Bad deploy step names: ${bad.join(", ")}`);
  if (new Set(names).size !== names.length) throw new Error("Deploy step names must be unique.");

  const ran: string[] = [];
  const skipped: string[] = [];
  for (const step of steps) {
    const result = await withTransaction(pool, async (tx) => {
      const claimed = await tx.query(`INSERT INTO ${table} (name, ran_at) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING RETURNING name`, [step.name, now]);
      if (claimed.rowCount === 0) return null;
      return step.run(tx, now);
    });
    if (result === null) {
      skipped.push(step.name);
      log(`deploy-db: step ${step.name} already ran; skipped.`);
    } else {
      ran.push(step.name);
      log(`deploy-db: step ${step.name}: ${result}.`);
    }
  }
  return { ran, skipped };
}
