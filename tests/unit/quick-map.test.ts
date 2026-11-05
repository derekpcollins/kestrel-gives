// The quick check's map (SPEC §12, v1.23; DECISIONS entry 132): changed files pick the tests,
// shared or unknown files run everything, docs run nothing extra, and every file the map names
// exists, so a renamed spec can't silently drop out of the quick check.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, test } from "node:test";
import { AREAS, quickPlan, screenGrep } from "../../scripts/quick-map.ts";
import { SCREENS } from "../e2e/screens.ts";

describe("quick check map", () => {
  test("an area's page code picks its own DB file, specs and screens, and says why", () => {
    const plan = quickPlan(["src/pages/admin-items.ts", "lib/data/admin-items.ts"]);
    assert.equal(plan.everything, false);
    assert.deepEqual(plan.db, ["tests/db/admin.test.ts"]);
    assert.deepEqual(plan.specs, ["tests/e2e/admin.spec.ts"]);
    assert.ok(plan.screens.includes("admin-items"));
    assert.match(plan.why.join("\n"), /src\/pages\/admin-items\.ts: the Admin Dashboard → tests\/db\/admin\.test\.ts/);
  });

  test("areas add up without repeats", () => {
    const plan = quickPlan(["src/pages/your-items.ts", "src/pages/proof.ts", "api/me.ts"]);
    assert.deepEqual(plan.db, ["tests/db/employee-flows.test.ts"]);
    assert.deepEqual(plan.specs, ["tests/e2e/proof.spec.ts", "tests/e2e/your-items.spec.ts"]);
    assert.deepEqual(plan.screens, ["giving", "proof", "your-items"]);
  });

  test("shared code and unknown files run everything", () => {
    for (const file of ["src/components/dialog.ts", "public/styles/tokens.css", "lib/seed/data.ts", "migrations/009_x.sql", "package.json", "tests/e2e/screens.ts", "lib/data/db.ts"]) {
      assert.equal(quickPlan([file]).everything, true, file);
    }
    const unknown = quickPlan(["somewhere/new.ts"]);
    assert.equal(unknown.everything, true);
    assert.match(unknown.why[0]!, /not in the map, so everything runs/);
  });

  test("docs and design sources add nothing; a changed test runs itself; unit tests always run anyway", () => {
    const plan = quickPlan(["SPEC.md", "design/source/charities/x.png", ".review/a/b.txt", "tests/db/sales.test.ts", "tests/e2e/item.spec.ts", "tests/unit/x.test.ts"]);
    assert.equal(plan.everything, false);
    assert.deepEqual(plan.db, ["tests/db/sales.test.ts"]);
    assert.deepEqual(plan.specs, ["tests/e2e/item.spec.ts"]);
    assert.deepEqual(plan.screens, []);
  });

  test("the grep matches exactly the axe and reflow tests of those screens", () => {
    const re = new RegExp(screenGrep(["home", "admin-items"]));
    assert.ok(re.test("home has no accessibility violations"));
    assert.ok(re.test("admin-items reflows at 320px"));
    assert.ok(!re.test("admin has no accessibility violations"));
    assert.ok(!re.test("home page loads"));
    assert.ok(re.test("a11y.spec.ts home has no accessibility violations"), "Playwright matches the title path, file first");
    assert.ok(!re.test("a11y.spec.ts my-home has no accessibility violations"));
  });

  test("every test file and screen the map names exists", () => {
    const screens = new Set(SCREENS.map((s) => s.name));
    for (const area of AREAS) {
      for (const f of [...area.db, ...area.specs]) assert.ok(existsSync(f), `${area.name}: ${f}`);
      for (const s of area.screens) assert.ok(screens.has(s), `${area.name}: screen ${s}`);
    }
  });

  test("every tracked source file is classified on purpose (none fall through to 'not in the map')", () => {
    const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
    const unmapped = tracked.filter((f) => quickPlan([f]).why[0]!.includes("not in the map"));
    assert.deepEqual(unmapped, []);
  });
});
