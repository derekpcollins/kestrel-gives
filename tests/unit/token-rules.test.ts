import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { findRawValues } from "../../scripts/token-rules.ts";

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
