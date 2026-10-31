// The deployed site's uploads: one public Vercel Blob store shared by Production
// and Preview, separated by prefix (DECISIONS #31).
import { del, put } from "@vercel/blob";
import { assertOwned, assertPrefix, uploadPathname } from "./paths.ts";
import type { Storage } from "./types.ts";

export function blobStorage(prefix: string): Storage {
  assertPrefix(prefix);
  return {
    kind: "blob",
    prefix,
    async put(folder, data, type) {
      const pathname = uploadPathname(prefix, folder, type);
      const result = await put(pathname, Buffer.from(data), { access: "public", contentType: type });
      return { pathname: result.pathname, url: result.url };
    },
    async delete(pathnames) {
      const owned = pathnames.map((pathname) => assertOwned(pathname, prefix));
      if (owned.length > 0) await del(owned);
    },
  };
}
