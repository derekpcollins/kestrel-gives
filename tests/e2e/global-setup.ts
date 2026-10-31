// Tests reseed the dev branch before each run and must never touch main (SPEC §4).
// Both scripts go through the main-branch guard, so this fails closed.
import { execFileSync } from "node:child_process";

export default function globalSetup(): void {
  for (const script of ["scripts/migrate.ts", "scripts/seed.ts"]) {
    execFileSync(process.execPath, ["--env-file=.env.local", script], { stdio: "inherit" });
  }
}
