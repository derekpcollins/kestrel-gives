// The seed photos' two steps (DECISIONS #77). Image files never go in git.
//
//   npm run seed:photos:process
//     .seed-photos/originals/<slug>-<n>.jpg (the Pixabay downloads, gitignored)
//     → public/seed/<slug>-<n>.jpg (gitignored; what local dev shows)
//     Re-encodes as JPEG at about quality 80 with the long edge at most 1280px (macOS `sips`;
//     its setting 55 is about IJG quality 80, checked per file), strips metadata, and checks
//     the total stays under 8 MB.
//
//   BLOB_READ_WRITE_TOKEN=… npm run seed:photos:upload
//     public/seed/<slug>-<n>.jpg → Blob pathname seed/<slug>-<n>.jpg (shared by Production and
//     Preview). Write-only: it never lists or deletes. Saves the store's public base URL to
//     .seed-photos/base-url (gitignored, never printed) for the SEED_PHOTOS_BASE_URL variable.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { put } from "@vercel/blob";
import { SEED_PHOTOS, seedPhotoKey } from "../lib/seed/photos.ts";
import { checkSeedBase } from "../lib/seed/photo-url.ts";
import { estimateJpegQuality, jpegMetadata, stripJpegMetadata } from "./jpeg-metadata.ts";

const ORIGINALS = ".seed-photos/originals";
const BASE_URL_FILE = ".seed-photos/base-url";
const MAX_TOTAL = 8 * 1024 * 1024;
const SIPS_QUALITY = "55";
const QUALITY_RANGE = [75, 85] as const;
const keys = SEED_PHOTOS.map((p) => seedPhotoKey(p.slug, p.n));
const kb = (n: number) => `${Math.round(n / 1024)} KB`;

function processPhotos(): void {
  const work = mkdtempSync(join(tmpdir(), "kestrel-seed-photos-"));
  let total = 0;
  try {
    mkdirSync("public/seed", { recursive: true });
    for (const key of keys) {
      const name = key.slice("seed/".length);
      const original = join(ORIGINALS, name);
      if (!existsSync(original)) throw new Error(`Missing original: ${original}`);
      const encoded = join(work, name);
      execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", SIPS_QUALITY, "-Z", "1280", original, "--out", encoded], { stdio: "ignore" });
      const clean = stripJpegMetadata(readFileSync(encoded));
      const left = jpegMetadata(clean);
      if (left.length > 0) throw new Error(`${key} still has metadata: ${left.join(", ")}`);
      const quality = estimateJpegQuality(clean);
      if (quality === null || quality < QUALITY_RANGE[0] || quality > QUALITY_RANGE[1]) throw new Error(`${key} came out at quality ${quality}, outside ${QUALITY_RANGE.join("–")}.`);
      writeFileSync(join("public", key), clean);
      total += clean.length;
      console.log(`${key}  q${quality}  ${kb(clean.length)}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  console.log(`${keys.length} photos, ${kb(total)} in all (limit ${kb(MAX_TOTAL)}).`);
  if (total > MAX_TOTAL) throw new Error("Over the 8 MB total.");
}

async function upload(): Promise<void> {
  const token = process.env["BLOB_READ_WRITE_TOKEN"];
  if (!token) throw new Error("Set BLOB_READ_WRITE_TOKEN for this one command (DECISIONS #77).");
  const origins = new Set<string>();
  for (const key of keys) {
    const file = join("public", key);
    const bytes = readFileSync(file);
    const left = jpegMetadata(bytes);
    if (left.length > 0) throw new Error(`${file} has metadata (${left.join(", ")}); run seed:photos:process first.`);
    const result = await put(key, bytes, { access: "public", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true, token });
    if (result.pathname !== key) throw new Error(`Blob stored ${key} under a different pathname.`);
    origins.add(new URL(result.url).origin);
    console.log(`uploaded ${key}  ${kb(statSync(file).size)}`);
  }
  const [origin] = origins;
  if (origins.size !== 1 || checkSeedBase(origin) !== "ok") throw new Error("The uploads didn't return one public Blob origin.");
  for (const key of keys) {
    const response = await fetch(`${origin}/${key}`, { method: "HEAD" });
    if (!response.ok) throw new Error(`${key} isn't publicly readable (HTTP ${response.status}).`);
  }
  writeFileSync(BASE_URL_FILE, `${origin}\n`, { mode: 0o600 });
  console.log(`${keys.length} photos uploaded under seed/ and readable. Base URL saved to ${BASE_URL_FILE} (not printed).`);
}

const command = process.argv[2];
try {
  if (command === "process") processPhotos();
  else if (command === "upload") await upload();
  else throw new Error("Usage: node scripts/seed-photos.ts process|upload");
} catch (error) {
  console.error(`seed-photos: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
