// Removes metadata from a JPEG without re-encoding it (DECISIONS #77): EXIF and XMP (APP1),
// IPTC/Photoshop (APP13), comments, and any other application segment. Keeps what decoding
// needs: JFIF (APP0), the ICC color profile (APP2) and Adobe's color-transform flag (APP14).
// Everything from the start of scan onward is copied byte for byte. No dependencies.

const SOI = 0xd8;
const SOS = 0xda;

interface Segment {
  marker: number;
  start: number;
  end: number;
}

function segments(bytes: Uint8Array): { list: Segment[]; scanStart: number } {
  if (bytes[0] !== 0xff || bytes[1] !== SOI) throw new Error("Not a JPEG (no start-of-image marker).");
  const list: Segment[] = [];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error(`Malformed JPEG: expected a marker at byte ${i}.`);
    while (bytes[i + 1] === 0xff) i++; // fill bytes
    const marker = bytes[i + 1]!;
    if (marker === SOS) return { list, scanStart: i };
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      list.push({ marker, start: i, end: i + 2 });
      i += 2;
      continue;
    }
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (length < 2 || i + 2 + length > bytes.length) throw new Error(`Malformed JPEG: bad segment length at byte ${i}.`);
    list.push({ marker, start: i, end: i + 2 + length });
    i += 2 + length;
  }
  throw new Error("Malformed JPEG: no start-of-scan marker.");
}

function startsWith(bytes: Uint8Array, at: number, text: string): boolean {
  for (let k = 0; k < text.length; k++) if (bytes[at + k] !== text.charCodeAt(k)) return false;
  return true;
}

/** A short name for a metadata segment that should be stripped, or null to keep it. */
function metadataName(bytes: Uint8Array, s: Segment): string | null {
  const body = s.start + 4;
  if (s.marker === 0xfe) return "COM";
  if (s.marker < 0xe0 || s.marker > 0xef) return null;
  if (s.marker === 0xe0 && (startsWith(bytes, body, "JFIF\0") || startsWith(bytes, body, "JFXX\0"))) return null;
  if (s.marker === 0xe2 && startsWith(bytes, body, "ICC_PROFILE\0")) return null;
  if (s.marker === 0xee && startsWith(bytes, body, "Adobe")) return null;
  const app = `APP${s.marker - 0xe0}`;
  if (s.marker === 0xe1) return startsWith(bytes, body, "Exif\0") ? "APP1 EXIF" : "APP1 XMP";
  if (s.marker === 0xed) return "APP13 IPTC";
  return app;
}

/** The metadata segments present, by name; empty means clean. */
export function jpegMetadata(bytes: Uint8Array): string[] {
  const { list } = segments(bytes);
  return list.map((s) => metadataName(bytes, s)).filter((name): name is string => name !== null);
}

export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const { list, scanStart } = segments(bytes);
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  for (const s of list) if (metadataName(bytes, s) === null) parts.push(bytes.subarray(s.start, s.end));
  parts.push(bytes.subarray(scanStart));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// The standard (IJG) luminance quantization table, in natural order, and the zigzag order
// DQT segments store it in.
const IJG_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];

/**
 * Estimates the IJG quality (1–100) from the luminance quantization table, or null if it
 * can't. Encoders' own quality scales differ (macOS sips's 55 is about IJG 80), so the
 * processing step checks the result rather than trusting the setting.
 */
export function estimateJpegQuality(bytes: Uint8Array): number | null {
  const { list } = segments(bytes);
  for (const s of list) {
    if (s.marker !== 0xdb) continue;
    let j = s.start + 4;
    while (j < s.end) {
      const precision = bytes[j]! >> 4;
      const id = bytes[j]! & 15;
      j++;
      const size = precision === 0 ? 1 : 2;
      if (id === 0) {
        let ratio = 0;
        for (let k = 0; k < 64; k++) {
          const value = size === 1 ? bytes[j + k]! : (bytes[j + 2 * k]! << 8) | bytes[j + 2 * k + 1]!;
          ratio += value / IJG_LUMA[ZIGZAG[k]!]!;
        }
        const scale = (ratio / 64) * 100;
        return Math.max(1, Math.min(100, Math.round(scale <= 100 ? (200 - scale) / 2 : 5000 / scale)));
      }
      j += 64 * size;
    }
  }
  return null;
}
