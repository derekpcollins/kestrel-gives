// Picks where uploads go. Blob only on Vercel's Production and Preview deployments;
// everywhere else (vercel dev, scripts, tests) uses the local folder, even if a
// Blob token has been pulled into the environment.
import { blobStorage } from "./blob.ts";
import { localStorage } from "./local.ts";
import type { Storage } from "./types.ts";

export type { ClearResult, Storage, StoredFile } from "./types.ts";
export type { ImageType } from "./paths.ts";

export function storageFor(env: Readonly<Record<string, string | undefined>> = process.env): Storage {
  const vercelEnv = env["VERCEL_ENV"];
  const onVercel = vercelEnv === "production" || vercelEnv === "preview";
  if (onVercel && env["BLOB_READ_WRITE_TOKEN"]) return blobStorage(`${vercelEnv}/`);
  return localStorage(env["NODE_ENV"] === "test" ? "test/" : "development/");
}
