// The deployed site's uploads: one public Vercel Blob store shared by Production
// and Preview, separated by prefix (DECISIONS #31).
import { del, list, put } from "@vercel/blob";
import { assertOwned, assertPrefix } from "./paths.ts";
import type { Storage } from "./types.ts";

/** The Blob calls storage makes; tests pass fakes so they never touch the network. */
export interface BlobLister {
  put(pathname: string, body: Buffer, options: { access: "public"; contentType: string; addRandomSuffix: false; cacheControlMaxAge?: number }): Promise<{ pathname: string; url: string }>;
  list(options: { prefix: string; cursor?: string; limit: number }): Promise<{ blobs: { pathname: string }[]; cursor?: string; hasMore: boolean }>;
  del(pathnames: string[]): Promise<void>;
}

const realLister: BlobLister = { put: (pathname, body, options) => put(pathname, body, options), list: (options) => list(options), del: (pathnames) => del(pathnames) };

/** Blob lists at most 1,000 per page; each page is one advanced operation (deletes are free). */
const PAGE = 1000;

export function blobStorage(prefix: string, lister: BlobLister = realLister): Storage {
  assertPrefix(prefix);
  return {
    kind: "blob",
    prefix,
    async put(pathname, data, type, options = {}) {
      assertOwned(pathname, prefix);
      // Without a cache time Blob's default applies (a month in browsers and the CDN).
      const cache = options.cacheSeconds === undefined ? {} : { cacheControlMaxAge: options.cacheSeconds };
      const result = await lister.put(pathname, Buffer.from(data), { access: "public", contentType: type, addRandomSuffix: false, ...cache });
      return { pathname: result.pathname, url: result.url };
    },
    async delete(pathnames) {
      const owned = pathnames.map((pathname) => assertOwned(pathname, prefix));
      if (owned.length > 0) await lister.del(owned);
    },
    async clear() {
      // Every listed path goes through the same guard as delete(), page by page, so nothing
      // outside this prefix (another environment, or seed/) can ever be deleted.
      let cursor: string | undefined;
      let count = 0;
      let lists = 0;
      do {
        lists += 1;
        const page = await lister.list({ prefix, limit: PAGE, ...(cursor ? { cursor } : {}) });
        const owned = page.blobs.map((b) => assertOwned(b.pathname, prefix));
        if (owned.length > 0) await lister.del(owned);
        count += owned.length;
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return { files: count, lists };
    },
  };
}
