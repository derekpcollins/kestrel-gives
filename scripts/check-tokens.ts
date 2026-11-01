// Conformance check 2 (SPEC §12): no raw color, size, or spacing values in front-end
// source outside public/styles/tokens.css.
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { findRawValues, findUnpairedColors } from "./token-rules.ts";

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

for (const name of findUnpairedColors(await readFile(join(ROOT, TOKENS), "utf8"))) {
  problems.push(`${TOKENS}  ${name} needs light-dark(<light>, <dark>)`);
}

if (problems.length > 0) {
  console.error(`✗ Token problems (raw values outside ${TOKENS}, or color tokens without a dark value):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`✓ No raw design values in ${scanned} front-end file(s) outside ${TOKENS}; every color token has light and dark values.`);

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
