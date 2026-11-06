// The quick check's map from changed files to tests (SPEC §12, v1.23; DECISIONS entry 132).
// Pure, so tests/unit/quick-map.test.ts covers it; scripts/check-quick.ts runs what it picks.
//
// Each changed file is matched against the rules in order and the first match wins:
//   - "none": docs and design sources, which no test reads (the fast checks still run);
//   - "everything": shared code (shell, components, tokens and base CSS, the data layer's core,
//     the seed, migrations, configs, shared test helpers), and any file no rule knows;
//   - an area: its database files, its own browser specs, and the axe and reflow checks for its
//     screens (by the screen names in tests/e2e/screens.ts).
// A changed test file always runs itself.

export interface Area {
  name: string;
  files: readonly RegExp[];
  db: readonly string[];
  specs: readonly string[];
  screens: readonly string[];
}

const DB = (name: string) => `tests/db/${name}.test.ts`;
const E2E = (name: string) => `tests/e2e/${name}.spec.ts`;
const ADMIN_SCREENS = ["admin", "admin-totals", "admin-people", "admin-proofs", "admin-items", "admin-settings", "admin-templates", "admin-reset"];

/** Docs, design sources and review notes: nothing beyond the fast checks. */
const NONE: readonly RegExp[] = [/\.md$/, /^docs\//, /^design\//, /^\.review\//, /^\.gitignore$/, /^public\/fonts\/.*\.txt$/];

/** The quick check's own files: the unit tests cover them. */
const FAST_ONLY: readonly RegExp[] = [/^scripts\/(check-deps|check-tokens|check-no-seed-images|check-quick|token-rules|quick-map|jpeg-metadata)\.ts$/];

/** Shared code: a change here can show anywhere, so everything runs. */
const SHARED: readonly RegExp[] = [
  /^src\/(main|shell|app-state|design-system)\.ts$/, /^src\/[a-z-]+-api\.ts$/, /^src\/components\//,
  /^public\/styles\/(tokens|base)\.css$/,
  /^public\/styles\/components\/(avatar|banner|button|card|dialog|empty|error-summary|field|icon|input|link|page-header|page|pill|profile-menu|radio-card|site-header|skip-link|table|toast|demo-bar|item-tile|carousel|uploader)\.css$/,
  /^lib\/data\/(db|event|event-dates|locks|totals|winners|blob-budget)\.ts$/, /^lib\/api\/(http|app-state|files|local-copy)\.ts$/,
  /^lib\/(seed|storage)\//, /^public\/seed\//, /^lib\/(db-endpoint|email-templates)\.ts$/, /^migrations\//,
  /^api\/(app|health)\.ts$/, /^scripts\/(dev|seed|seed-photos|build-css|build-css-lib|check-seed-base|check-vercel-ts|db-check)\.ts$/,
  /^package(-lock)?\.json$/, /^tsconfig(\.[a-z]+)?\.json$/, /^vercel\.json$/, /^playwright\.config\.ts$/, /^\.node-version$/, /^\.githooks\//,
  /^tests\/e2e\/(screens|global-setup|reflow|axe|page-load)\.ts$/, /^tests\/db\/seeded-once\.ts$/,
  /^public\/(favicon|apple-touch-icon)/, /^public\/fonts\//, /^public\/brand\/(?!charities\/)/,
];

export const AREAS: readonly Area[] = [
  {
    name: "Home and the charities",
    files: [/^src\/pages\/home/, /^public\/index\.html$/, /^public\/styles\/components\/(hero|steps|charity-card|lockup)\.css$/, /^public\/brand\/charities\//],
    db: [], specs: [E2E("home")], screens: ["home", "giving"],
  },
  {
    name: "browse",
    files: [/^src\/pages\/browse/, /^public\/(silent-auction|instant-sale)\.html$/],
    db: [DB("sales")], specs: [E2E("browse")], screens: ["silent-auction", "instant-sale"],
  },
  {
    name: "the item page, bidding and buying",
    files: [/^src\/pages\/item/, /^public\/item\.html$/, /^public\/styles\/components\/item-page\.css$/, /^api\/(items|bids|purchases)\.ts$/,
      /^lib\/data\/(items|sales)\.ts$/, /^lib\/api\/(item-answer|item-requests|sale-requests)\.ts$/],
    db: [DB("sales")], specs: [E2E("item"), E2E("item-actions"), E2E("browse")], screens: ["item-auction", "item-instant", "item-cancelled", "item-not-found"],
  },
  {
    name: "submit and edit",
    files: [/^src\/pages\/submit/, /^public\/submit\.html$/, /^public\/styles\/components\/item-form\.css$/, /^api\/uploads\.ts$/, /^lib\/data\/(item-writes|uploads)\.ts$/],
    db: [DB("employee-flows")], specs: [E2E("submit")], screens: ["submit", "item-edit"],
  },
  {
    name: "Your Items",
    files: [/^src\/pages\/your-items/, /^public\/your-items\.html$/, /^public\/styles\/components\/your-items\.css$/, /^api\/me\.ts$/, /^lib\/data\/me\.ts$/],
    db: [DB("employee-flows")], specs: [E2E("your-items")], screens: ["your-items"],
  },
  {
    name: "proof and giving",
    files: [/^src\/pages\/(proof|giving)/, /^public\/(proof|giving)\.html$/, /^public\/styles\/components\/(proof-page|giving)\.css$/, /^api\/proofs\.ts$/, /^lib\/data\/proofs\.ts$/],
    db: [DB("employee-flows")], specs: [E2E("proof")], screens: ["proof", "giving"],
  },
  {
    name: "the Admin Dashboard",
    files: [/^src\/pages\/admin/, /^public\/admin\.html$/, /^public\/styles\/components\/admin\.css$/, /^api\/admin\.ts$/, /^lib\/data\/admin/, /^lib\/api\/admin-requests\.ts$/],
    db: [DB("admin")], specs: [E2E("admin")], screens: ADMIN_SCREENS,
  },
  {
    name: "the tour",
    files: [/^src\/pages\/guide/, /^public\/guide\.html$/, /^public\/styles\/components\/guide\.css$/],
    db: [], specs: [E2E("guide")], screens: ["guide"],
  },
  {
    name: "demo controls",
    files: [/^api\/(demo|cron-restore)\.ts$/, /^lib\/demo\//],
    db: [DB("demo")], specs: [E2E("shell"), E2E("guide")], screens: [],
  },
  {
    name: "the design system gallery",
    files: [/^public\/design-system\//],
    db: [], specs: [], screens: ["design-system"],
  },
  {
    name: "migrations and deploy steps",
    files: [/^scripts\/(migrate|migrate-lib|deploy-db|deploy-steps|db-target)\.ts$/],
    db: [DB("migrate"), DB("deploy-steps"), DB("schema")], specs: [], screens: [],
  },
];

export interface Plan {
  everything: boolean;
  db: string[];
  specs: string[];
  screens: string[];
  /** One line per changed file: what it matched and what that adds. */
  why: string[];
}

const TEST_FILE = /^tests\/(db|e2e)\/[a-z0-9-]+\.(test|spec)\.ts$/;
const UNIT_TEST = /^tests\/unit\//;

export function quickPlan(changed: readonly string[]): Plan {
  const db = new Set<string>();
  const specs = new Set<string>();
  const screens = new Set<string>();
  const why: string[] = [];
  let everything = false;
  for (const file of [...new Set(changed)].sort()) {
    if (UNIT_TEST.test(file)) { why.push(`${file}: a unit test (always run)`); continue; }
    if (TEST_FILE.test(file)) {
      (file.startsWith("tests/db/") ? db : specs).add(file);
      why.push(`${file}: a test file, so it runs itself`);
      continue;
    }
    if (NONE.some((r) => r.test(file))) { why.push(`${file}: docs or design source, nothing extra`); continue; }
    if (FAST_ONLY.some((r) => r.test(file))) { why.push(`${file}: covered by the fast checks and unit tests`); continue; }
    if (SHARED.some((r) => r.test(file))) { everything = true; why.push(`${file}: shared code, so everything runs`); continue; }
    const area = AREAS.find((a) => a.files.some((r) => r.test(file)));
    if (!area) { everything = true; why.push(`${file}: not in the map, so everything runs`); continue; }
    area.db.forEach((f) => db.add(f));
    area.specs.forEach((f) => specs.add(f));
    area.screens.forEach((s) => screens.add(s));
    const adds = [...area.db, ...area.specs, ...(area.screens.length ? [`axe and reflow on ${area.screens.join(", ")}`] : [])];
    why.push(`${file}: ${area.name}${adds.length ? ` → ${adds.join(", ")}` : ""}`);
  }
  return { everything, db: [...db].sort(), specs: [...specs].sort(), screens: [...screens].sort(), why };
}

/**
 * Playwright's --grep for the axe and reflow tests of these screens. Their titles start with the
 * screen's name; Playwright matches against the whole title path (file name first), so the name
 * follows a space or the start, never another letter or hyphen.
 */
export function screenGrep(screens: readonly string[]): string {
  return `(^| )(${screens.map((s) => s.replace(/[-]/g, "\\-")).join("|")}) (has no accessibility violations|reflows at 320px)$`;
}
