import type { ImageType } from "./paths.ts";

export interface ClearResult {
  files: number;
  lists: number;
}

export interface StoredFile {
  pathname: string;
  url: string;
}

export interface Storage {
  readonly kind: "blob" | "local";
  readonly prefix: string;
  /** Writes a file at a pathname made by uploadPathname() (inside this prefix, or it throws). */
  put(pathname: string, data: Uint8Array, type: ImageType): Promise<StoredFile>;
  delete(pathnames: readonly string[]): Promise<void>;
  /**
   * Deletes every file under this storage's prefix (Restore demo data, DECISIONS #91). Returns
   * how many files, and how many list calls it made (each a paid Blob operation, #96).
   */
  clear(): Promise<ClearResult>;
}
