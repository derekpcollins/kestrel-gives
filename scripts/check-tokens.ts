// Conformance check 2 (SPEC §12): no raw color, size, or spacing values in front-end
// source outside public/styles/tokens.css.
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { findRawValues } from "./token-rules.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const TOKENS = "public/styles/tokens.css";
const SCAN = ["public", "src"];
const SKIP_DIRS = new Set(["public/js"]); // tsc output; src/ is checked instead
const EXTENSIONS = /\.(?:css|html|ts|svg)$/;

const problems: string[] = [];
let scanned = 0;
for (const dir of SCAN) {
  for (const file of await walk(join(ROOT, dir))) {
    const path = relative(ROOT, file);
    if (path === TOKENS || !EXTENSIONS.test(path)) continue;
    scanned++;
    for (const { line, value } of findRawValues(await readFile(file, "utf8"))) {
      problems.push(`${path}:${line}  ${value}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`✗ Raw design values outside ${TOKENS}; use a token instead:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`✓ No raw design values in ${scanned} front-end file(s) outside ${TOKENS}.`);

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(relative(ROOT, path))) files.push(...(await walk(path)));
    } else {
      files.push(path);
    }
  }
  return files;
}
