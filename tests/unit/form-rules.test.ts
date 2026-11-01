import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { checkPhotos, dollarsToCents, formatDollars, messageFor, moneyProblem, movePhoto, parseWholeDollars, photoPositionLabel, summaryTitle } from "../../src/components/form-rules.ts";

describe("whole-dollar money fields", () => {
  test("accepts digits only", () => {
    for (const [raw, n] of [["50", 50], [" 1000 ", 1000], ["0", 0], ["12345", 12345]] as const) assert.equal(parseWholeDollars(raw), n, raw);
  });
  test("rejects cents, symbols, negatives, words and e notation", () => {
    for (const raw of ["50.00", "50.5", ".5", "$50", "1,000", "-5", "+5", "", "fifty", "5e3", "$"]) assert.equal(parseWholeDollars(raw), null, raw);
  });
  test("stores whole dollars as cents, always a multiple of 100", () => {
    assert.equal(dollarsToCents(50), 5000);
    assert.equal(dollarsToCents(0), 0);
    assert.throws(() => dollarsToCents(12.5), RangeError);
    assert.throws(() => dollarsToCents(-1), RangeError);
  });
  test("messages come from the field's own minimum, never a fixed amount", () => {
    assert.equal(moneyProblem("8", { label: "a starting bid", min: 10, required: true }), "Enter at least $10.");
    assert.equal(moneyProblem("40", { label: "a starting bid", min: 45, required: true }), "Enter at least $45.");
    assert.equal(moneyProblem("12.50", { label: "the amount", required: true }), "Whole dollars only.");
    assert.equal(moneyProblem("$20", { label: "the amount", required: true }), "Whole dollars only.");
    assert.equal(moneyProblem("", { label: "a starting bid", required: true }), "Enter a starting bid.");
    assert.equal(moneyProblem("", { label: "a starting bid", required: false }), "");
    assert.equal(moneyProblem("1200", { label: "the amount", min: 10, required: true }), "");
  });
  test("formats with a dollar sign and commas", () => assert.equal(formatDollars(1500), "$1,500"));
});

describe("field messages", () => {
  test("missing values name the field and fit the control", () => {
    assert.equal(messageFor({ valueMissing: true }, { label: "Title", kind: "text" }), "Enter title.");
    assert.equal(messageFor({ valueMissing: true }, { label: "a sale type", kind: "choice" }), "Choose a sale type.");
    assert.equal(messageFor({ valueMissing: true }, { label: "at least one photo", kind: "file" }), "Add at least one photo.");
  });
  test("other problems", () => {
    assert.match(messageFor({ typeMismatch: true }, { label: "Email", kind: "email" }), /name@example\.com/);
    assert.equal(messageFor({ tooLong: true }, { label: "Title", kind: "text", maxLength: 80 }), "Use 80 characters or fewer.");
    assert.equal(messageFor({ badInput: true }, { label: "Closes", kind: "datetime" }), "Enter a complete date and time.");
    assert.equal(messageFor({}, { label: "Title", kind: "text" }), "");
  });
  test("summary title counts fields", () => {
    assert.equal(summaryTitle(1), "1 field needs attention");
    assert.equal(summaryTitle(3), "3 fields need attention");
  });
});

describe("photos", () => {
  const png = (name: string, size = 1000) => ({ name, type: "image/png", size });
  test("accepts JPEG, PNG and WebP within the size cap", () => {
    const { accepted, problems } = checkPhotos(0, [png("a.png"), { name: "b.jpg", type: "image/jpeg", size: 10 }, { name: "c.webp", type: "image/webp", size: 10 }], 4);
    assert.equal(accepted.length, 3);
    assert.deepEqual(problems, []);
  });
  test("names each file that's the wrong type or too large", () => {
    const { accepted, problems } = checkPhotos(0, [{ name: "d.gif", type: "image/gif", size: 10 }, png("big.png", 5 * 1024 * 1024)], 4);
    assert.equal(accepted.length, 0);
    assert.deepEqual(problems, ["“d.gif” isn't a JPEG, PNG or WebP image.", "“big.png” is larger than 4 MB."]);
  });
  test("stops at five photos and says how many were left out", () => {
    const { accepted, problems } = checkPhotos(3, [png("1"), png("2"), png("3"), png("4")], 4);
    assert.equal(accepted.length, 2);
    assert.deepEqual(problems, ["You can add up to 5 photos. 2 photos weren't added."]);
  });
  test("moves one place at a time and ignores moves off either end", () => {
    assert.deepEqual(movePhoto(["a", "b", "c"], 0, 1), ["b", "a", "c"]);
    assert.deepEqual(movePhoto(["a", "b", "c"], 2, -1), ["a", "c", "b"]);
    assert.deepEqual(movePhoto(["a", "b", "c"], 0, -1), ["a", "b", "c"]);
    assert.deepEqual(movePhoto(["a", "b", "c"], 2, 1), ["a", "b", "c"]);
  });
  test("position labels mark the cover", () => {
    assert.equal(photoPositionLabel(0, 3), "Photo 1 of 3 (cover)");
    assert.equal(photoPositionLabel(2, 3), "Photo 3 of 3");
  });
});
