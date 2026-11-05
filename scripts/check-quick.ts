// `npm run check:quick` (SPEC §12, v1.23; DECISIONS entry 132): the stage-checkpoint level.
// Always the fast checks (dependencies, no seed images, tokens, types, unit tests); then the
// database tests and browser tests that scripts/quick-map.ts picks for the files changed against
// main (committed, staged, unstaged and untracked), one after the other, never at once.
// Prints what it will run and why first, and a summary at the end. Stops at the first failure.
//   --base <ref>   compare with another ref (default origin/main, as last fetched; main if there's no remote)
//   --files a,b    plan from these files instead of git (to see what a change would run)
//   --dry-run      print the plan and stop
import { execFileSync, spawnSync } from "node:child_process";
import { quickPlan, screenGrep } from "./quick-map.ts";

const args = process.argv.slice(2);
const hasRef = (ref: string) => spawnSync("git", ["rev-parse", "--verify", "--quiet", ref], { stdio: "ignore" }).status === 0;
const base = args.includes("--base") ? args[args.indexOf("--base") + 1]! : hasRef("origin/main") ? "origin/main" : "main";
const dryRun = args.includes("--dry-run");

const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8" }).split("\n").filter(Boolean);
const changed = args.includes("--files")
  ? args[args.indexOf("--files") + 1]!.split(",").filter(Boolean)
  : [...git("diff", "--name-only", `${base}...HEAD`), ...git("diff", "--name-only", "HEAD"), ...git("ls-files", "--others", "--exclude-standard")];
const plan = quickPlan(changed);

interface Step { label: string; command: string[]; env?: Record<string, string> }
const npm = (script: string): Step => ({ label: `npm run ${script}`, command: ["npm", "run", "-s", script] });
const BROWSERS = { PLAYWRIGHT_BROWSERS_PATH: "0" };
const playwright = (label: string, ...a: string[]): Step => ({ label, command: ["npx", "playwright", "test", ...a], env: BROWSERS });

const steps: Step[] = ["check:deps", "check:seed-images", "check:tokens", "check:types", "test:rules"].map(npm);
if (plan.everything) {
  steps.push(npm("test:db"), npm("check:a11y"), npm("check:reflow"), npm("check:visual"));
} else {
  if (plan.db.length) {
    steps.push({ label: `database: ${plan.db.join(", ")}`, command: ["node", "--env-file=.env.local", "--test", "--test-concurrency=1", ...plan.db], env: { NODE_ENV: "test" } });
  }
  if (plan.specs.length) steps.push(playwright(`browser: ${plan.specs.join(", ")}`, ...plan.specs));
  if (plan.screens.length) {
    const grep = screenGrep(plan.screens);
    steps.push(playwright(`axe on ${plan.screens.join(", ")}`, "tests/e2e/a11y.spec.ts", "--grep", grep));
    steps.push(playwright(`reflow on ${plan.screens.join(", ")}`, "tests/e2e/reflow.spec.ts", "--project=reflow-320", "--grep", grep));
  }
}

console.log(`check:quick ${args.includes("--files") ? "for the files given" : `against ${base}`}: ${changed.length ? `${new Set(changed).size} changed file(s)` : "no changed files"}`);
// Grouped by reason, so a long list stays readable.
const groups = new Map<string, string[]>();
for (const line of plan.why) {
  const at = line.indexOf(": ");
  const [file, reason] = [line.slice(0, at), line.slice(at + 2)];
  groups.set(reason, [...(groups.get(reason) ?? []), file]);
}
for (const [reason, files] of groups) {
  const shown = files.length > 6 ? `${files.slice(0, 5).join(", ")} and ${files.length - 5} more` : files.join(", ");
  console.log(`  ${reason}:\n      ${shown}`);
}
console.log(plan.everything ? "Level: everything (shared or unmapped files changed), the same steps as the full check." : "Level: the fast checks plus the mapped tests.");
console.log("Will run, in order:");
for (const s of steps) console.log(`  - ${s.label}`);
if (dryRun) process.exit(0);

const ran: string[] = [];
for (const s of steps) {
  console.log(`\n> ${s.label}`);
  const started = Date.now();
  const r = spawnSync(s.command[0]!, s.command.slice(1), { stdio: "inherit", env: { ...process.env, ...s.env } });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  ran.push(`  ${r.status === 0 ? "✓" : "✗"} ${s.label} (${seconds} s)`);
  if (r.status !== 0) {
    console.log(`\ncheck:quick failed at: ${s.label}\n${ran.join("\n")}`);
    process.exit(r.status ?? 1);
  }
}
console.log(`\ncheck:quick passed${plan.everything ? " (everything ran)" : ""}:\n${ran.join("\n")}`);
