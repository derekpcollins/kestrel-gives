// Compiles every Vercel Function the way Vercel's Node builder does: a temporary tsconfig
// in the system temp folder that extends ours, transpile only (noCheck), with emit on. Any
// diagnostic Vercel would print in the production build log fails here first, such as
// TS2688 when the type roots can't be found from the temp folder. No dependencies.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(".");
const entrypoints = readdirSync("api").filter((f) => f.endsWith(".ts")).map((f) => join(root, "api", f));
const work = mkdtempSync(join(tmpdir(), "vercel-typescript-"));
try {
  const config = {
    extends: join(root, "tsconfig.json"),
    compilerOptions: {
      sourceMap: true, inlineSourceMap: false, inlineSources: true, declaration: false, declarationMap: false,
      emitDeclarationOnly: false, noEmit: false, outDir: join(work, "out"), rootDir: root, incremental: false,
      composite: false, noCheck: true, rewriteRelativeImportExtensions: true,
    },
    files: entrypoints,
    include: [],
    exclude: [],
  };
  writeFileSync(join(work, "tsconfig.json"), JSON.stringify(config));
  const result = spawnSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "--project", join(work, "tsconfig.json")], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    console.error("check-vercel-ts: Vercel's function compile would print errors:");
    console.error(result.stdout || result.stderr);
    process.exit(1);
  }
  console.log(`✓ ${entrypoints.length} Vercel Function(s) compile cleanly the way Vercel builds them.`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
