// Dev and tests store uploads on disk so they never spend Blob's monthly
// operation allowance (SPEC §4).
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { assertOwned, assertPrefix, uploadPathname } from "./paths.ts";
import type { Storage } from "./types.ts";

export const LOCAL_UPLOADS_DIR = ".local-uploads";

export function localStorage(prefix: string, root: string = LOCAL_UPLOADS_DIR): Storage {
  assertPrefix(prefix);
  return {
    kind: "local",
    prefix,
    async put(folder, data, type) {
      const pathname = uploadPathname(prefix, folder, type);
      const file = join(root, pathname);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, data);
      return { pathname, url: `/${LOCAL_UPLOADS_DIR}/${pathname}` };
    },
    async delete(pathnames) {
      // Check every path before deleting any, so one bad path can't cause a partial delete.
      const owned = pathnames.map((pathname) => assertOwned(pathname, prefix));
      await Promise.all(owned.map((pathname) => rm(join(root, pathname), { force: true })));
    },
  };
}
