# Kestrel Gives — Build Log

A running, honest record of how this project was built, for the case study. Times are US Eastern. Each milestone records a start and end time; git commit times are the fallback.

Entry format: what we built, what was hard, what AI did well, where the owner stepped in.

---

## Milestone 0: Local infrastructure

**Started:** 2026-10-31 12:07 EDT
**Ended:** 2026-10-31 13:16 EDT (pending the owner's sign-off on the Group H checkpoint) · about 1 hour 10 minutes

### 2026-10-31 — Kickoff
- **Built:** nothing yet. Claude read SPEC.md v1.0 in full, summarized it back, and proposed a plan for the eight infrastructure steps.
- **Hard:** a few gaps between the spec and the setup steps surfaced before any code: TypeScript for Node code needs `@types/node`, which isn't on the approved list; the Neon Marketplace integration needs a Vercel project to attach to, which comes earlier than step 7; and where `styles/tokens.css` lives relative to the served folder. Raised as questions rather than resolved.
- **AI did well:** caught the missing `@types/node` before it turned into a type-check failure, and noticed the step order didn't match how the Marketplace works.
- **Owner stepped in:** answered all five questions. Approved `@types/node@24`, moved the decisions into their own DECISIONS.md, chose push-to-deploy from GitHub with Neon preview branches turned off, and confirmed the tokens path. SPEC bumped to v1.1.

### 2026-10-31 — Group A: tools
- Node 24.21.0, npm 11.19.0, git 2.56.0, and gh 2.103.3 (logged in as derekpcollins over SSH) were all present. The Vercel CLI wasn't installed.
- The owner installed Vercel CLI 65.9.0 globally and logged in as derekpcollins. It's installed under fnm's Node 24, so switching Node versions would hide it.
- Owner decision: previews use the `dev` database, so only production touches `main` (DECISIONS #25).

### 2026-10-31 — Group B: repo
- **Built:** `git init` on `main`, a `.gitignore` (env files, `.local-uploads/`, build output, Vercel and Playwright folders), and a POSIX-shell pre-commit hook in versioned `.githooks/`. The hook blocks `.env*` files and Postgres URLs that contain credentials.
- **Tested:** the hook blocked a staged `.env` file and a fake database URL, let the real files through, and blocked a real `git commit` of `.env.local`.
- **Hard / caught:** the first version of the hook printed 40 characters of the offending line, which could show part of a real password in the terminal. Changed it to print only `file:line`. The global git email was the placeholder `you@example.com`, so the first commit is on hold until the owner picks an address.
- **Owner stepped in:** set the global git email to the GitHub noreply address (`577782+derekpcollins@…`, checked against `gh api user`) and approved creating the public repo with the owner's description.

### 2026-10-31 — Group C: structure
- **Built:** the folder layout (`api/`, `lib/`, `src/` → `public/js/`, `public/styles/tokens.css`, `migrations/`, `scripts/`, `tests/unit`, `tests/e2e`), `package.json` with exactly the six approved packages, two strict tsconfigs, and `vercel.json` (no framework, `public/` as output). `npm run check:types` and `npm run build` both pass, and a deliberate type error fails the check.
- **Surprised:** `npm view` shows TypeScript is now on 7.0 (the native compiler). It worked with our config without changes.
- **Hard / caught:** `npm audit` reports a high-severity advisory in `zod`, pulled in by `@vercel/blob` → `@vercel/oidc` → `@vercel/cli-config`, which pins `zod@4.1.11` exactly. Raised with the owner instead of running `npm audit fix --force`, which would quietly downgrade `@vercel/blob`.
- **Owner stepped in:** accepted the zod advisory with a recheck at each milestone (#27), had TypeScript pinned exactly to 7.0.2 (#28), and set the push rule: commit freely, but push to `main` only after a checkpoint is approved, so the live demo only changes at checkpoints.
- **Owner stepped in (push rule correction):** under the push-at-each-checkpoint rule, approving Group D would have deployed. For the rest of infrastructure setup, pushes to `main` are on hold until Group G, which makes step 7 the real first deploy. After that, pushes go back to happening at each approved checkpoint.

### 2026-10-31 — Group D: database (in progress)
- **Vercel project:** created `kestrel-gives` on Derek's Projects (Hobby). `vercel link` also connected the GitHub repo (production branch `main`) on its own. Confirmed no deployment started.
- **Surprised:** `vercel link` did more than link. It wrote `.env.local` with a `VERCEL_OIDC_TOKEN` and appended `.vercel` and `.env*` to `.gitignore`. Those duplicated existing rules, so the edit was reverted (both are still ignored). The project also defaulted to Node 26.x; set to 24.x to match `engines` and the local runtime.
- **Neon:** the owner accepted Neon's Marketplace terms personally. Installed `kestrel-gives-db` (Free plan `free_v3`, region iad1, Neon Auth and Realtime off), connected to Production only with no env pull. 16 env variables were created, all in Production; Preview and Development have none, and `.env.local` is untouched.
- **Hard:** neither the Vercel CLI nor the store API exposes Neon's "create a database branch per deployment" setting. Since the connection is Production-only, preview deployments get no Neon variables, but the toggle itself has to be checked in the dashboard.
- **dev branch:** the owner created `dev` from `main` in the Neon console and changed its auto-delete from Neon's default of 1 day to Never (#29). The owner couldn't find the dashboard's preview-branching toggle, so the check moves to Group G: list Neon branches after the first deploy and flag anything other than `main` and `dev`.
- **Hard:** copying the `dev` connection string by clipboard (`pbpaste`) failed twice. Both times the clipboard held other text (647, then 268 bytes, with no Postgres URL). The format check caught it before anything was written.
- **Third clipboard try worked.** The owner re-copied, and the script was changed to find the URL anywhere in the copied text. `.env.local` got the `dev` URL; Vercel Preview (stored as a secret) and Development got `DATABASE_URL`; the clipboard was cleared. `dev` (`ep-rough-smoke-…`) and `main` (`ep-super-wave-…`) are different endpoints. `main`'s URL was only ever in a temp file that was deleted right away.
- **Migrations and seed:** `scripts/migrate.ts` (a `schema_migrations` table, one transaction per file, a table lock so two runs can't collide), `migrations/001_init.sql` (placeholder `app_meta`), and a placeholder `scripts/seed.ts`. All go through a guard that refuses the `main` branch (#30). Tested: the guard blocks a URL with `main`'s endpoint and a missing setting; migrate run twice → "applied", then "Up to date"; seed run twice → still 1 row; a deliberately broken migration rolled back completely and wasn't recorded.

### 2026-10-31 — Group E: storage
- **Built:** public Blob store `kestrel-gives-blob` (iad1), with its token in Production and Preview only. The storage layer is `lib/storage/` (path rules, local driver, Blob driver, selector). Blob is used only on Vercel Production and Preview; everything else uses `.local-uploads/`. 17 `node:test` tests cover the prefix guard, the local driver, and which backend gets picked.
- **Owner stepped in:** connected Blob to Preview too, but required separate prefixes and a storage layer that can't delete outside its own prefix, with a test (#31). Decided seed photos are committed static files, not Blob (#32). SPEC bumped to v1.2.
- **Surprised:** `vercel blob create-store` also pulled the Development env variables into `.env.local`, which rewrote it and dropped its comments, and appended to `.gitignore` again. A backup taken just beforehand made it easy to check: `DATABASE_URL` still pointed at `dev`. Comments restored, `.gitignore` edit reverted, backup deleted. This is exactly the case the main-branch guard (#30) was built for.
- **Checked the tests catch a broken guard:** with the prefix check disabled, 12 of 17 tests failed; restored, all passed.
- **Placeholder:** nothing serves `.local-uploads/` over HTTP yet. That route comes in Milestone 5 along with uploads and the server-side type and size checks.

### 2026-10-31 — Group F: local dev
- **Built:** `scripts/dev.ts` (runs `tsc --watch` and `vercel dev` with prefixed output, stops both on Ctrl-C or if either dies), the `npm start` script, `npm run db:check`, a placeholder `public/index.html` with the footer disclaimer, and the README (with the clean-room sentence, setup, `.env.local` keys, and the rewrite warning). `NEON_MAIN_ENDPOINT` and `NEON_DEV_ENDPOINT` added to Vercel's Development environment (#34).
- **What was hard:** `npm run dev` wouldn't work with `vercel dev`. With a `build` script, `vercel dev` uses its static-build builder, which looks for a `dev` script and runs it. Ours led back to `vercel dev`, so the first symptom was a confusing `sh: yarn: command not found` (the project uses npm). Short experiments narrowed it down: an empty `devCommand` failed the same way; removing the `dev` script made everything work; making `dev` call `vercel dev` with `devCommand` running `tsc --watch` was refused outright with `DEV_RECURSIVE_INVOCATION`. The builder's source is in a cache folder outside the project, so it wasn't read (clean-room rule); Vercel's docs and experiments were enough.
- **Owner stepped in:** stopped the hunt for a way to keep the name `npm run dev` and chose the simplest working setup: `npm start`, with no `dev` script (#33).
- **Also caught:** Ctrl-C left `vercel`'s native child process running as an orphan. Fixed by starting each tool in its own process group and stopping the whole group. Retested: Ctrl-C stops everything, and killing `tsc` stops `vercel` too.
- **Tested:** `/` (200, footer present), `/js/main.js` (200), `/api/health` → `{"ok":true}`; editing `src/main.ts` showed up in the served file within seconds. `db:check` passes, and it fails clearly on a URL pointing at `main` or a missing guard setting.

### 2026-10-31 — Group G: first deploy
- **Health check:** `/api/health` now imports from `lib/` (to test `.ts` import extensions on Vercel), runs `SELECT 1`, and reports only a `main`/`dev` label (owner's call: no infrastructure IDs on a public site, #35). Locally: `{"ok":true,"db":"dev"}`.
- **The secret hook caught us:** the first commit attempt was blocked because the new unit tests used fake `user:pass@host` URLs. The fixtures were rewritten without credentials instead of loosening the hook.
- **First deploy:** pushed `main` at 12:59:28 EDT; production was Ready 12 seconds later at `https://kestrel-gives.vercel.app`. Checked: `/` 200 with the footer, `/js/main.js` and `/styles/tokens.css` 200, `/api/health` → `{"ok":true,"db":"main"}` with `no-store`. So Vercel's build handles the `.ts` import extensions.
- **Production migration blocked:** running `db:migrate --allow-main` against `main` was blocked by Claude Code's permission system as a production change. Left for the owner to run or allow. Not needed for health, which only runs `SELECT 1`.
- **Preview:** pushed the throwaway branch `preview-smoke-test`; the preview was Ready in 10 seconds. It's behind Vercel's deployment protection (302 to login), as expected. Protection left on; `vercel curl` not used, since it might create a bypass secret on the project. The URL went to the owner to check in a browser.
- **Owner stepped in:** checked the protected preview in a browser (`{"ok":true,"db":"dev"}`), ran the production migration on `main` personally (`applied 001_init.sql`), and confirmed in the Neon console that only `main` and `dev` exist, so the preview didn't create a database branch. Asked for a proposal in Milestone 2 on how production migrations should run going forward.
- **Cleanup:** deleted the `preview-smoke-test` branch (local and GitHub) and removed its preview deployment.
- **Minor:** `/js/main.js.map` returns 403 on Vercel; not needed in production, left as is.

### 2026-10-31 — Group H: conformance checks
- **Built:** all six SPEC §12 checks as npm scripts, plus `npm run check` to run them all (#36):
  - `check:deps` reads the allowlist from SPEC.md's own table.
  - `check:tokens` flags hex colors, color functions, and non-zero px/rem/em outside `tokens.css`, with unit-tested rules.
  - `check:types`.
  - `test:rules`: 22 passing tests, plus the 9 SPEC §7 rules listed as todos.
  - `check:a11y`: axe WCAG 2.2 AA, light and dark.
  - `check:visual`: screenshots to `visual-review/`, light and dark, `?demo=off`.
  - The browser checks reseed `dev` first.
- **Proved each check can fail:** an unapproved package, raw `12px`/`#c0ffee` in `src/`, and a page missing `lang` and image `alt` each produced a clear failure.
- **Hard / caught:** Playwright's default hard kill of the web server skipped the dev runner's cleanup and left `tsc` and `vercel dev` running. Fixed with Playwright's `gracefulShutdown` (SIGTERM); confirmed nothing is left after a run. Playwright browsers install into `node_modules/` rather than the home-folder cache, to keep everything inside the project (#37).
- **Full run:** `npm run check` passed all six from a clean state. `npm audit`: only the accepted zod chain (#27).

### Milestone 0 retrospective
- **AI did well:**
  - Raised gaps before writing code (`@types/node`, the Marketplace ordering, the tokens path).
  - Kept secrets out of the transcript throughout: endpoint IDs only, temp files deleted, a format check before writing.
  - Built guards that paid off the same day: the main-branch guard and the backup before `vercel blob create-store` rewrote `.env.local`.
  - Proved each check could fail, not just pass.
- **Where it went wrong or needed the owner:**
  - Spent several rounds of experiments trying to keep `npm run dev`; the owner called it and chose `npm start`.
  - The clipboard handoff failed twice before working.
  - The first hook version printed part of the offending line.
  - Two cleanup bugs (orphaned processes) were caught only by testing.
  - Claude Code's permission system blocked the production migration, so the owner ran it.
- **Owner decisions that shaped it:** push rules tied to checkpoints, previews on the `dev` database, no infrastructure IDs on the public site, a prefix-scoped delete guard for the shared Blob store, seed photos as static files, and `npm start`.
- **Owner sign-off:** Group H approved and pushed on 2026-11-01. Milestone 0 is complete.

---

## Milestone 1: Design system

**Started:** 2026-11-01 13:23 EST (clocks changed overnight: EDT → EST)
**Ended:** 2026-11-01 16:26 EST (C2 approved and pushed) · about 3 hours

### 2026-11-01 — Stage 1: visual directions
- **Slip:** while checking which fonts the screenshots would render with, Claude listed macOS's system font folders, which are outside the project. They contained only system fonts, nothing from the original work, but it broke the work-only-in-this-folder rule. Flagged to the owner right away. Font choices use standard cross-platform stacks instead of relying on what's installed.
- **Built:** three direction pages in `design/directions/` (A Field Guide, B Raffle Day, C Wingheart), each with both marks, a palette, type, and a sample header, tile, buttons, pills, and banner, screenshotted in light and dark. All 66 text/background pairs were checked for WCAG AA in both modes before any page was built; logo-only colors are labeled as never used for text. The pages sit outside `public/` and aren't deployed.
- **Hard:** drawing recognizable kestrels by hand in SVG. The first pass had a parrot-like head (A), a star-shaped hovering bird (A), and a mark that read as a tulip or a bat (C). Reviewing each screenshot before showing the owner caught these, plus inverted ticket notches (B, which I then "fixed" the wrong way and reverted), an i-dot colliding with text (C), and plumage spots that vanished in dark mode (A). One round of screenshots failed silently behind a suppressed error and showed stale images until rerun.
- **Fonts:** every direction uses system font stacks, so the screenshots are honest. Each names one optional self-hosted OFL display font (Fraunces, Bricolage Grotesque, Nunito) to propose separately. No font files were added.

### 2026-11-01 — Stage 1b: the owner's logo
- **Owner stepped in:** chose Direction C's system but supplied their own kestrel logo (teal bird for the org, teal bird with a heart for the event), with changes: a smaller dark beak (it read as a parrot), coral only for the heart, and a head-only version for small sizes. A and B rejected (#38).
- **Built:** `design/directions/c2-wingheart-owner-logo.html`: both marks redrawn as SVG symbols built from tokens (light and dark), a small head-only version, all shown at 64, 32, and 16px and in one color; the hero wordmark (event mark + "Kestrel" + hand-drawn "gives"); C's palette and sample components using the logo's teal.
- **Hard:** the original sits on black, so its open white chest dissolved into light backgrounds; added a thin teal rim. The first redraw got the proportions wrong (head too small, body too thin) and the event mark collided with the lettering; both were redrawn. The logo file is in the owner's Downloads folder, outside the project, so it wasn't opened: colors and proportions were taken by eye from the attached image, not sampled.

### 2026-11-01 — Stage 1c: the owner's final logo files
- **Owner stepped in:** supplied final logo files in `design/source/logos/` (org mark, event mark, and the pair) and set a rule: use them unmodified, with only whitespace cropping and resizing or exporting allowed. Dropped the SVG redraws from Stage 1b. Asked for exact sampled colors, light tiles behind the marks in dark mode, the org mark as the favicon, and the hero kept as event mark + heavy teal "Kestrel" + coral "gives" + butter swash (#39, SPEC v1.3).
- **Built:**
  - **Colors:** sampled with a small scratch PNG decoder (Node's zlib only, no new dependency). From the event mark: teal #036765, coral #F86256.
  - **Contrast:** teal passes as text (6.37:1 on the page background, 6.71:1 for white on teal). Coral is 3.06:1 on white, so it's for the logo only; text keeps the AA coral.
  - **Exports:** made with macOS `sips`: crop to the art, then resize to `public/brand/` (org mark 64 and 128px tall, event mark 280 and 560px tall) and `public/favicon-16.png` / `-32.png` (padded to a square with transparency). The source files' checksums were verified unchanged afterward.
  - **c2 page:** regenerated with `<img>` tags in place of SVG symbols. The one-color variants were removed, because recoloring isn't allowed. CREDITS.md was created.
- **Hard / caught:**
  - **No transparency in the event mark:** its file has a white background built in, so it can't sit directly on a colored or dark page. The hero became a light card in both modes, and every mark sits on a #FEFEFE tile in dark mode.
  - **Teal differs between files:** #036765, #086060, and #026465. The event mark's value was chosen.
  - **Apple touch icon:** first left out, because it needs the art placed on white. The owner approved that as placement, not editing. `public/apple-touch-icon.png` is the org mark resized to 140px tall, centered on a white 180px square with a zlib-only scratch script. The source checksums were verified unchanged.
- **Favicon note:** the org mark is used as-is. At 16px most of the detail is lost; a dedicated small mark could come later.
- **Later, possibly:** a version of the event mark with a transparent background (and a solid white face and chest) would let the Home hero sit directly on the dark page instead of on a white card. The owner accepted the white card for now.
- **Owner sign-off:** approved on 2026-11-01. Kept teal #036765 and kept the source logos tracked in the repo, because their provenance is part of the case study.

### 2026-11-01 — Stage 2: token sheet
- **Pushed:** the logo checkpoint went live after approval, with the Apple touch icon added. Production serves `/favicon-32.png`, `/apple-touch-icon.png`, and `/api/health`, all with status 200.
- **Built:**
  - `public/styles/tokens.css`, the real token file. It has 41 color tokens, each as `light-dark(light, dark)`, plus type, spacing, sizes, lines, radius, shadow, motion (0ms under reduced motion), and layers (#40).
  - `design/token-sheet.html`, which reads that file in the browser. It shows every color in light and dark side by side, computes 56 contrast checks live (28 pairs in both modes), and shows the type scale, spacing, radius, shadows, motion, and a preview of the tokens combined. Screenshots are in `design/screenshots/token-sheet-{light,dark}.png`.
  - `check:tokens` now also fails if a color token lacks a dark value. It has unit tests (25 passing) and was proven to fail on a single-value token (SPEC v1.4 §12).
- **Hard / caught:**
  - **Crown contrast:** the live contrast table flagged the crown outline in dark mode at 1.93:1. In dark mode the butter fill gives the crown its edge (11:1), so the check now tests each mode's actual edge.
  - **Screenshot slicing:** `sips` slices of the tall screenshot silently came out identical (it crops around the center), so a small zlib-only cropper replaced it for review.
  - **First-pass layout:** the color tables' columns didn't line up and the spacing bars were unreadable; both were fixed before showing the owner.
- **Checks:** `npm run check` passes all six.

### 2026-11-01 — Stage 2b: token review changes
- **Owner stepped in:** approved the token sheet with six changes:
  - keep the color-pairing rule
  - add type roles over the scale, with fluid display sizes
  - allow named breakpoints in conditions only
  - add a responsive requirement (360px up, nav collapses to a menu, checks at 390 and 1280)
  - add a Figma-name column (Figma mirrors the tokens, synced by hand on Pro)
  - use one self-hosted Google Font, picked from three candidates
- **Built:**
  - **Type roles:** 12 `--type-*` roles. `--text-3xl` and `--text-4xl` are now fluid. `check:tokens` flags `var(--text-*)` outside `tokens.css` (#41).
  - **Breakpoints:** `--breakpoint-sm` (40rem) and `--breakpoint-lg` (64rem) are documented in `tokens.css`. `check:tokens` reads them from there and allows exactly those values, only inside `@media`/`@container` conditions, including conditions that span lines. There are 6 new unit tests, so 31 now pass (#42).
  - **Playwright:** four projects (light and dark, each at 390px and 1280px). axe passes in all four.
  - **Token sheet:** rewritten to be responsive at 390px (color rows stack; the contrast table scrolls in a labeled region) and to use the type roles itself. It adds:
    - a Figma-name column and a mapping rule (#43)
    - a section showing the three fonts side by side, each with a mini preview
    - a breakpoints section
    - a preview whose nav collapses to a menu below 40rem
  - **Screenshots:** the full sheet, the preview, and the font comparison at 1280px and 390px are in `design/screenshots/`.
  - **SPEC v1.4:** §5 (type roles, breakpoints, font, Figma), a new §8 Responsive section, and §12 (the token check, and checks at both widths).
- **Fonts:** Nunito, Figtree, and Plus Jakarta Sans were downloaded once, at build time, as Latin-subset variable WOFF2 files through Google Fonts' CSS API. Each file was checked for the `wOF2` signature. Licenses were confirmed from each family's `OFL.txt` and `METADATA.pb` in the google/fonts repo: all are SIL OFL 1.1. The files sit in a gitignored `design/font-candidates/` until the owner picks.
- **Hard / caught:**
  - **NaN in the type-role table:** the browser returns custom properties with their `var()`s already resolved, so the parser was reading the wrong thing. It now parses the resolved value and maps it back to token names.
  - **Mini previews:** their nav wrapped inside the narrow font columns. It now collapses with a container query at the same 40rem. The real header will use `@media`.
  - **Overflow:** none at 390px or 360px. At 320px (the WCAG reflow width) the preview overflows by 13px. That was raised with the owner rather than fixed silently.
- **Checks:** `npm run check` passes all six.

### 2026-11-01 — Stage 2c: heading font, reflow, bid copy
- **Owner stepped in:**
  - Rejected Nunito as too childish and changed the plan: system fonts for body and UI, plus one heading font, with Plus Jakarta Sans, Manrope, and Outfit as the candidates (#44).
  - Agreed to keep 360px as the design target with a reflow floor at 320px, and asked for an automated check (#45).
  - Caught a sample-copy bug: "At least $46. Bids go up by $1." contradicts the $5 default increment. Asked for tabular numerals on amounts (#46).
- **Built:**
  - **Tokens:** `--font-display` became `--font-heading` and is used only by the display and heading roles and the hero "Kestrel". `--type-amount` moved to the system stack. New token `--figures-amount: tabular-nums`.
  - **Reflow:** `tests/e2e/reflow.ts` and `reflow.spec.ts`, plus a `reflow-320` Playwright project and `npm run check:reflow` as check 7. It fails on sideways page scroll or content clipped sideways, and allows scroll regions and ellipsis truncation. It was proven on synthetic pages (wide page, clipped card, allowed table and ellipsis) and on the real bug.
  - **Token sheet:** the bid copy now reads "At least $50. Bids go up by $5.", and tabular figures are used throughout. The font section now compares headings and the hero lockup in the three candidates side by side, with body text on the system stack. `?heading=jakarta|manrope|outfit` sets the whole sheet's headings in one candidate.
  - **SPEC v1.4:** §5 fonts, type roles, and tabular figures; §7.4 bid copy comes from settings; §8 the 320px reflow floor; §12 check 7. README lists seven checks.
- **Fonts:** Manrope (24 KB) and Outfit (32 KB) were downloaded the same way as before: a Latin-subset variable WOFF2, the `wOF2` signature checked, and the SIL OFL 1.1 license confirmed from `OFL.txt` and `METADATA.pb` in google/fonts. Nunito and Figtree were removed from the candidates folder.
- **Hard / caught:**
  - **Wrong element measured:** the 13px overflow came from the mini previews inside the narrow font columns, not the main preview. My earlier probe had measured the first `.preview` in the page without checking which one it was.
  - **Clipped, not scrolling:** the header couldn't fit in 248px and was clipped by `overflow: hidden`, so the page never scrolled sideways and a page-scroll check alone would have missed it. Fixed by letting the header wrap.
  - **DOM types:** the reflow helper declares its own minimal browser types, so the server tsconfig stays free of DOM types (#26).
- **Checks:** `npm run check` passes all seven.

### 2026-11-01 — Stage 2d: Plus Jakarta Sans and the type-only lockup
- **Owner stepped in:**
  - Picked Plus Jakarta Sans for headings (#44).
  - Simplified the hero lockup: "gives" set in Jakarta in coral under the teal "Kestrel", with no hand-drawn lettering, no heart over the i, and no swash, and one accessible name (#47).
- **Built:**
  - **Font:** `public/fonts/plus-jakarta-sans-latin-var.woff2` plus its `OFL.txt`. `@font-face` is in `tokens.css`, with a URL relative to the stylesheet so it works served and on the `file://` design pages. `--font-heading` is now `"Plus Jakarta Sans", <system stack>`.
  - **Lockup tokens:** `--text-5xl` (fluid 40→72px), `--leading-lockup`, `--tracking-lockup`, and the `--type-hero` role.
  - **Lockup:** an HTML lockup (`role="img"`, `aria-label="Kestrel Gives"`, mark `alt=""`) replaces the SVG lettering on the token sheet.
  - **Base styles:** `public/styles/base.css` sets page defaults from tokens; it's the first piece of the component work. The placeholder page loads it and preloads the font.
  - **Cleanup:** the candidate fonts folder was deleted, along with its `.gitignore` line.
- **Verified:**
  - **On the served page:** one font request (the preload is reused), the `h1` computes to Plus Jakarta Sans, there are no console warnings, and the file is served as `font/woff2`.
  - **On the sheet:** at 1280, 390, and 320px there are no reflow problems and the lockup has a single name.
  - **Preload on design pages:** a preload can't work on a `file://` page (the browser blocks it as cross-origin), so the design page doesn't preload. The font still loads there through `@font-face`.
- **Checks:** `npm run check` passes all seven.

### 2026-11-01 — Stage A (components), part 1: plumbing and the crown
- **Owner stepped in:** approved the stage A plan and specified the details:
  - CSS joined in a deterministic order with `@layer`
  - about 12 original line icons on a 24px grid, `aria-hidden` when decorative and labeled when standalone
  - a public gallery
  - class, variant, and state names kept consistent with DESIGN-SYSTEM.md, because the owner is mirroring the library in Figma after each checkpoint
  - the crown shown first
- **Built:**
  - **CSS build:** `scripts/build-css.ts` (with `build-css-lib.ts` and 3 unit tests) runs in `npm run build`, and `npm start` watches it. `base.css` is now in `@layer base` with a `.visually-hidden` utility (#48).
  - **Gallery:** `public/design-system/` with its own layout CSS. It's added to the screens list, so axe, reflow, and visual cover it (#49).
  - **Avatar:** `avatar.css` with sm, md, and lg sizes and the crown. The crown is an original drawing on a 32×24 grid: three uneven points with round tips, a soft band, and curves instead of straight lines. It sits tilted −16° at the top-left edge. Avatars are `aria-hidden` next to the person's name, and the name carries "(top bidder)" as hidden text.
- **Hard / caught:**
  - **Floating crown:** the first placement floated above the small avatar instead of sitting on its edge. Caught in the 3× screenshots and moved.
  - **Reflow false positive:** the reflow check flagged the visually-hidden text, which clips on purpose. The checker now skips elements of 1px or less, and synthetic cases confirm real clipping is still caught.
  - **Crown contrast:** contrast was checked where the crown meets the avatar as well as the page. Each edge has one part at 3:1 or better: in light mode the fill against the dark-teal avatar (4.9:1) and the outline against the page (7.5:1); in dark mode the outline against the light-teal avatar (3.9:1) and the fill against the page (12.4:1).

### 2026-11-01 — Stage A (components), part 2: the core components (15:09–15:22 EST)
- **Built:**
  - **Tokens:** accent and danger hover/active, `--color-on-danger`, `--size-target-sm`, icon sizes sm/md/lg, `--size-toast`, `--duration-spin` (0ms under reduced motion). All contrast-checked on the token sheet.
  - **Icons:** `src/components/icons.ts`, 14 original line icons with `icon()` and `hydrateIcons()`, plus `icon.css`.
  - **Components:** `button.css` (4 variants, 2 sizes, icon and block layouts, 6 states including loading), `link.css`, `pill.css`, `banner.css`, `toast.css` with `src/components/toast.ts`, `card.css`, `empty.css`.
  - **Gallery:** a section per component, each state in light and dark side by side, and a live toast demo (`src/design-system.ts`).
  - **DESIGN-SYSTEM.md:** conventions, Figma naming, and an entry per component with purpose, classes, all eight SPEC states (N/A with a reason where they don't apply), accessibility, do/don't, and Figma component and property names (#50).
- **Hard / caught:**
  - `check:tokens` flagged "24px" in a CSS comment (the comment stripper handles single-line comments only); reworded to "24-unit grid".
  - `hydrateIcons()` dropped the placeholder's classes, so the empty-state icon lost its muted color; it now carries classes over.
  - The first card layout nested the pane grid inside each pane, giving one huge card per row; cards now use a compact grid.
- **AI did well:** kept every value on tokens, and mapped the eight SPEC states for each component instead of only the interactive ones.
- **Checks:** `npm run check` passes all seven.

### 2026-11-01 — Stage A checkpoint: owner review (15:22–15:24 EST)
- **Owner stepped in:** approved stage A with fixes. Removed payment language from the samples ("Pay now", "Paid", "Proof of payment due" → "Upload proof", "Approved"/"Proof due", "Proof of donation due"), corrected the demo banner (no nightly reset), made the donor a coworker, made the info banner neutral, and asked for a content rule in DESIGN-SYSTEM.md (#51).
- **Hard / caught:** the longer "Upload proof" button pushed the success banner 11px past a 320px screen; the reflow check caught it, and banner actions now wrap. "Receipt" was left off the banned-word list because SPEC names the "bid receipt" and "purchase receipt" statuses.
- **Checks:** `npm run check` passes all seven.

### 2026-11-01 — Stage B (forms) (15:24–15:40 EST)
- **Owner stepped in:** whole dollars only, everywhere, including the proof amount (my proposal allowed cents there), with digits-only text inputs and the message "Whole dollars only."; added to SPEC §7.9 (v1.5, #52). Confirmed "(optional)" markers with no asterisks. Kept the success and info banner colors.
- **Built:**
  - **Rules (no DOM, unit tested):** `src/components/form-rules.ts`: whole-dollar parsing, `dollarsToCents`, field messages, photo checks, reordering. 13 tests.
  - **Behavior:** `forms.ts` (`enhanceForm`, error summary, `enableWhenChosen`, custom checks) and `uploader.ts`.
  - **CSS:** `field.css`, `input.css` (text, textarea, money, select, date-time, prefix and suffix), `radio-card.css`, `uploader.css`, `error-summary.css`, and a `--size-thumb` token.
  - **Gallery:** every state in light and dark, plus a working "Submit an item" demo: the sale type unlocks the form, auction or instant-sale price fields, photos, and the error summary.
  - **Docs:** DESIGN-SYSTEM.md has form conventions and 8 new entries. SPEC v1.5 covers §7.9 money and §12.3 keyboard tests (#53).
  - **Keyboard tests:** `tests/e2e/keyboard.spec.ts`: sale-type gating, summary focus and links, whole-dollar and minimum messages that update and clear, photo reorder and remove with focus and announcements, and file problems.
- **Hard / caught:**
  - The keyboard test caught a real bug: validating on blur added a message above the submit button during the click, so the button moved and the click missed. Messages now appear only on submit.
  - axe flagged the gray legend on a disabled radio group and the full uploader's add button. Labels now keep full contrast, and the full button uses muted text, because it stays focusable.
  - The reflow check flagged a long value inside a text input. Inputs scroll their own text, so the checker now skips form controls; synthetic cases confirm it still catches clipping and an input that widens the page.
  - The gallery's bid-history list style leaked into the uploader lists, and radio cards spread their text to match a taller neighbor; both were fixed after reviewing the screenshots.
- **AI did well:** kept the money rule in one tested module that the server can reuse, and treated the test failure as a UX bug instead of loosening the test.
- **Checks:** `npm run check` passes all seven.

### 2026-11-01 — Stage B checkpoint: owner review
- **Owner stepped in:**
  - **Tap targets:** made the thumbnail controls full 44px targets (I had shrunk them to 32px to fit 96px thumbnails).
  - **Radio cards:** asked for space between the question and the cards, because the focus ring covered the question.
  - **Figma:** set the *Button* matrix to 28 combinations.
  - **Photo cap:** kept 4 MB as a placeholder and decided that Milestone 5 resizes photos in the browser before upload (#54, #55).
- **Hard / caught:** a grid `gap` on the fieldset couldn't add the space, because a `<legend>` sits outside the fieldset's grid; a top margin on the cards does. Added a test that every thumbnail control measures at least 44px.
- **Checks:** `npm run check` passes all seven, including reflow at 320px.

### 2026-11-01 — Stage C1 (page structure) (15:42–16:00 EST)
- **Owner stepped in:**
  - **SPEC v1.6:** made the 44px target rule part of SPEC §6 (#56), and asked for the nav collapse point to be justified there (#57).
  - **Profile menu:** chose the disclosure pattern over `role="menu"` (#58).
  - **Tabs:** dropped them, since no screen needs them (#59).
  - **Item tiles (C2):** asked for ended-phase states ("You won", "Ended", "Sold out").
- **Built:**
  - **Skip link.**
  - **Site header and nav:** a container query collapses it to a Menu button below 64rem of its own width.
  - **Profile menu:** a disclosure for admins, avatar only for employees.
  - **Page header.**
  - **Demo bar:** `<details>`, inverse colors with a striped edge, Viewing as, Jump to with `aria-pressed`, Restore (raises an event until the dialog exists), the collapsed state remembered, announcements, and `?demo=off`.
  - **Hero lockup** as a component.
  - **Behavior:** `disclosure.ts` and `demo-bar.ts`.
  - **Tokens:** `--color-mark-backing` and `--size-lockup-mark`.
  - **Keyboard tests (5 new):** skip link, nav menu, profile menu, demo bar announcements, and the remembered collapse with `?demo=off`.
- **Hard / caught:**
  - **Nav width:** measured the expanded nav at about 52rem before choosing 64rem.
  - **320px reflow:** the collapsed header (394px) and a select with long options both overflowed. The header now wraps its name (not the avatar) and shows an icon-only Menu button when narrow; fields and selects now shrink (#60).
  - **Focus after outside clicks:** the keyboard test found that clicking inside `<main tabindex="-1">` focused `<main>`, which the "focus nowhere" rule missed.
  - **Test race:** the demo bar test reloaded before the async `toggle` event had saved its state; it now waits for the save.
  - **Token check:** it flagged "64rem" in gallery prose; the prose names the token instead.
- **Checks:** `npm run check` passes all seven.

### 2026-11-01 — Stage C2 (overlays and data) (16:00–16:20 EST)
- **Owner stepped in (the brief):** three dialog variants, including type-to-confirm for the yearly reset; tiles whose words are computed from data, with every status, and Cancelled only in Your Items; a carousel with no autoplay and thumbnails named "Photo 2 of 5"; a table with no sorting, but with a caption, tabular figures, row actions, a narrow-screen scroll region and an empty state.
- **Built:**
  - **Dialog:** `confirmDialog()` on native `<dialog>`, in confirm, danger and type-to-confirm variants, with loading and error states. The demo bar's Restore now opens the danger dialog.
  - **Item tile:** `item-tile-rules.ts` (amount line and one status, 10 unit tests) and `renderItemTile()`. The gallery fills the tile grids from data for every phase.
  - **Photo carousel:** `enhanceCarousel()`, arrows inactive at the ends, a live count, single-photo layout.
  - **Table:** `.table`, `.table-wrap` and `enhanceTableScroll()`.
  - **Keyboard tests (6 new):** dialog modality, Escape and focus return; a failed request; danger and type-to-confirm; Restore; carousel; tiles; table scroll focus.
  - **Docs:** DESIGN-SYSTEM.md entries for all four; DECISIONS #61–#65.
- **Hard / caught:**
  - **axe:** ended and cancelled tiles faded the whole card, so their pills fell to about 2:1 contrast. Only the photo fades now (#64).
  - **320px reflow:** the page scrolled sideways to 572px even though every table sat in a scroll box. The cause was visually hidden "by Maya Okafor" text in row actions: it's absolutely positioned and escaped the unpositioned wrapper. `.table-wrap` is now positioned (#63).
  - **Specificity:** `.table td { white-space: nowrap }` beat `.table__empty`, so the empty message ran off sideways on narrow screens.
  - **Tests:** Playwright won't click an `aria-disabled` button (it waits for it to be enabled), so the end-of-carousel check presses Enter. Chrome puts a space before visually hidden text in an accessible name ("…a month , Outbid"); speech is the same, so the test allows it.
- **AI did well / owner to confirm:** the ending-soon (24 hours) and low-stock (3 or fewer) thresholds are provisional (#61).
- **Checks:** `npm run check` passes all seven.

### 2026-11-01 — C2 checkpoint: owner review (16:20–16:26 EST)
- **Owner stepped in:** approved C2. Made the status thresholds final (24 hours, 3 or fewer), written into SPEC §10 (v1.7) with the numbers in one module, `src/components/thresholds.ts` (#61). Moved the banner's action button to the full 44px size rather than adding banners to the §6 exception (#66).
- **Caught along the way:** the Stage A gallery generator in the scratchpad still had the pre-review "Pay now" copy; brought in line with the page.
- **Checks:** `npm run check` passes all seven; `npm audit` shows only the accepted zod advisory (#27). Pushed as `6b9474c`.

### Milestone 1 retrospective
- **Time spent:** about 3 hours (13:23–16:26 EST), across visual directions, logo handling, the token sheet and four component stages (A, B, C1, C2): 27 components in the gallery, each in light and dark, with SPEC going from v1.3 to v1.7 and DECISIONS #39–#66.
- **What went well:**
  - **Checks found real bugs, not just style slips.** axe caught faded pills on ended tiles; the 320px reflow check caught the collapsed header, a select's widest option and visually hidden text escaping a table's scroll box; the keyboard tests caught focus landing on `<main>` after outside clicks.
  - **Words computed from data.** Tile amounts and statuses come from one tested module, so the gallery shows what the app will show.
  - **Checkpoints kept scope tight.** Each stage ended with screenshots and a short list of open questions, and nothing was pushed before approval.
  - **Figma-ready docs.** Every component has a DESIGN-SYSTEM.md entry with states and a variant matrix under 30.
- **What was hard:**
  - **The logo files:** a built-in white background, three slightly different teals, and the rule not to edit them shaped the hero card and dark-mode tiles.
  - **Reflow at 320px** took several rounds (header, selects, tables).
  - **Test-tool quirks:** Playwright treating `aria-disabled` as disabled, Chrome's spacing in accessible names, and string-form `evaluate` silently doing nothing.
  - **Specificity and stacking surprises** in CSS (the empty table cell, absolutely positioned hidden text).
- **Where the owner stepped in:**
  - **Direction and brand:** chose direction C, supplied the final logo files and set the logo rule (#39); chose Plus Jakarta Sans and the type-only lockup.
  - **Content:** no payment language, donors are coworkers, no scheduled demo reset.
  - **Accessibility rules:** 44px targets as SPEC §6 (#56), 44px thumbnail controls (#54), the banner action at 44px (#66).
  - **Patterns:** disclosures instead of `role="menu"` (#58), no tabs (#59), final tile thresholds (#61), the C2 component brief.
  - **Process:** Figma mirroring with matrices under 30 combinations; split components instead of growing them.
- **Slip to remember:** in Stage 1, Claude listed macOS system font folders outside the project; flagged right away. Nothing outside the folder has been touched since.
- **Owner sign-off:** C2 approved and pushed on 2026-11-01. Milestone 1 is complete.
