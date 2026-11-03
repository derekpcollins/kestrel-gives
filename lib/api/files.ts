// Deleting uploaded files after a commit (DECISIONS #91). Only this environment's own files:
// Preview and local dev share the dev database, so an item may point at another environment's
// file. That file is left alone; its own environment's Restore clears it. A failed delete is
// logged, never thrown: the database is already right, and the next Restore sweeps leftovers.
import type { Storage } from "../storage/index.ts";

export async function deleteOwnFiles(storage: Storage, pathnames: readonly string[], label: string): Promise<number> {
  const own = pathnames.filter((p) => p.startsWith(storage.prefix));
  if (own.length === 0) return 0;
  try {
    await storage.delete(own);
    return own.length;
  } catch (error) {
    console.error(`${label}: couldn't delete ${own.length} file(s): ${error instanceof Error ? error.name : "unknown error"}`);
    return 0;
  }
}
