// Seed photos (DECISIONS #77): the manifest matches the items and CREDITS.md, stored paths are
// relative keys resolved at display time, a bad base URL is loud, image files stay out of git,
// and the metadata stripper works. Pure: no network, no Blob, no gitignored files needed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { ITEMS, PLACEHOLDER_PHOTO } from "../../lib/seed/data.ts";
import { SEED_PHOTO_KEY, SEED_PHOTOS, seedPhotoKey } from "../../lib/seed/photos.ts";
import { checkSeedBase, photoUrl, seedBaseProblem, seedPhotosReady } from "../../lib/seed/photo-url.ts";
import { forbiddenImages } from "../../scripts/check-no-seed-images.ts";
import { estimateJpegQuality, jpegMetadata, stripJpegMetadata } from "../../scripts/jpeg-metadata.ts";

const BASE = "https://abc123xyz.public.blob.vercel-storage.com";
const keys = SEED_PHOTOS.map((p) => seedPhotoKey(p.slug, p.n));

describe("the photo manifest", () => {
  test("one entry per item photo slot, in order, with relative keys", () => {
    const slots = ITEMS.flatMap((i) => Array.from({ length: i.photos }, (_, n) => `${i.slug}-${n + 1}`));
    assert.deepEqual(SEED_PHOTOS.map((p) => `${p.slug}-${p.n}`).sort(), slots.sort());
    for (const key of keys) assert.match(key, SEED_PHOTO_KEY);
    assert.equal(new Set(SEED_PHOTOS.map((p) => p.pixabayId)).size, SEED_PHOTOS.length);
  });

  test("each multi-photo item comes from one photographer", () => {
    for (const item of ITEMS.filter((i) => i.photos > 1)) {
      assert.equal(new Set(SEED_PHOTOS.filter((p) => p.slug === item.slug).map((p) => p.photographer)).size, 1, item.slug);
    }
  });

  test("CREDITS.md credits every photo: by [photographer] via Pixabay, with its page link", async () => {
    const credits = await readFile(new URL("../../CREDITS.md", import.meta.url), "utf8");
    for (const p of SEED_PHOTOS) {
      assert.match(p.pageUrl, new RegExp(`^https://pixabay\\.com/photos/[a-z0-9-]+-${p.pixabayId}/$`));
      assert.ok(credits.includes(p.pageUrl), `${p.slug}-${p.n}: page link`);
      assert.ok(credits.includes(`by [${p.photographer}](${p.profileUrl}) via [Pixabay](https://pixabay.com/)`), `${p.slug}-${p.n}: credit line`);
    }
  });
});

describe("photoUrl resolves stored keys at display time", () => {
  const none = () => false;
  const all = () => true;
  test("Production and Preview use the Blob base URL", () => {
    assert.equal(photoUrl("seed/candles-1.jpg", { VERCEL_ENV: "production", SEED_PHOTOS_BASE_URL: BASE }, none), `${BASE}/seed/candles-1.jpg`);
    assert.equal(photoUrl("seed/candles-1.jpg", { VERCEL_ENV: "preview", SEED_PHOTOS_BASE_URL: BASE }, none), `${BASE}/seed/candles-1.jpg`);
  });
  test("a deployed site with a missing or bad base URL shows the placeholder (and the build fails first)", () => {
    assert.equal(photoUrl("seed/candles-1.jpg", { VERCEL_ENV: "production" }, all), PLACEHOLDER_PHOTO);
    assert.equal(photoUrl("seed/candles-1.jpg", { VERCEL_ENV: "preview", SEED_PHOTOS_BASE_URL: "https://evil.example.com" }, all), PLACEHOLDER_PHOTO);
  });
  test("locally: the gitignored copy if present, otherwise the placeholder, even with a base URL set", () => {
    assert.equal(photoUrl("seed/candles-1.jpg", {}, all), "/seed/candles-1.jpg");
    assert.equal(photoUrl("seed/candles-1.jpg", { VERCEL_ENV: "development", SEED_PHOTOS_BASE_URL: BASE }, none), PLACEHOLDER_PHOTO);
  });
  test("anything that isn't a seed key passes through", () => {
    assert.equal(photoUrl(PLACEHOLDER_PHOTO, { VERCEL_ENV: "production", SEED_PHOTOS_BASE_URL: BASE }, none), PLACEHOLDER_PHOTO);
    assert.equal(photoUrl("seed/../x.jpg", {}, all), "seed/../x.jpg");
  });
});

