import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { databaseLabel, endpointOf } from "../../lib/db-endpoint.ts";

const env = { NEON_MAIN_ENDPOINT: "ep-main-1", NEON_DEV_ENDPOINT: "ep-dev-2" };

describe("database endpoint labels", () => {
  test("pooled and direct hosts give the same endpoint", () => {
    assert.equal(endpointOf("postgresql://ep-dev-2-pooler.example.invalid/db"), "ep-dev-2");
    assert.equal(endpointOf("postgresql://ep-dev-2.example.invalid/db"), "ep-dev-2");
  });

  test("labels main, dev, and anything else", () => {
    assert.equal(databaseLabel("postgresql://ep-main-1-pooler.example.invalid/db", env), "main");
    assert.equal(databaseLabel("postgresql://ep-dev-2-pooler.example.invalid/db", env), "dev");
    assert.equal(databaseLabel("postgresql://ep-other-3.example.invalid/db", env), "unknown");
    assert.equal(databaseLabel("postgresql://ep-main-1.example.invalid/db", {}), "unknown");
  });
});
