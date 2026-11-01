// The migration engine's pure parts (DECISIONS #67): checksums ignore line endings, edits to
// applied files are caught, and only a production build on the main branch may run.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { checksumOf, decideDeploy, directUrl, normalizeSql, verifyApplied } from "../../scripts/migrate-lib.ts";

// Fake hosts in the shape Neon uses; no credentials (the secret hook blocks those).
const MAIN = "ep-main-111";
const DEV = "ep-dev-222";
const url = (endpoint: string) => `postgresql://${endpoint}.us-east-1.aws.neon.tech/neondb`;
const pooled = (endpoint: string) => `postgresql://${endpoint}-pooler.us-east-1.aws.neon.tech/neondb`;

describe("checksums", () => {
  test("CRLF, CR and LF line endings give the same checksum", () => {
    const lf = "CREATE TABLE a (id int);\nCREATE TABLE b (id int);\n";
    assert.equal(checksumOf(lf.replace(/\n/g, "\r\n")), checksumOf(lf));
    assert.equal(checksumOf(lf.replace(/\n/g, "\r")), checksumOf(lf));
    assert.equal(normalizeSql("a\r\nb\rc\n"), "a\nb\nc\n");
  });

  test("any other change gives a different checksum", () => {
    assert.notEqual(checksumOf("CREATE TABLE a (id int);"), checksumOf("CREATE TABLE a (id bigint);"));
  });
});

describe("directUrl", () => {
  test("strips -pooler from the endpoint and keeps everything else", () => {
    assert.equal(directUrl(`${pooled(MAIN)}?sslmode=require`), `${url(MAIN)}?sslmode=require`);
    assert.equal(directUrl(url(DEV)), url(DEV));
  });
});

describe("verifyApplied", () => {
  const files = [
    { name: "001_init.sql", sql: "CREATE TABLE a (id int);\n" },
    { name: "002_more.sql", sql: "CREATE TABLE b (id int);\n" },
  ];

  test("matching checksums, old rows without one, and pending files pass", () => {
    assert.deepEqual(verifyApplied(files, [{ name: "001_init.sql", checksum: checksumOf(files[0]!.sql) }]), []);
    assert.deepEqual(verifyApplied(files, [{ name: "001_init.sql", checksum: null }]), []);
  });

  test("an applied file that was edited stops the run", () => {
    const problems = verifyApplied(files, [{ name: "001_init.sql", checksum: checksumOf("CREATE TABLE a (id bigint);\n") }]);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /001_init\.sql changed after it was applied/);
  });

  test("an applied file that was deleted stops the run", () => {
    assert.match(verifyApplied(files, [{ name: "000_gone.sql", checksum: "x" }])[0]!, /missing/);
  });

  test("re-saving a file with Windows line endings is not an edit", () => {
    const crlf = [{ name: "001_init.sql", sql: files[0]!.sql.replace(/\n/g, "\r\n") }];
    assert.deepEqual(verifyApplied(crlf, [{ name: "001_init.sql", checksum: checksumOf(files[0]!.sql) }]), []);
  });
});

describe("decideDeploy", () => {
  const prod = { VERCEL_ENV: "production", NEON_MAIN_ENDPOINT: MAIN, NEON_DEV_ENDPOINT: DEV };
  const refuse = (env: Record<string, string | undefined>, reason: RegExp) => {
    const decision = decideDeploy(env);
    assert.equal(decision.action, "refuse");
    assert.match(decision.action === "refuse" ? decision.reason : "", reason);
  };

  test("runs only for a production build whose DATABASE_URL_UNPOOLED is main, and uses that URL as is", () => {
    assert.deepEqual(decideDeploy({ ...prod, DATABASE_URL_UNPOOLED: url(MAIN), DATABASE_URL: pooled(MAIN) }), { action: "run", url: url(MAIN) });
  });

  test("preview, development and local builds skip without touching the database", () => {
    for (const VERCEL_ENV of ["preview", "development", undefined]) {
      assert.equal(decideDeploy({ ...prod, VERCEL_ENV, DATABASE_URL_UNPOOLED: url(MAIN) }).action, "skip");
    }
  });

  test("no fallback: a production build without DATABASE_URL_UNPOOLED refuses even if DATABASE_URL is main", () => {
    refuse({ ...prod, DATABASE_URL: pooled(MAIN) }, /DATABASE_URL_UNPOOLED is not set/);
    refuse({ ...prod, DATABASE_URL: url(MAIN) }, /DATABASE_URL_UNPOOLED is not set/);
  });

  test("a production build refuses when the direct URL isn't provably main, or isn't direct", () => {
    refuse({ ...prod, DATABASE_URL_UNPOOLED: url(DEV) }, /not the main branch/);
    refuse({ ...prod, DATABASE_URL_UNPOOLED: url("ep-other-333") }, /not the main branch/);
    refuse({ ...prod, DATABASE_URL_UNPOOLED: pooled(MAIN) }, /pooled host/);
    refuse({ ...prod, NEON_MAIN_ENDPOINT: undefined, DATABASE_URL_UNPOOLED: url(MAIN) }, /NEON_MAIN_ENDPOINT is not set/);
    refuse({ ...prod, NEON_DEV_ENDPOINT: MAIN, DATABASE_URL_UNPOOLED: url(MAIN) }, /are the same/);
    refuse({ ...prod, DATABASE_URL_UNPOOLED: "not a url" }, /valid URL/);
  });
});
