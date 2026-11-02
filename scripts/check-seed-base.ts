// A Vercel build step (DECISIONS #77): on Production and Preview, once the seed photos are
// installed, SEED_PHOTOS_BASE_URL must be a public Blob base URL, or the build fails, so a
// misconfigured deploy can't go live showing placeholders. Never prints the value.
import { PHOTOS_INSTALLED } from "../lib/seed/data.ts";
import { seedBaseProblem } from "../lib/seed/photo-url.ts";

const problem = seedBaseProblem(process.env, PHOTOS_INSTALLED);
if (problem) {
  console.error(`check-seed-base: ${problem}. Set it in this environment's Vercel variables.`);
  process.exit(1);
}
console.log("check-seed-base: ok.");