describe("SEED_PHOTOS_BASE_URL is checked, never echoed", () => {
  test("only a bare https origin of a public Blob store is ok", () => {
    assert.equal(checkSeedBase(BASE), "ok");
    assert.equal(checkSeedBase(undefined), "missing");
    assert.equal(checkSeedBase(""), "missing");
    for (const bad of [`${BASE}/`, `${BASE}/seed`, BASE.replace("https", "http"), `${BASE}?x=1`, "https://abc.blob.vercel-storage.com", "https://public.blob.vercel-storage.com.evil.com", "not a url", `https://user@abc123xyz.public.blob.vercel-storage.com`]) {
      assert.equal(checkSeedBase(bad), "malformed", bad);
    }
  });
  test("Production and Preview builds stop when it's missing or malformed; the message hides the value", () => {
    for (const VERCEL_ENV of ["production", "preview"]) {
      assert.match(seedBaseProblem({ VERCEL_ENV }, true) ?? "", /is not set/);
      const secretish = "https://wrong-store.example.com/path";
      const problem = seedBaseProblem({ VERCEL_ENV, SEED_PHOTOS_BASE_URL: secretish }, true) ?? "";
      assert.match(problem, /not a public Vercel Blob base URL/);
      assert.ok(!problem.includes("wrong-store"));
      assert.equal(seedBaseProblem({ VERCEL_ENV, SEED_PHOTOS_BASE_URL: BASE }, true), null);
    }
  });
  test("no check before photos are installed, or off Vercel", () => {
    assert.equal(seedBaseProblem({ VERCEL_ENV: "production" }, false), null);
    assert.equal(seedBaseProblem({ VERCEL_ENV: "development" }, true), null);
    assert.equal(seedBaseProblem({}, true), null);
  });
  test("/api/health's seedPhotos flag", () => {
    assert.equal(seedPhotosReady({ VERCEL_ENV: "production", SEED_PHOTOS_BASE_URL: BASE }, true, keys, () => false), true);
    assert.equal(seedPhotosReady({ VERCEL_ENV: "preview" }, true, keys, () => true), false);
    assert.equal(seedPhotosReady({}, true, keys, () => true), true);
    assert.equal(seedPhotosReady({}, true, keys, (k) => k !== keys[3]), false);
    assert.equal(seedPhotosReady({ VERCEL_ENV: "production", SEED_PHOTOS_BASE_URL: BASE }, false, keys, () => true), false);
  });
});

describe("image files never go in git", () => {
  test("flags images under seed or photo paths, except the two placeholders; charity logos and their sources are fine", () => {
    assert.deepEqual(
      forbiddenImages([
        "public/seed/placeholder-photo.png", "public/seed/proofs/placeholder-proof.png",
        "public/brand/charities/lantern-paws.png", "design/source/charities/lantern-paws.png",
        "public/seed/candles-1.jpg", "public/seed/photos/a.webp", ".seed-photos/originals/x.JPG", "assets/photos/y.png", "public/seed/new.png",
        "public/brand/logo.png", "design/screenshots/a.png", "lib/seed/photos.ts", "public/seed/charities/placeholder-logo.png",
      ]),
      ["public/seed/candles-1.jpg", "public/seed/photos/a.webp", ".seed-photos/originals/x.JPG", "assets/photos/y.png", "public/seed/new.png", "public/seed/charities/placeholder-logo.png"],
    );
  });
});

describe("JPEG metadata", () => {
  const seg = (marker: number, body: number[]) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  // The standard luminance table in zigzag order is IJG quality 50.
  const ZIGZAG_LUMA = [16, 11, 12, 14, 12, 10, 16, 14, 13, 14, 18, 17, 16, 19, 24, 40, 26, 24, 22, 22, 24, 49, 35, 37, 29, 40, 58, 51, 61, 60, 57, 51, 56, 55, 64, 72, 92, 78, 64, 68, 87, 69, 55, 56, 80, 109, 81, 87, 95, 98, 103, 104, 103, 62, 77, 113, 121, 112, 100, 120, 92, 101, 103, 99];
  const jpeg = Uint8Array.from([
    0xff, 0xd8,
    ...seg(0xe0, [...ascii("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...seg(0xe1, [...ascii("Exif\0\0"), 1, 2, 3]),
    ...seg(0xe1, [...ascii("http://ns.adobe.com/xap/1.0/\0"), 4]),
    ...seg(0xe2, [...ascii("ICC_PROFILE\0"), 1, 1, 9]),
    ...seg(0xed, [...ascii("Photoshop 3.0\0"), 5]),
    ...seg(0xfe, ascii("a comment")),
    ...seg(0xdb, [0, ...ZIGZAG_LUMA]),
    0xff, 0xda, 0, 2, 7, 7, 7, 0xff, 0xd9,
  ]);

  test("finds EXIF, XMP, IPTC and comments; strips them and keeps JFIF, ICC, tables and the scan", () => {
    assert.deepEqual(jpegMetadata(jpeg), ["APP1 EXIF", "APP1 XMP", "APP13 IPTC", "COM"]);
    const clean = stripJpegMetadata(jpeg);
    assert.deepEqual(jpegMetadata(clean), []);
    const text = Buffer.from(clean).toString("latin1");
    assert.ok(text.includes("JFIF") && text.includes("ICC_PROFILE"));
    assert.ok(!text.includes("Exif") && !text.includes("adobe") && !text.includes("Photoshop") && !text.includes("comment"));
    assert.deepEqual([...clean.subarray(-9)], [0xff, 0xda, 0, 2, 7, 7, 7, 0xff, 0xd9]);
    assert.deepEqual(stripJpegMetadata(clean), clean);
  });

  test("estimates IJG quality from the luminance table", () => {
    assert.equal(estimateJpegQuality(jpeg), 50);
  });

  test("rejects files that aren't JPEGs", () => {
    assert.throws(() => jpegMetadata(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), /Not a JPEG/);
  });
});
