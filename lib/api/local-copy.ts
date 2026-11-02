// Whether a seed photo has a local copy under public/ (used only off Vercel; DECISIONS #77).
import { existsSync } from "node:fs";
import { join } from "node:path";

export function hasLocalCopy(key: string): boolean {
  return existsSync(join(process.cwd(), "public", key));
}
