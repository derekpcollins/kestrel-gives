// Conformance check 1 (SPEC §12): package.json may only list the packages in SPEC.md's
// "Approved dependencies" table. The allowlist is read from the spec itself so the
// two can't drift apart.
import { readFile } from "node:fs/promises";

const spec = await readFile(new URL("../SPEC.md", import.meta.url), "utf8");
const pkg: Record<string, unknown> = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const section = spec.match(/### Approved dependencies[^\n]*\n([\s\S]*?)\n(?=#{2,3} |\S[^|\n]*\n)/)?.[1] ?? "";
const approved = new Set([...section.matchAll(/^\| `([^`]+)`/gm)].map((match) => match[1]));
if (approved.size === 0) fail(["Couldn't read the Approved dependencies table from SPEC.md."]);

const problems: string[] = [];
for (const field of ["dependencies", "devDependencies"]) {
  for (const name of Object.keys((pkg[field] ?? {}) as Record<string, string>)) {
    if (!approved.has(name)) problems.push(`${field}: ${name} is not on SPEC.md's approved list.`);
  }
}
for (const field of ["optionalDependencies", "peerDependencies", "bundleDependencies", "bundledDependencies"]) {
  if (field in pkg) problems.push(`${field} is not allowed; every dependency must be approved in SPEC.md.`);
}

if (problems.length > 0) fail(problems);
console.log(`✓ Dependencies match SPEC.md's approved list (${[...approved].join(", ")}).`);

function fail(messages: string[]): never {
  for (const message of messages) console.error(`✗ ${message}`);
  process.exit(1);
}
