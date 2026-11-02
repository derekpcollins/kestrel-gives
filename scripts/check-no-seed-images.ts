// Seed photos never go in git (DECISIONS #77). Fails if git tracks (or has staged) any
// .jpg, .jpeg, .png or .webp under a seed or photo path. The three committed placeholders
// are the only exceptions. Runs in `npm run check` and the pre-commit hook.
import { execFileSync } from "node:child_process";

const ALLOWED = new Set(["public/seed/placeholder-photo.png", "public/seed/charities/placeholder-logo.png", "public/seed/proofs/placeholder-proof.png"]);
const IMAGE = /\.(jpe?g|png|webp)$/i;
const SEED_OR_PHOTO_DIR = /(^|\/)(seed|\.seed-photos|seed-photos|photos)\//i;

export function forbiddenImages(paths: readonly string[]): string[] {
  return paths.filter((p) => IMAGE.test(p) && SEED_OR_PHOTO_DIR.test(p) && !ALLOWED.has(p));
}

if (import.meta.main) {
  const tracked = execFileSync("git", ["ls-files", "-z", "--cached"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const bad = forbiddenImages(tracked);
  if (bad.length > 0) {
    console.error("check-no-seed-images: these images must not be in git (DECISIONS #77):");
    for (const p of bad) console.error(`  ${p}`);
    console.error("Unstage them with `git rm --cached <file>`; seed photos live in Blob and in gitignored local copies.");
    process.exit(1);
  }
  console.log(`✓ No seed or photo images in git (${tracked.length} files checked).`);
}
