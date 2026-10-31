import type { ImageType } from "./paths.ts";

export interface StoredFile {
  pathname: string;
  url: string;
}

export interface Storage {
  readonly kind: "blob" | "local";
  readonly prefix: string;
  put(folder: string, data: Uint8Array, type: ImageType): Promise<StoredFile>;
  delete(pathnames: readonly string[]): Promise<void>;
}
