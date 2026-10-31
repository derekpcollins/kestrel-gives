// Every stored file lives under its environment's prefix ("production/", "preview/",
// "development/", "test/"). Production and Preview share one Blob store (DECISIONS #31),
// so these checks are what keep a preview's reset or Restore demo data from ever
// deleting the live demo's files.

export const IMAGE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ImageType = keyof typeof IMAGE_EXTENSIONS;

const PREFIX = /^[a-z]+\/$/;
// One or more lowercase path segments; no dots-only segments, no empty segments.
const OWNED_REST = /^(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*$/;

export function assertPrefix(prefix: string): string {
  if (!PREFIX.test(prefix)) throw new Error(`Invalid storage prefix: ${JSON.stringify(prefix)}`);
  return prefix;
}

// Throws unless pathname is a plain path strictly inside prefix. Rejects "..",
// lookalikes such as "previewx/…" for "preview/", absolute paths, and full URLs.
export function assertOwned(pathname: string, prefix: string): string {
  assertPrefix(prefix);
  const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : null;
  const ok = rest !== null && OWNED_REST.test(rest) && !rest.split("/").some((segment) => /^\.+$/.test(segment));
  if (!ok) throw new Error(`Refusing to touch ${JSON.stringify(pathname)}: outside this environment's storage (${prefix}).`);
  return pathname;
}

export function uploadPathname(prefix: string, folder: string, type: ImageType): string {
  return assertOwned(`${prefix}${folder}/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[type]}`, prefix);
}
