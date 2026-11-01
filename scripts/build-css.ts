// `npm run build` step: public/styles/components/*.css → public/styles/components.css,
// in name order, inside @layer components. `--watch` rebuilds on change (npm start).
import { readdir, readFile, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { join } from "node:path";
import { joinComponents } from "./build-css-lib.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const SRC = join(ROOT, "public/styles/components");
const OUT = join(ROOT, "public/styles/components.css");

async function build(): Promise<void> {
  const names = (await readdir(SRC)).filter((name) => name.endsWith(".css"));
  const sources = await Promise.all(names.map(async (name) => ({ name, css: await readFile(join(SRC, name), "utf8") })));
  await writeFile(OUT, joinComponents(sources));
  console.log(`components.css: ${sources.length} component file(s)`);
}

await build();
if (process.argv.includes("--watch")) {
  let timer: NodeJS.Timeout | undefined;
  watch(SRC, () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((error: Error) => console.error(error.message)), 50);
  });
}
