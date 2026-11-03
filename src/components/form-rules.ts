// Form rules shared by the browser and the unit tests: no DOM here, so the server-side
// type check and node:test can load it. DESIGN-SYSTEM.md › Form field, Photo uploader.

// ---------- Money: whole dollars only (DECISIONS #52) ----------

/** The pattern attribute for money inputs: digits only (SPEC §7.9). */
export const MONEY_PATTERN = "[0-9]+";

/** Parses what someone typed into a money field: digits only, so "50" is fine and
    "50.00", "$50", "1,000", "-5" and "" are not (SPEC §7.9). Surrounding spaces are
    ignored. Returns whole dollars, or null. */
export function parseWholeDollars(raw: string): number | null {
  const s = raw.trim();
  if (!/^[0-9]+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** Whole dollars to stored cents: always a multiple of 100 (SPEC §7.9). */
export function dollarsToCents(dollars: number): number {
  if (!Number.isSafeInteger(dollars) || dollars < 0) throw new RangeError(`Not a whole-dollar amount: ${dollars}`);
  return dollars * 100;
}

export function formatDollars(dollars: number): string {
  return `$${dollars.toLocaleString("en-US")}`;
}

/** The refusal for an amount under a minimum (in dollars). The browser and the server both use it. */
export function atLeast(dollars: number): string {
  return `Enter at least ${formatDollars(dollars)}.`;
}

export function moneyProblem(raw: string, { label, min, required }: { label: string; min?: number; required: boolean }): string {
  if (raw.trim() === "") return required ? `Enter ${lowerFirst(label)}.` : "";
  const n = parseWholeDollars(raw);
  if (n === null) return "Whole dollars only.";
  if (min !== undefined && n < min) return atLeast(min);
  return "";
}

// ---------- Messages for the browser's built-in checks ----------

/** The parts of the DOM's ValidityState the messages use. */
export interface ValidityLike {
  valueMissing?: boolean;
  typeMismatch?: boolean;
  patternMismatch?: boolean;
  tooLong?: boolean;
  tooShort?: boolean;
  rangeUnderflow?: boolean;
  rangeOverflow?: boolean;
  stepMismatch?: boolean;
  badInput?: boolean;
}

export interface FieldInfo {
  label: string;
  kind: "text" | "email" | "number" | "datetime" | "choice" | "file";
  min?: string;
  max?: string;
  maxLength?: number;
  minLength?: number;
}

/** One plain-language message per problem, or "" when the value is fine. */
export function messageFor(v: ValidityLike, f: FieldInfo): string {
  const label = lowerFirst(f.label);
  if (v.valueMissing) {
    if (f.kind === "choice") return `Choose ${label}.`;
    if (f.kind === "file") return `Add ${label}.`;
    return `Enter ${label}.`;
  }
  if (v.badInput) return f.kind === "datetime" ? "Enter a complete date and time." : "Enter a number.";
  if (v.typeMismatch && f.kind === "email") return "Enter an email address, like name@example.com.";
  if (v.tooLong && f.maxLength !== undefined) return `Use ${f.maxLength.toLocaleString("en-US")} characters or fewer.`;
  if (v.tooShort && f.minLength !== undefined) return `Use at least ${f.minLength.toLocaleString("en-US")} characters.`;
  if (v.rangeUnderflow) return `Enter ${f.min ?? "a larger value"} or more.`;
  if (v.rangeOverflow) return `Enter ${f.max ?? "a smaller value"} or less.`;
  if (v.stepMismatch) return "Enter a whole number.";
  if (v.typeMismatch || v.patternMismatch) return `Check ${label}.`;
  return "";
}

export function summaryTitle(count: number): string {
  return count === 1 ? "1 field needs attention" : `${count} fields need attention`;
}

// Labels are written in sentence case ("Starting bid"); inside a message they read as
// "Enter a starting bid." A field can give its in-sentence name with data-message-name;
// otherwise the label is used with its first letter lower-cased.
function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ---------- Photos (SPEC §7.2: 1–5 photos, first is the cover) ----------

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_MAX = 5;

export interface PhotoCandidate {
  name: string;
  type: string;
  size: number;
}

/** Splits newly picked files into the ones that fit and one message per problem. */
export function checkPhotos<T extends PhotoCandidate>(existing: number, picked: readonly T[], maxMb: number, max = PHOTO_MAX): { accepted: T[]; problems: string[] } {
  const accepted: T[] = [];
  const problems: string[] = [];
  let skippedForCount = 0;
  for (const file of picked) {
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) problems.push(`“${file.name}” isn't a JPEG, PNG or WebP image.`);
    else if (file.size > maxMb * 1024 * 1024) problems.push(`“${file.name}” is larger than ${maxMb} MB.`);
    else if (existing + accepted.length >= max) skippedForCount++;
    else accepted.push(file);
  }
  if (skippedForCount) problems.push(`You can add up to ${max} photos. ${skippedForCount === 1 ? "1 photo wasn't" : `${skippedForCount} photos weren't`} added.`);
  return { accepted, problems };
}

/** Moves the item at `index` one place left (-1) or right (+1). Returns a new array;
    out-of-range moves return a copy unchanged. */
export function movePhoto<T>(list: readonly T[], index: number, direction: -1 | 1): T[] {
  const to = index + direction;
  const out = [...list];
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return out;
  [out[index], out[to]] = [out[to]!, out[index]!];
  return out;
}

export function photoPositionLabel(index: number, total: number): string {
  return index === 0 ? `Photo 1 of ${total} (cover)` : `Photo ${index + 1} of ${total}`;
}
