import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { findRawValues, findScaleUse, findUnpairedColors, readBreakpoints } from "../../scripts/token-rules.ts";

const values = (text: string) => findRawValues(text).map((found) => found.value);

describe("token check rules", () => {
  test("flags hex colors, color functions, and lengths", () => {
    assert.deepEqual(values("color: #fff; background: #1a2B3c;"), ["#fff", "#1a2B3c"]);
    assert.deepEqual(values("color: rgb(0 0 0); border-color: oklch(70% 0.1 200);"), ["rgb(", "oklch("]);
    assert.deepEqual(values("padding: 12px 1.5rem; gap: .5em;"), ["12px", "1.5rem", ".5em"]);
  });

  test("allows tokens, zero, and comments", () => {
    assert.deepEqual(values("padding: var(--space-3); margin: 0; border: 0px;"), []);
    assert.deepEqual(values("/* was 12px */ color: var(--color-text); // #fff"), []);
    assert.deepEqual(values('<!-- 16px --><p class="lead">'), []);
  });

  test("reports line numbers", () => {
    assert.deepEqual(findRawValues("a {\n  color: #000;\n}"), [{ line: 2, value: "#000" }]);
  });
});

describe("color tokens have light and dark values", () => {
  test("accepts light-dark pairs and aliases", () => {
    const css = ":root {\n  --color-a: light-dark(#fff, #000);\n  --color-b: light-dark(rgb(0 0 0 / 0.5), rgb(1 2 3));\n  --color-c: var(--color-a);\n  --space-1: 4px;\n}";
    assert.deepEqual(findUnpairedColors(css), []);
  });
  test("flags single values and one-sided light-dark", () => {
    const css = ":root { --color-a: #fff; --color-b: light-dark(rgb(0, 0, 0)); --color-c: rgb(0 0 0); }";
    assert.deepEqual(findUnpairedColors(css), ["--color-a", "--color-b", "--color-c"]);
  });
  test("ignores commented-out declarations", () => {
    assert.deepEqual(findUnpairedColors("/* --color-x: #fff; */ :root {}"), []);
  });
});

describe("breakpoints", () => {
  const bps = readBreakpoints(":root {\n  /* --breakpoint-x: 99rem; */\n  --breakpoint-sm: 40rem;\n  --breakpoint-lg: 64rem;\n}");
  const vals = (text: string) => findRawValues(text, bps).map((f) => f.value);

  test("reads the allowed values from tokens.css", () => {
    assert.deepEqual([...bps], ["40rem", "64rem"]);
  });
  test("allows breakpoint values inside @media and @container conditions", () => {
    assert.deepEqual(vals("@media (width < 40rem) { .nav { display: none; } }"), []);
    assert.deepEqual(vals("@container card (width >= 64rem) {"), []);
    assert.deepEqual(vals("@media (prefers-reduced-motion: no-preference) and\n  (width >= 40rem) {"), []);
  });
  test("flags other values in conditions", () => {
    assert.deepEqual(vals("@media (width < 48rem) {"), ["48rem"]);
    assert.deepEqual(vals("@media (min-width: 640px) {"), ["640px"]);
  });
  test("flags breakpoint values outside conditions, even on the same line", () => {
    assert.deepEqual(vals(".wrap { max-width: 40rem; }"), ["40rem"]);
    assert.deepEqual(vals("@media (width < 40rem) { .a { padding: 64rem; } }"), ["64rem"]);
  });
});

describe("type roles", () => {
  test("flags --text-* scale steps used outside tokens.css", () => {
    assert.deepEqual(findScaleUse(".a { font-size: var(--text-lg); }\n.b { font: var(--type-body); }"), [{ line: 1, value: "var(--text-lg)" }]);
  });
  test("allows type roles and other tokens", () => {
    assert.deepEqual(findScaleUse(".a { font: var(--type-heading-2); color: var(--color-text); }"), []);
  });
});
