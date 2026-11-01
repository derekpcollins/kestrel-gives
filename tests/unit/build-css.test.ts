import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { joinComponents, LAYER_ORDER } from "../../scripts/build-css-lib.ts";

describe("joining component CSS", () => {
  test("sorts by file name and wraps everything in @layer components", () => {
    const out = joinComponents([
      { name: "button.css", css: ".btn { color: red; }" },
      { name: "avatar.css", css: ".avatar { color: blue; }" },
    ]);
    assert.ok(out.includes(LAYER_ORDER));
    assert.ok(out.indexOf("@layer components {") < out.indexOf(".avatar"));
    assert.ok(out.indexOf(".avatar") < out.indexOf(".btn"));
    assert.ok(out.trimEnd().endsWith("}"));
  });
  test("is the same whatever order the files arrive in", () => {
    const a = { name: "a.css", css: ".a {}" }, b = { name: "b.css", css: ".b {}" };
    assert.equal(joinComponents([a, b]), joinComponents([b, a]));
  });
  test("refuses @import and nested layer declarations", () => {
    assert.throws(() => joinComponents([{ name: "x.css", css: '@import "y.css";' }]), /@import/);
    assert.throws(() => joinComponents([{ name: "x.css", css: "@layer foo { .x {} }" }]), /layer/);
  });
});
