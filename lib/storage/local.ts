// Dev and tests store uploads on disk so they never spend Blob's monthly
// operation allowance (SPEC §4). The folder is gitignored. `vercel dev` only serves static
// files that existed when it started, so GET /api/uploads?file=… serves these locally (#91).
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { assertOwned, assertPrefix } from "./paths.ts";
import type { Storage } from "./types.ts";

export const LOCAL_UPLOADS_DIR = ".local-uploads";

/** Where a local file is served from (api/uploads.ts GET, local only). */
export function localUploadUrl(pathname: string): string {
  return `/api/uploads?file=${encodeURIComponent(pathname)}`;
}

export function localStorage(prefix: string, root: string = LOCAL_UPLOADS_DIR): Storage {
  assertPrefix(prefix);
  return {
    kind: "local",
    prefix,
    async put(pathname, data) {
      assertOwned(pathname, prefix);
      const file = join(root, pathname);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, data);
      return { pathname, url: localUploadUrl(pathname) };
    },
    async delete(pathnames) {
      // Check every path before deleting any, so one bad path can't cause a partial delete.
      const owned = pathnames.map((pathname) => assertOwned(pathname, prefix));
      await Promise.all(owned.map((pathname) => rm(join(root, pathname), { force: true })));
    },
    async clear() {
      const dir = join(root, prefix);
      const files = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
      const count = files.filter((f) => f.isFile()).length;
      await rm(dir, { recursive: true, force: true });
      return count;
    },
  };
}
