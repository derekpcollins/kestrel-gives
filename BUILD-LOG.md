# Kestrel Gives — Build Log

A running, honest record of how this project was built, for the case study. Times are US Eastern. Each milestone records a start and end time; git commit times are the fallback.

Entry format: what we built, what was hard, what AI did well, where the owner stepped in.

---

## To-do

- ~~**Milestone 3: land the live demo in the intended phase**~~ built in 3D: the one-off deploy step `m3-land-live-demo` (#84), plus the demo bar and the daily cron (#80). Runs on the push to main.
- ~~**Preview health**~~ done 2026-11-02 on the 3A Preview: `{"ok":true,"db":"dev","schema":"004","seedPhotos":true}` (#34/#35, #77).
- ~~**DECISIONS #68 details from the owner**~~ recorded 2026-11-02: only `neondb_owner` on all three branches; restore branch created 12:42:01 Eastern; never "Reset from parent" on it.
- ~~**Drop `app_meta`**~~ done: migration 003, live 2026-11-02 (#79).
- ~~**`error TS2688` in Vercel's function compile**~~ fixed, live 2026-11-02 (#79).
- **Milestone 6:** whether an admin-cancelled purchase returns the unit to stock (owner's lean: yes while the sale is open, not after close; #74).

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

---

## Milestone 2: Data

**Started:** 2026-11-01 16:37 EST (first 2A file; the owner's go on the plan came a few minutes earlier)
**Ended:** 2026-11-02 13:15 EST (2E live), apart from DECISIONS #68 details the owner is sending (role audit on `dev` and the restore branch, the restore branch's creation time) · about 20.5 hours of calendar time across two days

### 2026-11-01 — Plan review
- **Owner stepped in:**
  - **Migrations in the production build, with conditions:** run last, after compiling and the tests; require `VERCEL_ENV=production` and a confirmed `main` connection; an advisory lock around migrate and seed-if-empty; normalized line endings in checksums; log the free plan's restore window (#67, #68).
  - **One combined proof per person per event** instead of one per item, because every donation is split across all three charities. The total is computed; a changed total sends the latest proof back to pending (#69).
  - **"Ending soon" added to Jump to** (#70); the yearly reset creates a new event record (#71); a placeholder charity logo until the owner's files arrive (#72); photo rules and a contact sheet before any download (#73).
  - **Schema notes for 2B:** say which side of the `items.winning_bid_id` ↔ `bids.item_id` cycle is nullable or deferrable; `timestamptz` everywhere; index bids on (item_id, amount desc); a check on the six template keys.

### 2026-11-01 — Stage 2A: production migrations (16:37–16:47 EST)
- **Built:**
  - `scripts/migrate-lib.ts`: checksums (CRLF/CR → LF, SHA-256), `verifyApplied`, `decideDeploy`, `directUrl`, `withSchemaLock` (`pg_try_advisory_lock`, 2-minute wait), `runMigrations`.
  - `scripts/deploy-db.ts`, run last by `npm run build:vercel` (build, type-check, unit tests with `DATABASE_URL` and the Blob token removed, then deploy-db). `vercel.json` points at it.
  - `scripts/seed-lib.ts` (`isEmpty`, `seed`; still the placeholder until 2C). `migrate.ts` and `seed.ts` use the lock and a direct connection.
  - `/api/health` adds `"schema"` (the latest migration number).
  - **Tests:** 10 unit tests (checksums, edits, every deploy decision) and a new `test:db` suite of 5 tests against `dev` (order and checksums, rollback of a failing file, an edited file stops the run, checksum backfill, two concurrent runs). `npm run check` now runs eight checks.
  - **SPEC v1.8** (§3.1, §4, §7.2, §7.6–§7.8, §9, §10) and DECISIONS #67–#73. The gallery's demo bar has "Ending soon"; banners use the donation total and add "Your donation total changed"; the Proofs table shows proof amount and donation total.
- **Hard / caught:**
  - **The pooler breaks advisory locks.** The first concurrency test failed with a deadlock and a duplicate-type error: Neon's `-pooler` host is PgBouncer in transaction mode, so the lock was taken on one backend and the unlock ran on another. One idle pooled session kept holding the test lock, which made the next run wait until it timed out. Found it in `pg_locks`, ended that session (dev only, the test's own key), and moved migrations and seeding to the direct host. Had deploy-db used the pooled URL, a stuck lock could have blocked every later production build.
  - **`vercel dev` runs the build command too**, so local startup now type-checks and runs the unit tests; deploy-db skips there (`VERCEL_ENV=development`).
- **Not testable locally, by design:** the production + `main` path. It first runs on the push after this checkpoint: it will record a checksum for `001_init.sql`, apply nothing new, and seed-if-empty will stamp the placeholder `app_meta` row on `main`.
- **Checks:** `npm run check` passes all eight; `npm audit` unchanged (#27).

### 2026-11-01 — Stage 2A checkpoint: owner review
- **Owner stepped in:**
  - Kept `NEON_MAIN_ENDPOINT` and `NEON_DEV_ENDPOINT` in all three Vercel scopes (#34, #35): they're IDs, not credentials. Checked without printing values: both are set in Production, Preview and Development.
  - **The direct URL now comes from `DATABASE_URL_UNPOOLED`** (the Neon integration's, Production only, confirmed by name and scope), with the same main check plus a pooled-host refusal, and no fallback to stripping `-pooler` (#67 amended; SPEC v1.8 §4 wording corrected before its first push). 11 unit tests.
  - **Preview → dev:** Preview's `DATABASE_URL` is a sensitive variable, so `vercel env pull` returns a placeholder and it can't be compared from the CLI. No throwaway branch; the Milestone 0 browser check stands. **To do:** next time a preview deploys in the normal course of work, check its `/api/health` shows `"db":"dev"` and note it here.
- **First production run (16:53 EST):** pushed `fb8d19d`, `3e2627a` and `0945649`; production build Ready. Build log: unit tests 68 pass / 0 fail, then `deploy-db: production build; DATABASE_URL_UNPOOLED confirmed as the main branch (direct connection).`, `recorded checksum for 001_init.sql`, `Up to date.`, `deploy-db: first deploy, seeded (app_meta has 1 row(s)).` `/api/health` → `{"ok":true,"db":"main","schema":"001"}`. Stage 2A is complete.

### 2026-11-01 — Stage 2B: the schema
- **Owner stepped in:** ordering for `app_meta` and seed-if-empty (2B adds only; 2C switches the seed check with the real seed; the drop ships after 2C is live). `UNIQUE (id, item_id)` on bids, the auction-only winner check, and "a winner is never a removed bid", recomputed in the bid-removal code with both people's proofs reopened, plus a test for it.
- **Built:**
  - `migrations/002_schema.sql`: events, users, charities, items, item_photos, bids, purchases, proofs (one per person per event, with the total at upload), email_templates. Applied to `dev`; `main` gets it on the next push.
  - `lib/data/`: `withTransaction`, `donationTotalIn`, `recheckProofsIn`, `finalizeWinnersIn` (once, by a conditional update), `removeBidIn`.
  - `tests/db/schema.test.ts`: 19 tests, each in a rolled-back transaction, so `dev` is untouched: timestamptz everywhere, the bids index, money, stock, sale-type columns, winners (wrong type, wrong item, removed), removal pairs, rejection reasons, template keys, photo positions, one current event; finalizing once; totals; and removing the winning bid after close (the winner moves to the next highest bid, the old winner's total drops, the new winner's rises, both proofs go back to pending).
- **Hard / caught:**
  - **"Not removed" in the database:** a CHECK can't see another table. A probe on a throwaway schema on `dev` showed a deferred foreign key carrying a generated "removed" flag does enforce it, so it's in, alongside the approved two-column key.
  - **Deferred keys and rolled-back tests:** a deferred key is only checked at commit, which a rolled-back test never reaches; the tests force the check with `SET CONSTRAINTS ALL IMMEDIATE`.
  - **Proving the test can fail:** with the winner recompute deliberately removed from `removeBidIn`, the removal test failed; restored and confirmed identical.

### 2026-11-01 — Stage 2B checkpoint: owner review
- **Owner stepped in:** kept the database-level "winner is never a removed bid" key. Narrowed the proof re-check: only an approved proof goes back to pending; pending is unchanged; rejected stays rejected with its reason (SPEC v1.9 §7.6). Asked for one re-check function called from every path that changes a total.
- **Built:** `recheckProofsIn` now reopens approved proofs only, and is called from `finalizeWinnersIn`, `removeBidIn`, and the new `cancelPurchaseIn` and `cancelItemIn`. Four new database tests (28 in all): each proof status under a changed total, cancelling a purchase after an approved proof, cancelling items, and finalizing winners after a purchase-only proof.
- **Open question noted (#74):** whether an admin-cancelled purchase returns the unit to stock; decided with the admin screens.

- **Production run:** pushed `ce6f560` and `28b39fa` (with `1f3ce3e`). Build log: unit tests 68 pass / 0 fail; `deploy-db: production build; DATABASE_URL_UNPOOLED confirmed as the main branch (direct connection).`, `applied 002_schema.sql`, `1 applied.`, `deploy-db: data already present, not seeding.` `/api/health` → `{"ok":true,"db":"main","schema":"002"}`. Stage 2B is complete; `main` has the schema and no seed data.

### 2026-11-01 — Stage 2C: the seed (committed locally; ships with 2D)
- **Owner stepped in:** 2C is tested on `dev` and committed but not pushed on its own: `main` is seeded once, so 2C and 2D go out together after the photos are approved. Stock on a cancelled purchase waits for Milestone 6, with the owner's lean recorded in #74 (restock while the sale is open, not after close).
- **Built:**
  - `lib/seed/data.ts` (plain data, times relative to now) and `lib/seed/seed.ts` (`seedIn`, `seedIfEmptyIn`, `hasNoEventIn`), shared by `db:seed`, deploy-db and, later, Restore demo data. `scripts/seed-lib.ts` is gone, so nothing outside the migrations mentions `app_meta`.
  - `lib/email-templates.ts`: the six defaults, each with its own variables; proof requests use `{{donation_total}}`.
  - Placeholder images in `public/seed/` (photo, charity logo, proof), rendered from a scratch page, each labeled as a placeholder.
  - deploy-db: "empty" means no event row; it also skips seeding, with a log line, until the real photos are installed, so an early push can't spend the one-time seed on placeholders.
  - **Tests:** 7 unit tests on the data itself (counts, photo distribution, image paths exist, bids follow §7.4, purchases within stock, proof holders hold no top bid, templates use only their variables and no payment words) and 4 database tests (seed-if-empty both ways, an event alone counts as not empty, seeding twice gives identical rows, every §10 state present, with ending soon and won reached through the app's own date and finalize code). `npm run check` passes all eight: 75 unit and 32 database tests.
- **Hard / caught:**
  - **Parameter types:** reusing `$11` in a value and a `COALESCE` made Postgres deduce two types; explicit `::timestamptz` casts fixed it.
  - **TRUNCATE vs deferred checks:** the seed-twice test hit "cannot TRUNCATE items because it has pending trigger events". The deferred winner key queues checks for earlier changes in the transaction, so the seed checks that one key immediately before truncating and defers it again after. Restore demo data would have hit the same thing.

### 2026-11-02 — Stage 2D: seed photos (to 11:57 EST; awaiting the upload and checkpoint)
- **Owner stepped in:**
  - Chose Pixabay once Unsplash and Pexels turned out to block automated reads and Pexels had paused new keys, and supplied the API key in a gitignored file.
  - Approved the contact sheet, and fitted the item text to the photos instead of swapping them: hot sauce flavors, "Lemon squares", a hand-glazed pot. Accepted the cabin set spanning several weeks.
  - Chose Blob over git after I flagged the license's "Standalone basis" clause against a public repo, which reverses SPEC §4/§10 and #32 (SPEC v1.10, #77).
  - Picked display-time resolution, the base URL as a Vercel variable, and running the upload in their own terminal. Then amended: relative keys only, and a loud build failure plus a health flag for a bad base URL.
  - Approved the candle swap.
- **Built:**
  - `lib/seed/photos.ts` (the manifest) and `lib/seed/photo-url.ts`: `photoUrl`, the base URL check, the build check `scripts/check-seed-base.ts`, and `"seedPhotos"` in `/api/health`.
  - `scripts/seed-photos.ts` (process, upload), `scripts/jpeg-metadata.ts` (a dependency-free metadata stripper and quality estimate), and `scripts/check-no-seed-images.ts`, run by `npm run check` and the pre-commit hook.
  - Storage prefixes became an allowlist with `seed/` refused.
  - `CREDITS.md`, SPEC v1.10, DECISIONS #77 and #78. `PHOTOS_INSTALLED` is on.
  - Tests: 95 unit and 33 database tests pass. New: the manifest matches the items and credits, resolution in every environment, the base URL check never echoes the value, the git check, the delete guard for `seed/`, metadata stripping, and the seed never writing an absolute URL.
- **Hard / caught:**
  - **The license:** Pixabay's terms forbid standalone redistribution, and say resizing or cropping doesn't change that, so committing the files to the public repo would have been a problem. Raised before anything was downloaded.
  - **The shared `dev` database:** local dev and Preview read the same rows, so the seed couldn't write environment-specific URLs. Paths are resolved at display time instead.
  - **sips' quality scale isn't JPEG's:** "80" came out at about IJG 93, larger than Pixabay's own files. Calibrated by estimating quality from the quantization tables: setting 55 gives about 81. The script now checks every file falls within 75–85. The set went from 7.5 MB to 4.6 MB.
  - **A brand at full size:** the approved candle photo had "PATAK'S" embossed on a jar, invisible in the 340px thumbnails and readable at 1280px. Zoomed crops of anything that looked like lettering caught it; swapped with the owner's approval.
  - **Pixabay's API returned 403 to Python's default user agent**; a descriptive User-Agent fixed it. Its undocumented `user:` search found each photographer's other shots for the multi-photo sets.
- **AI did well:** checked the license text before downloading, spotted the shared-database problem before writing seed URLs, and didn't trust an encoder setting it could measure.
- **Upload and variable (2026-11-02):** the owner ran `npm run seed:photos:upload` with the token set for that one command: 26 photos under `seed/`, all publicly readable. I checked the saved base URL without printing it (valid; a sample photo serves `image/jpeg`, the same size as the local file) and piped it into `vercel env add SEED_PHOTOS_BASE_URL` for Production and Preview (stored as Secret, hidden).
- **Production run (2026-11-02 12:35 EST):** owner approved 2C + 2D; pushed `9a27f63`..`30f2b8e`. Build log: `check-seed-base: ok.`; unit tests 95 pass / 0 fail; `deploy-db: production build; DATABASE_URL_UNPOOLED confirmed as the main branch (direct connection).`, `Up to date.`, `deploy-db: no event found; seeded the demo.` `/api/health` → `{"ok":true,"db":"main","schema":"002","seedPhotos":true}`. Stages 2C and 2D are complete; `main` is seeded with real photos. Bidding on `main` closes about Nov 4 (see the to-do list).

### 2026-11-02 — Credential rotation after a leaked connection string
- **What happened:** the `neondb_owner` connection string for the new restore branch `main-seeded-2026-11-02` was pasted into a chat. Neon copies roles and passwords to child branches, so `main`'s and `dev`'s passwords are treated as exposed too.
- **Owner stepped in:** spotted the leak, ruled that no credentials are asked for or printed, and approved the plan: `main` first, then the restore branch, then `dev`, pausing after each. Pointed the health check at the deployment's real domain.
- **Step 1, `main` (done, 12:57 EST):**
  - The owner reset `neondb_owner` on `main` in the Neon console, reached from the Vercel integration.
  - All 15 Production database variables were rewritten by the Vercel-managed integration within minutes. I confirmed this from `vercel env ls` update times, printing no values; Neon's docs only promise this for the Neon-managed integration.
  - Redeployed with `vercel redeploy`, no push. The build showed `check-seed-base: ok.`, 95 unit tests passing, `DATABASE_URL_UNPOOLED confirmed as the main branch`, `Up to date.` and `an event exists; not seeding.`
  - `/api/health` returns `{"ok":true,"db":"main","schema":"002","seedPhotos":true}` on `kestrel-gives-derek-p-collins-projects.vercel.app` (via `vercel curl`, because Vercel Authentication protects it) and on the public alias. The previous deployment now reports `"Database unreachable."`, which shows the old password is dead.
  - Downtime: only database-backed endpoints, from the reset until the redeploy went live, a few minutes. The pages don't read the database yet.
- **Step 2, `main-seeded-2026-11-02` (done):** the owner reset `neondb_owner` on the restore branch in the Neon console. Nothing connects to it, so nothing else changed; the leaked password no longer opens it, so the restore point can't be damaged with it.
- **Step 3, `dev` (done):**
  - The owner reset `neondb_owner` on `dev` and pasted the new pooled URL straight from Neon into Vercel's `DATABASE_URL` for Development and Preview (Preview kept Secret), never through the chat.
  - `vercel env pull .env.local` rewrote the file (same four names, mode 600) with nothing printed. `npm run db:check` confirmed it points at `dev`, and `npm run test:db` passed 33 of 33 against `dev` with the new password.
  - The pull also appended `.env*` to `.gitignore`. That's redundant with the existing `.env` and `.env.*` rules, so I reverted it.
  - Existing preview deployments still have the old `dev` password and fail until the next preview deploy.

### 2026-11-02 — Stage 2E: drop `app_meta`, clean build log (awaiting checkpoint)
- **Owner stepped in:** asked for both as one small stage, with a production build log free of error lines.
- **Built:**
  - `migrations/003_drop_app_meta.sql`, applied to `dev`, with a database test that it's gone (34 database tests).
  - `"typeRoots"` in `tsconfig.json`, and `scripts/check-vercel-ts.ts`, which compiles the functions exactly the way Vercel's builder does; it now runs in `check:types`.
  - Recorded in DECISIONS #79.
- **Hard / caught:** the error appeared only on Vercel. Reading the builder's source (via the web, not the globally installed CLI, which is outside this folder) showed it compiles through a temporary tsconfig in the system temp folder, so TypeScript looked for type definitions from there. Mirroring that locally reproduced the exact message; the check was confirmed to fail without the fix.
- **Production run (2026-11-02 13:14 EST):** owner approved; pushed `a5ecc63` and `4f6ed4d`. Build log: `check-seed-base: ok.`, `✓ 1 Vercel Function(s) compile cleanly the way Vercel builds them.`, unit tests 95 pass / 0 fail, deploy-db confirmed `main`, `applied 003_drop_app_meta.sql`, `1 applied.`, `an event exists; not seeding.` No error lines. `/api/health` → `{"ok":true,"db":"main","schema":"003","seedPhotos":true}` on `kestrel-gives-derek-p-collins-projects.vercel.app` (via `vercel curl`) and `kestrel-gives.vercel.app`. Milestone 2 is closed apart from the #68 details (recorded 2026-11-02 during Milestone 3).


---

## Milestone 3: App shell and Home

**Started:** 2026-11-02, right after Milestone 2 closed (13:15 EST), with the plan review. Working on branch `m3-app-shell`; Preview deploys use `dev`, and `main` gets 3B–3D together after the final checkpoint.

### 2026-11-02 — Milestone 3 plan: owner review
- **Owner stepped in:** approved the four stages (3A event state and demo API, 3B app shell, 3C Home, 3D land the live demo). Answers: backward jumps clear winners and re-check proofs; "30+ days after" means closed 31 days ago; anyone can Jump or Restore, with a global ~10-second Restore cooldown and a **daily scheduled restore**; placeholder pages say "built in a later milestone of this demo"; screenshots at each checkpoint.
- **SPEC conflict caught and asked, not resolved:** SPEC §7.1 said "No scheduled jobs." The owner chose to allow the demo cron only: SPEC v1.11 (§3.1, §7.1), DECISIONS #80 narrows #11b. Schedule `0 8 * * *` UTC. The owner approved creating `CRON_SECRET`.
- **Researched:** Hobby cron and function limits, recorded in #80 and #81 (once a day, within the hour, no retries, possible duplicates; 12 functions per deployment without a framework).

### 2026-11-02 — Stage 3A: event state and the demo API (to 13:35 EST; awaiting checkpoint)
- **Built:**
  - `lib/data/event.ts`: pure `phaseOf`, `proofDeadlineOf`, and `currentEventIn`, which finalizes winners on the first read after close.
  - `lib/demo/`: `jump.ts` (`jumpDates`, `jumpIn`), `restore.ts` (`restoreIn`, `tryRestore`, transaction-level lock, cooldown, cron dedupe), `viewer.ts` (the `kg_viewer` cookie) and `requests.ts` (body parsing, JSON content type, constant-time cron auth).
  - Functions `GET /api/app`, `POST /api/demo` and `GET /api/cron-restore` (4 of 12), plus the cron in `vercel.json`.
  - `migrations/004_demo_restores.sql`, applied to `dev`. The schema lock key moved to `lib/data/locks.ts` so functions don't import scripts.
  - DECISIONS #80, #81, and the Hobby rollback line in #79.
- **Tests:** 20 new unit tests (115 pass, 9 todo) and 8 new database tests (42 pass). These cover each jump landing in its phase by the real clock, winners cleared and an approved proof reopened on a backward jump, the cooldown and cron dedupe, two concurrent reads after close finalizing exactly once (committed, then dev reseeded), and the lock refusing a second Jump or Restore. A smoke run of the three handlers against `dev` over the pooled URL returned the expected 200 / 404 / 415 / 429 / 401 responses. `npm run check` is green; `npm audit` shows only the accepted zod advisory (#27).
- **Hard / caught:**
  - Session advisory locks don't survive Neon's pooled connection in transaction mode, so Jump and Restore take `pg_try_advisory_xact_lock` on the same key deploy-db uses. Restore's core (`restoreIn`) takes no lock, because the deploy step (3D) already holds the session lock on another connection.
  - The first version of `currentEventIn` returned stale data to the request that lost the finalize race. It now re-reads after trying, and the concurrency test checks that both requests see the same finalized time.
- **Secret:** `CRON_SECRET` is in Production, Secret type. It was generated with `openssl rand` and piped straight into `vercel env add`, never printed or saved. A mistaken attempt to add a throwaway probe variable to learn the CLI's prompts was blocked by the permission check before it ran, so nothing extra was created. Lesson: read `--help` instead.
- **Speed note:** a full reseed takes about 6–7 seconds from this laptop (about 100 sequential inserts over WebSocket). On the Preview, next to Neon, a Restore took 1.5 seconds round trip, including `vercel curl`'s own overhead.
- **Preview (2026-11-02 13:35 EST):** pushed branch `m3-app-shell`, deployment `kestrel-gives-i86pm905r`. Build: 4 functions compile cleanly, unit tests 115 pass, and deploy-db skipped (preview). `/api/health` → `{"ok":true,"db":"dev","schema":"004","seedPhotos":true}`. `/api/app` returned Jules, live, 7 people and the three charities. `/api/cron-restore` without the secret → 401 (`CRON_SECRET` is Production-only, and Vercel runs crons only on Production). `POST /api/demo` restore → live.

### 2026-11-02 — 3A checkpoint: owner review
- **Owner stepped in:** approved 3A. Asked to keep requiring JSON on `POST /api/demo` (it also blocks cross-site form posts; kept), to confirm the `kg_viewer` flags (Secure on https, SameSite=Lax, Path=/; confirmed by unit tests and, without Secure on local http, an e2e test), and to mark the preview health check done (done). Sent the #68 details: the role audit and the restore branch's creation time, plus a new rule, never "Reset from parent" on that branch. All recorded in #68; the branch ID stays out of the repo.

### 2026-11-02 — Stage 3B: the app shell (to 14:00 EST; awaiting checkpoint)
- **Built:**
  - `src/shell.ts` fills each page's slots from `/api/app`: the demo bar (`renderDemoBar`, wired to `POST /api/demo` with loading and error states, plus the "Shared demo · resets daily" note), the site header and profile menu (`site-header.ts`), and the phase banner (`phase-banner.ts`).
  - Pure rules in `phase-banner-rules.ts` and `shell-rules.ts`; the shared `AppState` type in `src/app-state.ts`.
  - Placeholder pages for Silent Auction, Instant Sale, Your Items, Submit an Item and the Admin Dashboard, with clean URLs. A `page.css` component covers the content column, banner slot and footer.
  - DESIGN-SYSTEM.md has a new Page layout and footer entry and updated Demo bar states. Its content guidance no longer says the demo never resets on a schedule (SPEC v1.11). DECISIONS #82.
- **Tests:** 12 new unit tests (127 pass) and `tests/e2e/shell.spec.ts` (5 tests, serial, against the real API on dev): the JSON-only rule and cookie flags, the admin and employee profile menus with the cookie surviving a reload, the admin page's note, every jump (banner, pressed button, Submit an Item only in the submission window), and Restore with its cooldown message in the dialog. The five new pages joined the axe, reflow and visual checks. `npm run check` is green; `npm audit` shows only the accepted zod advisory.
- **Hard / caught:**
  - The new e2e test caught `display: flex` on `.banner` overriding the `hidden` attribute. Fixed for every component with `[hidden] { display: none !important }` in the base layer.
  - A type-only import of the icon names pulled a DOM file into the server's type check and broke `vercel dev`'s build. The banner rules now carry their own small union.
  - My first checkpoint screenshots caught chevrons mid-rotation and swapped the open and collapsed demo bar shots (the remembered state hadn't saved yet). Re-shot with reduced motion and the collapsed state set directly.
- **Preview (2026-11-02 14:00 EST):** deployment `kestrel-gives-nz7d04tsi`, Ready. `/api/health` → `{"ok":true,"db":"dev","schema":"004","seedPhotos":true}`; `/`, `/silent-auction`, `/admin` and `/submit` serve their pages through the clean URLs.

### 2026-11-02 — 3B checkpoint: owner review
- **Owner stepped in:** approved 3B with three fixes, all done:
  - between 24 and 48 hours the countdown shows hours ("47 hours"), with whole days only from 48 hours, and unit tests at both boundaries;
  - each placeholder is one sentence with no milestone number;
  - the employee avatar is exposed as an image with the person's name, not a control, with an e2e test covering the role and name, the cursor, no hover change and no tab stop.
  The branch ID stays out of DECISIONS.


### 2026-11-02 — Stage 3C: Home (to 14:20 EST; awaiting checkpoint)
- **Built:**
  - Home has a hero (the lockup as the h1, the event's name from the data, a lead and a one-line outline), How to participate as a four-step ordered list, and Where donations go ("split equally among these three charities" plus the three charities from `/api/app`).
  - The proof window in step 4 is computed from the event's dates.
  - New Hero, Steps and Charity card components, with gallery specimens and DESIGN-SYSTEM.md entries, plus two size tokens. DECISIONS #83.
- **Tests:** a unit test for the proof window (128 unit tests pass) and `tests/e2e/home.spec.ts`: the h1's name, the event name, the steps in order, the proof window, the charities in order, no item tiles and no payment words. Home stays in the axe, reflow and visual checks. `npm run check` is green; `npm audit` shows only the accepted zod advisory.
- **Hard / caught:**
  - `vercel dev` doesn't serve a folder created after it started (`public/js/pages/`); a restart fixed it.
  - The avatar test I added in the 3B fixes passed vacuously at first: a function written as a string and passed to `locator.evaluate` isn't run as a function, so both sides of the hover comparison were `undefined`. The full check caught the cursor half. Both checks now run as page expressions, and the test asserts that real styles were read.
- **Preview (2026-11-02 14:20 EST):** deployment `kestrel-gives-h7m81h8tl`, Ready. `/api/health` → `{"ok":true,"db":"dev","schema":"004","seedPhotos":true}`; Home's script is served, and `/api/app` reports the live phase and the three charities.

### 2026-11-02 — 3C checkpoint: owner review
- **Owner stepped in:** approved the 3B fixes and 3C. Asked for 3D, with a final checkpoint before anything goes to main. The owner will review the Home contact sheets visually before approving the push.

### 2026-11-02 — Stage 3D: one-off deploy steps; land the live demo (to 14:30 EST; awaiting the final checkpoint)
- **Built:**
  - `migrations/005_deploy_steps.sql`, applied to `dev`.
  - `scripts/deploy-steps.ts`: an append-only list, plus `runDeploySteps`, which records each step in the same transaction as its work.
  - deploy-db runs the steps after migrations and seed-if-empty, inside the deploy lock. The first step, `m3-land-live-demo`, restores the demo once. DECISIONS #84.
- **Tests:** 7 new database tests. They cover once, re-deploy skip, two builds at once, failure then retry, refused names, and the real step restoring to live (rolled back). They also run the real `deploy-db.ts` against dev as preview, development, local, and a production build pointed at dev; each skips or refuses and writes nothing. One new unit test checks the step list. 129 unit and 49 database tests pass; `npm run check` is green; `npm audit` shows only the accepted zod advisory.
- **Preview (2026-11-02 14:30 EST):** deployment `kestrel-gives-p8fpmy5t5`, Ready. Build: 4 functions compile cleanly, unit tests 129 pass, `deploy-db: skipped, not a production build (VERCEL_ENV=preview)`. `/api/health` → `{"ok":true,"db":"dev","schema":"005","seedPhotos":true}`.

### 2026-11-02 — Final Milestone 3 checkpoint: owner review and pre-push fixes
- **Owner stepped in:** after a visual review of Home, asked for five fixes, then a push without another checkpoint if `npm run check` is green. All five are done (DECISIONS #85), each with an e2e test:
  1. demo bar labels top-aligned at 1280;
  2. the demo bar collapsed by default below 40rem, with the visitor's choice winning;
  3. the hero's paragraphs left-aligned on phones;
  4. a dark-mode calm phase banner (#3A3320 surface, butter border, #FDF3D0 text, 11.3:1), with ending soon kept bright;
  5. the placeholder logo redrawn as just "Logo", with `alt="Placeholder logo"`.
- **Caught:** top-aligning the labels exposed a second offset. A `<legend>` isn't a grid item, so the fieldset's gap never reached it, and the jump buttons sat 8px above the select. Fixed with a matching margin; the test now checks that both the labels and the controls line up.
- `npm run check` green (130 unit, 49 database, all browser checks); `npm audit` shows only the accepted zod advisory.

### 2026-11-02 — Milestone 3 production run (14:49–15:00 EST)
- **Pushed:** `main` fast-forwarded `4f6ed4d..7b13109` (3A–3D, the review fixes, BUILD-LOG and DECISIONS #80–#85). Deployment `kestrel-gives-5h4zj8w5u`, production, Ready.
- **Build log:** `check-seed-base: ok.`, `✓ 4 Vercel Function(s) compile cleanly the way Vercel builds them.`, unit tests 130 pass / 0 fail, deploy-db confirmed `main`, `applied 004_demo_restores.sql`, `applied 005_deploy_steps.sql`, `2 applied.`, `an event exists; not seeding.`, `step m3-land-live-demo: restored the demo data (bidding live).` No errors; only Vercel's known `npm warn Unknown env config "cache-dir"`.
- **Health:** `{"ok":true,"db":"main","schema":"005","seedPhotos":true}` on `kestrel-gives-derek-p-collins-projects.vercel.app` (via `vercel curl`) and `kestrel-gives.vercel.app`.
- **Live Home** (read-only look, no demo actions): bidding open, closing Wednesday, November 4 at 2:00 PM EST; three charities; no page errors or failed requests at 390 and 1280, light and dark. The demo bar starts collapsed at 390.
- **Cron:** `vercel crons ls` lists `/api/cron-restore` at `0 8 * * *`; the first run is due 2026-11-03 between 08:00 and 08:59 UTC.

**Milestone 3 ended:** 2026-11-02 15:00 EST · about 1 hour 45 minutes from the plan review.


### 2026-11-03 — First daily cron run confirmed (checked 08:36 EST, 13:36 UTC)
- **Request log:** one `GET /api/cron-restore` on production at **08:48:26 UTC**: status 200, user agent `vercel-cron/1.0`, deployment `kestrel-gives-5h4zj8w5u`. Vercel fires a Hobby cron anywhere within its scheduled hour, and this one landed at :48.
- **Runtime log:** the `cron-restore: restored` line couldn't be read. The Hobby plan keeps runtime logs only briefly ("does not retain runtime logs for the requested time range"), unlike request records.
- **Restore happened, and it was the cron:** the event dates moved to opened Nov 1 08:00 UTC and closes Nov 5 08:00 UTC. That's what a restore during the 08:00 UTC hour writes, because the seed rounds to the hour. Before, bidding closed Nov 4 at 19:00 UTC. No `/api/demo` requests reached production between 07:00 and 09:05 UTC, and nothing was deployed, so the restore can't have come from the demo bar or a deploy. The `demo_restores` row wasn't read: main is off limits to local scripts. The owner can confirm `source = cron` in the Neon console if wanted.
- **Health:** `{"ok":true,"db":"main","schema":"005","seedPhotos":true}` on both domains. `/api/app` shows phase `live`. `vercel crons ls` still lists `/api/cron-restore` at `0 8 * * *`.
- **Lesson:** next time, read the runtime log within the retention window, or rely on the request log plus the data, as here.

## Milestone 4: Browsing and buying

**Milestone 4 started:** 2026-11-02 16:29 EST, when the owner gave the go to start 4A without waiting for the cron check (that check is still scheduled for 2026-11-03 04:12 EST and will be logged separately).

### 2026-11-02 — Plan approved; Stage 4A: rules, data and API (16:29–16:52 EST)
- **Owner stepped in:** approved the plan and answered its four questions: no bidding on or buying your own item ("This is your item."); `/items/12` URLs; price sorted low to high only; the bid field starts at the minimum. Added three things: one unit per purchase, live-region announcements (with the 30-second refresh silent unless the viewer's own status changes), and `inputmode="numeric"`. Changed the order: start 4A now rather than after the cron check. Also sent Figma-line updates for DESIGN-SYSTEM.md (carousel, thumbnail, table, item tile, demo bar, 103 variables), folded in as docs only.
- **Built:**
  - `src/components/sale-rules.ts`: the shared rules for the minimum bid, its hint, the high-bidder and own-item blocks, phases, cancelled items, whole dollars, lost races and sold out. The API and (in 4D) the page both use it.
  - `lib/data/items.ts` (browse lists with three sorts; item detail with photos and public bid history) and `lib/data/sales.ts` (`placeBidIn` and `buyIn`: lock the item row, read `clock_timestamp()` after the lock, check the rules, write; a purchase re-checks the buyer's proof).
  - `api/items.ts`, `api/bids.ts` and `api/purchases.ts`: 7 of 12 functions. DECISIONS #86–#88; SPEC v1.12 adds the own-item rule to §7.4 and §7.5.
- **Tests:** 20 new unit tests (rules and input parsing; four business-rule todos retired) and 10 new database tests. Those include two bids at once (exactly one saved, the other told "Someone just bid $40. The minimum is now $45.") and five buyers for the last two units (two succeed, stock stops at 0, 12 purchases in all). 146 unit and 59 database tests pass; all browser checks pass; `npm audit` shows only the accepted zod advisory.
- **Caught:** a bid's time is now `clock_timestamp()`, not `now()`. `now()` is when the transaction *started*, so a bid that waited on the row lock would have been stamped before the bid it lost to, and could have slipped in after the close.
- **What AI did well / where it slipped:** two test failures were my own test data: Priya donated the lemon squares and Dev the hot sauce, so the own-item rule refused them, as it should.
- **Blocked, then unblocked:** pushing `m4-browse-buy` was first refused by Claude Code's permission check; the owner allowed it from their phone ("Try now") and the branch went up at 17:16 EST.
- **Preview (17:20 EST):** `kestrel-gives-moubcda5a`, Ready: 7 functions compile, 146 unit tests pass, `deploy-db: skipped` (preview), health `{"ok":true,"db":"dev","schema":"005","seedPhotos":true}`. The same 13 API calls as locally, through `vercel curl`, gave the same answers, including the new purchase message. Dev reseeded afterwards.

### 2026-11-02 — Stage 4B: browse pages (17:05–17:30 EST)
- **Owner stepped in:** asked for the purchase message to name the item ("You bought the Hand-knit scarf for $45."), done in `eb583ba`. Asked to carry on with 4B against the local server while away from the Mac, keeping a list of what still needs checking on the Preview.
- **Built:** Silent Auction and Instant Sale now show the item-tile grid from `GET /api/items`, with a count and a **Sort by** select: Newest, Price: low to high, and Most bids (silent auction only). The sort is kept in `?sort=`. A sort change is announced once the new order is drawn ("Sorted by price: low to high. 9 items."), and focus stays on the select. Redraws after view-as or a jump are silent. The pages also have empty and error states (with **Try again**). The pure parts live in `src/pages/browse-rules.ts`, and DESIGN-SYSTEM.md gains a *Browse toolbar* entry.
- **Caught in the screenshots:** cards with tall photos (the bike wheel, the hot sauce) grew taller than the rest. `.card__media` had `aspect-ratio: 4 / 3`, but its automatic minimum height let the photo stretch it; `overflow: hidden` fixes that. The gallery never showed it because its sample photos are already 4:3.
- **Caught in testing:** a check that focus stays on the select first used arrow keys. On macOS those open a closed select's menu instead of changing it, so the test now focuses the select and then changes it.
- **Tests:** 6 new unit tests and 4 new e2e tests. The e2e tests don't depend on the phase, because the shell spec jumps phases in parallel. 152 unit, 59 database and 57 browser tests pass; reflow and visual pass.
- **Preview (17:30 EST):** `kestrel-gives-bnnsfju23`, Ready. Health is OK. Both pages and their scripts are served, the card fix is in the deployed CSS, and the browse API returns the same orders as locally (`.review/m4-4b/preview-checks.txt`).
- **Still to check on the Preview:** the browse pages *in a browser*. Deployment protection blocks a headless browser and I won't turn it off or create a bypass secret, so the owner will look in their own logged-in browser. Everything else for 4A and 4B is checked there.

### 2026-11-02/03 — 4B fixes and Stage 4C: the read-only item page (2026-11-02 17:40 – 2026-11-03 08:58 EST, with an overnight pause)
- **Owner stepped in:** approved 4B with three fixes, all done in `662f552`:
  - the tile amount is only the number, with its label on the detail line ("Top bid · 2 bids", "Starting bid · No bids yet");
  - tiles in a row share one height;
  - ended instant sale says "Sale ended", not "N left" (with a unit test).
  The 4B screenshots were retaken. The owner then gave the go for 4C.
- **Built:** `/items/<id>` (a `vercel.json` rewrite to `item.html`; DECISIONS #86) drawn by `src/pages/item.ts`:
  - a back link, the title and "Donated by …";
  - the carousel beside an amount panel. The amount, detail and pill come from the tile rules, so a page and its tile agree. The note covers each state: the computed minimum, high bidder, own item, sold out, opens when, who won, sale ended.
  - a cancelled banner, the description, and the public bid history with the crown. Times are in the viewer's zone with the zone labeled.
  - not-found and error states.
  - a 30-second refresh while the tab is visible. It keeps the photo the visitor is on and announces only the viewer's own standing ("You've been outbid. The top bid is now $300."). `renderAvatar()` now builds the crown in code. DESIGN-SYSTEM.md gains an *Item page* entry.
- **Caught:**
  - (1) The item sections ran into each other: the content wrapper wasn't a grid, so the page's gap never reached it.
  - (2) On phones the bid times were cut off; the bidder and time now wrap.
  - (3) The a11y check timed out on the 404 page. Its unread error body kept the response open, so the page never went idle. Both pages now read error bodies.
  - (4) Reflow flagged the visually hidden table caption. A `<caption>` ignores `width: 1px` and keeps a line of height, which also left a blank strip above the table. The table is now named by its visible heading instead (`aria-labelledby`).
- **Tests:** 12 new unit tests and 5 new e2e tests. The refresh tests rewrite the API's answer in the browser with a fake clock, so they never write bids to dev while other specs run. Four item screens were added to a11y, reflow and visual. 165 unit, 59 database and 79 browser tests pass; reflow and visual pass; `npm audit` shows only the accepted zod advisory.
- **Preview (08:57 EST):** `kestrel-gives-nwcwnadl9`, Ready. Health is OK, `/items/1` serves the item page through the rewrite, and the item API answers match local, including the 404 (`.review/m4-4c/preview-checks.txt`).
- **Still to check on the Preview, by the owner in a logged-in browser:** the browse pages (4B) and item pages (4C) as rendered. Deployment protection blocks a headless browser.


### 2026-11-03 — 4C fixes
- **Owner stepped in:** approved 4C with four fixes:
  - no crown on a cancelled item;
  - on phones, a two-column bid history: the zone is shown once beside the heading ("· times in EST") and the time is a caption line under the name;
  - all five thumbnails on one row at 390px;
  - a "Donate and upload proof in Your Items" link under "You won this item for $85."
- **Built:**
  - The crown comes off in the data layer, so no client can show one on a cancelled item.
  - The time is drawn twice, as a cell and as a line under the name. CSS shows exactly one per width, so screen readers never hear it twice.
  - The thumbnails shrink to fit but stay at least 44px.
- **Our addition:** a bid from the other side of a clock change keeps its own zone ("Oct 31 at 7:00 PM EDT"), so a row never reads as EST when it was EDT.
- **Caught:** `check:tokens` flagged "44px" written in a CSS comment, which I reworded.
- **Tests:** 1 new unit test, plus one new browser test for the phone layout (one row, two columns, no three-line rows); the cancelled-item test now also checks for no crown. `npm run check` passes (166 unit, 59 database, 80 browser, 11 reflow, 44 visual). 4C screenshots were retaken.

### 2026-11-03 — Stage 4D: bidding and buying (09:56 – 10:20 EST)
- **Built** (`src/pages/item-actions.ts`; DECISIONS #89):
  - **Bid form:** a "Your bid" *Money input* that starts at the minimum and opens the phone's number pad (`inputmode="numeric"`), with the computed minimum as its help, and **Place bid**.
  - **Buy button:** **Buy one**.
  - **Confirm dialogs:** each shows the item's cover, title and standing, then the amount. Every amount comes from the data.
  - **Announcements:** results and refusals go to the page's live region. They also show as a toast in a new quiet stack (`showToast(…, { announce: false })`), so a screen reader hears them once.
  - **Lost race:** the dialog closes, the field refills with the new minimum, the reason sits under the field, and focus moves there.
  - **Other refusals and failures:** an ended sale, sold out and so on redraw the panel and focus it. A failed request keeps the dialog open to try again.
  - **Refresh:** what the bidder typed survives the 30-second refresh, and the refresh waits while a dialog is open.
- **Real run on dev:** in the screenshot script, Jules opened the dialog at $245 while another user bid $250 through the API. Confirming gave "Someone just bid $250. The minimum is now $255." with 255 in the field, and the retry made Jules the high bidder. The scarf was bought for real. Dev was reseeded afterwards.
- **Caught:**
  - (1) The dialog's axe check failed on contrast because it ran while the dialog was still fading in. The test now waits for full opacity.
  - (2) Editing `package.json` made the dev server rebuild, and the rebuild failed on an untyped test callback, so pages returned 404 until it was fixed and the server restarted.
  - (3) A refresh still in flight when a test ended logged a `route.fetch` error. Both item specs now drop their routes after each test.
- **Tests:** 4 new unit tests (what the panel offers, dialog wording, which refusals go under the field). `tests/e2e/item-actions.spec.ts` adds 9 tests at 1280 and 390. They stub the API in the browser, so nothing is written to dev during the parallel run. They cover the field's start value, number pad and help; the dialog with axe; the success announcement (live region once, quiet toast) and focus; a lost race; field checks; a failed request; the draft surviving the refresh; buying; sold out; and the own item. The real saves and races stay in `tests/db/sales.test.ts`. `npm run check` passes (170 unit, 59 database, 98 browser, 11 reflow, 44 visual), and `npm audit` shows only the accepted zod advisory.
- **Preview (10:18 EST):** `kestrel-gives-fo5uqsdhb` is Ready. Health is OK, the item pages and the new scripts are served, and refused bids give "Bids must be at least $245." and the lost-race answer without writing anything (`.review/m4-4d/preview-checks.txt`).
- **Noticed, not changed:** on Instant Sale pages, the phase banner says "Bidding is open". That banner is shared by every page (3B); worth a look in 4E. *(Fixed in 4E: DECISIONS #90.)*

### 2026-11-03 — Stage 4E: fixes and the Preview review (10:21 – 11:05 EST)
- **Owner stepped in:** approved 4D with four fixes (DECISIONS #90):
  - (1) each result replaces that page's earlier toast;
  - (2) lost-race and too-low messages show under the field only, with no toast;
  - (3) dialog titles balance their lines;
  - (4) while the event is live, the phase banner on Instant Sale and instant-sale item pages talks about the sale ("The instant sale is open. It ends in …"; "The instant sale ends soon. It closes in …").
- **Built:**
  - `phaseBanner()` takes the page's sale. `<body data-sale="instant">` marks the Instant Sale page, and the item page sets it once it knows the item's type (`setBannerSale()`).
  - The item page keeps one toast handle. Amount refusals clear it.
- **Caught:** `text-wrap: balance` alone still broke the title as "Buy the Hand-" / "knit scarf for $45?" at 390px; the screenshot showed it. `confirmDialog()` now wraps each hyphenated word in a `nowrap` span, and a test checks that "Hand-knit" renders on one line.
- **Request failures:** a request that gets no answer still shows its reason inside the open dialog (#89) and gets no toast, since a toast would sit behind the modal.
- **Tests:** 1 new unit test for the banner wording. 4 new browser tests: one toast per form, no toast for a lost race, the banner per page, and the dialog title. `npm run check` passes (171 unit, 59 database, 104 browser, 11 reflow, 44 visual), and `npm audit` shows only the accepted zod advisory.
- **Preview review:**
  - `kestrel-gives-273f25url` (68a4b49): the 13-call API review, which places real bids and purchases on dev, gave output identical to local (`.review/m4-4e/api-preview.txt`, `api-local.txt`). Every page and script was served, including the rewrites and the 404 item.
  - `kestrel-gives-7llzsgqu2` (f69d1a4, the final commit): health OK, pages served, and the dialog fix is live.
  - Dev was reseeded after each run.
- **Ready for main:** a fast-forward of 16 commits, including the held `aa9db4e` and `954377c`, waiting for the owner's approval.

### 2026-11-03 — Milestone 4 live (11:05 – 11:20 EST)
- **Owner stepped in:** approved Milestone 4 and the push.
- **Pushed:** `main` fast-forwarded `7b13109..0f0b289`: 16 commits, the held `aa9db4e` and `954377c` plus 4A–4E, their fixes, BUILD-LOG and DECISIONS #86–#90. Deployment `kestrel-gives-jlk6rzizv`, production, Ready.
- **Build log:** unit tests 171 pass, 0 fail, 5 todo. `deploy-db: production build; DATABASE_URL_UNPOOLED confirmed as the main branch (direct connection).`, `Up to date.`, `deploy-db: an event exists; not seeding.`, `deploy-db: step m3-land-live-demo already ran; skipped.` There were no new migrations or deploy steps, and no errors; only Vercel's known `npm warn Unknown env config "cache-dir"`.
- **Health:** `{"ok":true,"db":"main","schema":"005","seedPhotos":true}` on `kestrel-gives.vercel.app` and on `kestrel-gives-derek-p-collins-projects.vercel.app` (via `vercel curl`).
- **Live pages:** a view-only look on the public domain at 390 and 1280. The browser loaded pages and sent no requests other than GET; there were no bids or purchases (`.review/m4-prod/view-checks.txt`).
  - Silent Auction: 9 tiles, "Bidding is open".
  - Instant Sale: 6 tiles, "The instant sale is open".
  - `/items/1`: $240, "Top bid · 6 bids", **Place bid**, "Bid history (6 bids) · times in EST".
  - `/items/12`: $45, "6 left", **Buy one**, and the instant-sale banner.
  - No page errors.

**Milestone 4 ended:** 2026-11-03 11:20 EST · about 6 hours of working time across two days from the plan approval (2026-11-02 16:29 EST), with an overnight pause.

## Milestone 5 — employee flows

**Milestone 5 started:** 2026-11-03 11:22 EST, on the owner's approval of the plan.

### 2026-11-03 — Stage 5A: uploads, item writes, proofs and Your Items API (11:22 – 12:12 EST)
- **Owner stepped in:** approved the plan with four answers: Restore and the cron delete uploaded files under the environment's prefix; proofs in the public store with unguessable names and a demo warning; the proof page at `/your-items/proof`; resizing in the browser to about 1600px. The owner also added daily upload caps.
- **Built (API only; the pages come in 5B–5D):**
  - Migration 006: `uploads` gets a row before its file is written, so Restore can always find it. `upload_log` counts toward the caps, and Restore leaves it alone.
  - `POST /api/uploads`: 4 MB cap, type taken from the file's first bytes, caps of 20 a day for everyone and 10 per person (DECISIONS #92). `GET` serves local dev files.
  - `POST`/`PATCH`/`DELETE` on `/api/items`: submit, edit and delete. Fields lock once there's activity, and removed bids count as activity (#94). The files of removed photos are deleted after the commit, and only under the environment's own prefix.
  - `POST /api/proofs` (#95) and `GET /api/me` (Your Items). That's 10 of 12 functions.
  - Restore and the daily cron empty the environment's upload prefix through the delete guard. On Blob, a manual Restore lists only if something was uploaded (#91; flagged for the owner).
- **Caught:** `vercel dev` serves only static files that existed when it started, so a new upload in `public/` returned 404. Local files stay in `.local-uploads/` (the owner's name for it), and `GET /api/uploads?file=` serves them, only off Vercel and only inside the local prefix. Path escapes and `seed/` give 404.
- **Tests:** 22 new unit tests (sniffing, caps, resizing, form and proof rules, request shapes, Restore's list rule, own-prefix deletes) and 4 storage tests (local and Blob clear with a fake lister, paging, refusing foreign and `seed/` paths). 21 new database tests on dev, including uploads at once against the cap and an edit racing a first bid. Retired two business-rule todos. `npm run check` passes (197 unit with 3 todo, 80 database, 104 browser, 11 reflow, 44 visual). `npm audit` shows only the accepted zod advisory.
- **Preview (12:10 EST):** `kestrel-gives-qtm2iazkt` reports `"schema":"006"`. Real uploads went to Blob under `preview/` and were publicly readable. An admin created an item during live, and an employee was refused. An edit and a delete each removed their file. A proof upload worked, and Restore removed it; all three files then returned 404 (`.review/m5-5a/preview-checks.txt`, with the store host redacted). Restore left dev reseeded.

### 2026-11-03 — Blob risk and the circuit breaker (12:13 – 12:33 EST)
- **Owner stepped in:** approved 5A and both open decisions (#91, #92), then raised a risk before 5B: on Hobby, going over the Blob allowance would lock the store for 30 days and break every photo on production. They asked for the exact limits with citations, a usage estimate, an app-level circuit breaker regardless, and the cost of Pro.
- **Built:** migration 007 (`blob_ops`) counts our own puts and lists over 31 days. Uploads stop at 1,200 operations for `production/` and 300 for `preview/` (75% of a 2,000 allowance split between them) with a clear 503 `uploads-paused`. Restore and the cron keep working, and their lists are counted. Local storage is never counted (DECISIONS #96).
- **Found (cited in #96):** uploads, copies and lists are advanced operations (2,000 a month). Reads that miss the CDN cache are simple operations (10,000). Deletes are free. Data transfer has its own 10 GB. The real uncovered risk was data transfer from seed photo views, about 4 MB per new visitor, which the app can't see.
- **Then:** the owner upgraded to Pro with spend alerts and no hard pause (#97), so there's no 30-day lockout. The breaker stays as an abuse guard that limits cost, with the same thresholds.

### 2026-11-03 — Stage 5B: Submit an Item and Edit item (12:34 – 13:10 EST)
- **Owner stepped in:** kept the breaker on Pro and asked for the 5B plan as written: Submit and Edit pages, browser resizing, locked fields, delete with confirmation, field-level server errors, browser tests, a Preview check and screenshots.
- **Built:**
  - One page serves `/submit` and `/items/<id>/edit` (a rewrite). The sale type comes first, and the rest stays disabled until one is chosen. The starting bid help and its minimum come from the event, which the app state now carries.
  - Photos are resized in the browser as they're picked: long side 1600px, JPEG at 0.85, rotation applied, EXIF dropped. Originals up to 40 MB are accepted, and the 4 MB cap applies to the resized file. While resizing, the uploader shows "Preparing…" and `aria-busy`. Unreadable pictures get a message by name.
  - Saving uploads each new photo ("Uploading photo 1 of 2…"), then posts JSON. An upload that worked keeps its id, so a retry after a cap or a bad field doesn't upload it again.
  - The server's 422 problems show under each field with the same summary as browser errors (`showServerProblems`). Anything else (a cap, a pause, a closed window, no connection) shows in a focused danger banner at the top of the form.
  - Edit mode loads the item. Once there's activity, the sale type and money are shown locked with an info note. Delete is offered only without activity, behind a danger dialog ("Delete item" / "Keep item"). Success redirects carry a flash toast.
  - The item page shows "Edit item" to the submitter and admins (#98).
- **Caught:**
  - Editing package.json made `vercel dev` rebuild with the type check. The new browser spec used DOM types the tests' tsconfig doesn't have, so every page returned 404 until it was fixed (string `page.evaluate`, structural types).
  - The submitted-item screenshot showed an empty carousel because it was taken before the image decoded; it was retaken after `img.decode()`.
  - The token check flagged the canvas fill (`#ffffff`). It's image data, not a UI color, so it's now the keyword `white` with a comment.
- **Tests:** 11 browser tests in `submit.spec.ts`: window and default minimum with axe, admins only during live, the real resize to 1600×1200, an unreadable picture, the body in cents with the toast, the cap alert with retry reusing the upload, server field errors, locked edit with axe, the delete dialog, not-yours blocked, the Edit link. 5 unit tests for the page rules. `npm run check`: 205 unit (3 todo), 83 database, 130 browser, 12 reflow, 48 visual. On the first run one existing test (`shell.spec.ts` Restore with cooldown) failed once with the phase not yet reset. It passed alone and in a full re-run of the browser steps. `npm audit` shows only the accepted zod advisory.
- **Preview (13:05 EST):** `kestrel-gives-hi6lfajzr` reports `"schema":"007"`, and serves `/submit`, `/items/5/edit` and the new scripts. As an admin: a real upload to `preview/`, then create, edit and delete. An employee's edit was refused (403), and a bad price came back by field (422). After the delete, the photo returned 404 with a cache-busting query; the plain URL served the CDN's copy briefly. Restore left dev reseeded (`.review/m5-5b/preview-checks.txt`, with the store host redacted).

### 2026-11-03 — 5B review fixes (13:12 – 13:51 EST)
- **Owner stepped in:** mostly approved 5B, with seven fixes. The starting bid hint said $10 while a server error said $35. The locked sale type should stay visibly chosen. Add help under the sale type. Edit item shouldn't mark Submit an Item in the nav. Confirm the Pro plan. Find out how long a deleted blob keeps serving. Fix the flaky Restore test.
- **Built:**
  - **Starting bid:** the "$35" was my screenshot script's made-up server answer, not the app. Both sides already read the event minimum, but the hint and the refusal were worded in two places. They're now built by one pair of functions (`startingBidHelp`, `startingBidTooLow`), which the browser's check also uses. A database test sets the minimum to $10 and $35 and checks that `/api/app`'s hint and the server's refusal name the same amount. The browser tests build their stubbed refusals the same way. The screenshot now shows a refusal only the server can give.
  - **Locked edit:** only the unchosen card is disabled, so the chosen one keeps its check mark and border. Arrow keys skip disabled radios, so the choice still can't change. The same fix stopped the locked note being appended to `aria-describedby` again on every redraw.
  - **Help and nav:** "Choose one to fill in the rest." describes the sale type group on Submit. `pageKeyFor` makes Edit item an item page, so no nav link is current.
- **Caught:**
  - **Flaky test:** `shell.spec.ts` ran only in light-1280, but its `afterAll` reset ran in all four projects' workers, in parallel, and could jump the shared event back to live mid-test. The dev log showed the stray jumps. The reset is now guarded.
  - **Screenshots in the wrong place:** I first ran the screenshot script without its output folder, so it wrote to a folder named `undefined`. I deleted it and re-ran.
  - **A stall:** one full check stalled in the visual step. It passed alone and in a clean full re-run, and I couldn't find a cause.
- **Pro and blobs:** the team is on Pro (active, not a trial), and `kestrel-gives` is linked to it, checked without printing IDs. Vercel's docs say a deleted blob can stay in the CDN cache for up to a minute, and Preview matched. Browsers can keep their own copy for the upload's cache lifetime. For proofs, the mitigation is the demo warning and unguessable names (DECISIONS #100).

### 2026-11-03 — Stage 5C: Your Items (13:51 – 14:25 EST)
- **Built:**
  - Your Items from `GET /api/me`: My bids, Won & purchased, My donated items and Cancelled (only when there's something). Every row is an item tile, the component DESIGN-SYSTEM already named for this page. `renderItemTile()` takes the page's words in the tile's shape, so there's no second card.
  - Bids use the browse tiles' labels. Donated items show exactly their browse tile, with an Edit button under each one, outside the linked card.
  - One proof summary covers everything: the total, a status pill, days left or late, what's next and the link to `/your-items/proof` (5D). The changed-total banner (SPEC §7.6) comes first when it applies.
  - Loading, empty and error states. The page redraws when the demo bar changes the person or the phase (DECISIONS #101).
- **Checked:** a survey of all seven people, live and after the close, matched the seed: winning, outbid, won, lost, approved, pending and rejected proofs, and a cancelled item. Fixed a rejected proof that asked twice for a new upload.
- **Caught:**
  - `vercel dev` doesn't serve new files until restarted, so the new page script returned 404 until a restart.
  - The `package.json` edit triggered a rebuild during screenshots.
  - The screenshot script hung waiting on lazy images below the fold. It now loads them eagerly, with each wait capped.
- **Tests:** 8 unit tests for the page's words. 6 browser tests: the real answer with axe, after the close, a changed total, rejected, empty with axe, and a failed load with Try again. `npm run check`: 219 unit (3 todo), 84 database, 142 browser, 12 reflow, 48 visual. `npm audit` shows only the accepted zod advisory.
- **Preview (14:23 EST):** `kestrel-gives-hmsl63m2s` reports `"schema":"007"` and serves the page, its scripts and styles, and the 5B fixes. `/api/me` answered for four people with the expected sections and proof states (`.review/m5-5c/preview-checks.txt`). Read-only.

### 2026-11-03 — 5C review changes (14:25 – 15:01 EST)
- **Owner stepped in:** approved 5C with four changes. Lost auctions say "Didn't win". Repeat purchases become one tile. Edit is hidden once bidding ends. The tile's accessible name had a stray space ("Title , Status"). Proofs get a short browser cache. Asked to capture the stalled shot and the process state if the visual step stalls again.
- **A question back:** hiding Edit raised whether edits are allowed after the close at all. SPEC allowed them. I asked rather than chose. The owner picked "everywhere": the server refuses edits after close, admins included (SPEC v1.16, DECISIONS #102). Because delete reuses the same rule, delete is refused after close too.
- **Built:**
  - "Didn't win" with "Your bid · Winning bid $240". "Ended" stays for items with no stake.
  - One tile per purchased item: "Bought 2 · $40 · Last on Nov 3", with the unit price as the big number. Totals unchanged.
  - The server reads the clock after the item's row lock, like a bid, so an edit can't slip past the close.
  - The tile's status moved into the link's `aria-label`.
  - Proof uploads use Blob's minimum cache, 60 seconds. Photos keep the default (#100).
- **Tests:** unit tests for each change, a database test that nobody edits or deletes after close, and browser tests for after close and repeat purchases.

### 2026-11-03 — Stage 5D: proof page and giving stub (15:01 – 15:35 EST)
- **Built:**
  - `/your-items/proof`, a rewrite to `proof.html`. The amount starts at the donation total. A live warning below it never blocks submitting. One screenshot goes through the existing uploader in a new single-file mode ("No screenshot yet", "Screenshot: receipt.png", only Remove).
  - Notes above the form for a rejected proof (with its reason), a waiting one, an approved one and a changed total. Someone with nothing owed sees why instead of the form.
  - Submit uploads with `purpose=proof`, keeps the upload id for a retry, and posts the proof. Server field errors show under their field. Success returns to Your Items with a toast.
  - `/giving` explains the one outside donation page, split equally three ways, with no money moving in the demo. It has three steps, an Upload proof button and the charity cards, shared with Home. No new endpoint: `/api/me` already carries the proof (DECISIONS #103).
- **Caught:** the token check read "#100, #102" in a code comment as hex colors. That comment came with the 5C review commit, after its last full check. Reworded.
- **Tests:** 11 unit tests (proof words, uploader words). 5 browser tests with axe: the full submit with a below-total warning, a rejected proof with a server refusal and a retry reusing the upload, nothing owed, a failed load, and the giving stub (no pay words). Proof and giving joined the a11y, reflow and visual screens. `npm run check`: 233 unit (3 todo), 85 database, 164 browser, 14 reflow, 56 visual. No stall this time; a watcher was on the log in case. `npm audit` shows only the accepted zod advisory.
- **Preview (15:32 EST):** `kestrel-gives-ab59yvgvx` serves both pages. As Owen: a real screenshot upload to `preview/`, served with `max-age=60`. A too-large amount was refused by field. The $20 proof against a $35 total went in as pending. Reusing the upload was refused. Restore put the seed back and removed the file (`.review/m5-5d/preview-checks.txt`, with the store host redacted).

### 2026-11-03 — 5D review fixes and Stage 5E: Preview review (15:40 – 16:10 EST)
- **Owner stepped in:** approved 5C and 5D with four small fixes. The blocked proof page should show an info icon for "nothing owed" and a check mark only for "approved". The giving page should hide Upload proof when nothing is owed, and say so. It should show the viewer's total and follow the demo bar. Step 2 should say "donation page".
- **Built:** `startGivingPage()` reads `/api/me`, the one place the total is computed, so the giving page, Your Items and the proof page agree. It redraws when the demo bar switches person. If it can't load, the page still explains giving and keeps the button (DECISIONS #104).
- **Caught:** the first 5E full check failed the shell Restore test. This time I read the dev log before rerunning. Postgres had aborted the Restore as a deadlock (40P01). Jump and Restore already exclude each other, so the other side was an ordinary request: Restore's `TRUNCATE` takes each app table's lock in turn, and a two-table transaction can hold one while waiting on another. Restore and Jump now retry a deadlock or serialization failure, up to three attempts (`withRetriedTransaction`, DECISIONS #105). A visitor pressing Restore while someone bids no longer fails at random. The rerun passed, with no retries needed.
- **Tests:** unit tests for the icon, the giving view and the retry. Browser tests: the approved check mark, the giving total, and a demo-bar switch to someone who owes nothing, with axe (the bar starts collapsed at 390, so the test opens it). `npm run check`: 238 unit (3 todo), 85 database, 168 browser, 14 reflow, 56 visual. No stall in either run. `npm audit` shows only the accepted zod advisory.
- **Preview review (16:06 EST):** `kestrel-gives-a1ch3j78f` checked end to end on the dev database:
  - Every M5 page answered 200.
  - Jules submitted an item with a real photo upload during submission. Owen bid $30 during live and was the high bidder. Jules's edit during live saved.
  - After the close, Jules's and Maya's edits and Maya's delete were all refused with "Bidding has ended, so this item can't be changed."
  - Owen's total went from $35 to $65 with the win, and his $65 proof went in as pending.
  - Restore removed the item and both uploaded files (`.review/m5-5e/preview-checks.txt`).
- **Before main:** production reports schema 005. The push would apply 006 (uploads) and 007 (blob ops) in the production build, both additive. Production already has the Blob token. Not pushed; waiting for approval.

### 2026-11-03 — Milestone 5 live (16:30 – 16:40 EST)
- **Owner stepped in:** approved Milestone 5 and the push to main.
- **Pushed:** `main` fast-forwarded `0f0b289..7947840`: 16 commits, the held `7d651bc` plus 5A–5E, their review fixes, BUILD-LOG and DECISIONS #91–#105. Deployment `kestrel-gives-he5vchuae`, production, Ready.
- **Build log:** unit tests 238 pass, 0 fail. `deploy-db: production build; DATABASE_URL_UNPOOLED confirmed as the main branch (direct connection).`, `applied 006_uploads.sql`, `applied 007_blob_ops.sql`, `2 applied.`, `deploy-db: an event exists; not seeding.`, `deploy-db: step m3-land-live-demo already ran; skipped.` No error lines.
- **Health:** `{"ok":true,"db":"main","schema":"007","seedPhotos":true}` on `kestrel-gives.vercel.app` and on `kestrel-gives-derek-p-collins-projects.vercel.app` (via `vercel curl`). Phase `live`.
- **Live pages:** a view-only look on the public domain at 1280 and 390, as the default viewer (Jules). The browser aborted anything other than GET, and nothing else was attempted. No uploads, bids or purchases (`.review/m5-prod/view-checks.txt`).
  - `/your-items`: My bids, Won & purchased, My donated items, Cancelled. Your Items is current in the nav.
  - `/submit`: "Submissions are closed. Only admins can add items now." (bidding is open).
  - `/giving`: "Your total: $125" and Upload proof.
  - `/your-items/proof`: "Your donation total is $125. 8 days left to upload proof." Your Items is current.
  - No page errors.
- **Restore deadlock:** the retry (#105) is the chosen fix, with lock ordering noted as a possible later improvement (DECISIONS #106).

**Milestone 5 ended:** 2026-11-03 16:40 EST · about 5 hours 20 minutes from the plan approval (11:22 EST).

## Milestone 6: Admin

**Milestone 6 started:** 2026-11-03 17:54 EST, on the owner's go for the plan.

### 2026-11-03 — Stage 6A: admin API and rules (17:54 – 18:40 EST)
- **Owner stepped in:** approved the plan and answered its five questions. A "Not scheduled yet" state when an event has no dates. After Reset on the shared demo, the dashboard and Home offer Restore right away. Remove bid and cancel are both allowed after close. Admin writes only on Preview. Before 6A, define "confirmed": SPEC said only "approved proofs only". I found that a proof is one combined amount, so the sale-type figures can't come from proof amounts. I asked, and the owner chose covered totals by sale type, the approved amounts for the grand figure, and a gap line (SPEC v1.17; DECISIONS #107–#110).
- **Built:** `api/admin.ts` (the 11th function), admins only, with six views and eight actions (DECISIONS #111). Template, settings and admin rules are shared with the pages-to-come. Dates are entered in the event's zone and converted with no library (the skipped hour is refused, the repeated one means the first). Jump to and settings now set dates through one function. Two new phases: `unscheduled` and `upcoming` ("before submissions open", which SPEC §7.1 implies and admin settings make reachable), so employees can't submit, bid or buy, and Submit leaves the nav.
- **Caught or hard:** approving a proof whose total changed while it waited would have shown the person "your total changed" right after approval. Approval now sends the total the admin saw (refused if it moved) and records it as the total the proof covers. One wrong expected number in my own people test (Jules's purchases are $125); the code was right.
- **Tests:** 22 unit tests for 6A (260 in all, 3 todo) and 22 database tests (107 in all), including totals against independent SQL and against everyone's `donationTotalIn`, remove bid and cancel after close re-opening approved proofs, settings that close or clear the dates, Reset (locked, wrong name, what it wipes and keeps, the files it lists), and Restore after Reset. The handler refuses employees with 403 and writes nothing. Browser checks unchanged and passing: 168 a11y and keyboard, 14 reflow, 56 visual. `npm audit` shows only the accepted zod advisory.
- **Preview (18:36 EST):** `kestrel-gives-f0mjrjgq0` on the dev database, through `/api/admin` as Maya and Jules: Jules 403 on reads and writes; approving Rosa's $60 proof against a stale total refused, then approved (confirmed $165 against $170 owed, $5 short); an empty rejection reason, an unknown template variable and a missing date each refused by field; after the close, removing the cabin's winning bid made Owen the winner at $220, and cancelling the lemon squares dropped the instant-sale pledge; Reset was locked when ended, refused the wrong name, then left "Kestrel Gives 2027", not scheduled, with the reset flag set. Restore brought back Kestrel Gives 2026, live. Function logs: info lines only (`.review/m6-6a/preview-checks.txt`).

### 2026-11-03 — Stage 6B: section nav, Totals and People (18:42 – 19:05 EST)
- **Owner stepped in:** approved 6A, keeping both additions: "Leading bids so far" (clearly labeled not final and kept apart from pledged and confirmed) and the "before submissions open" phase (its banner says "Submissions open on …", already built in 6A). Asked for screenshots as Maya (light and dark, 390 and 1280, live and ended) and the not-admin state as Jules.
- **Built:** one `admin.html` for every section (`/admin` is Totals, `/admin/people` by rewrite), with a section nav of plain links and `aria-current` (DECISIONS entry 59). Totals: three cards, the gap line, a key, and the live-only leading bids note in a dashed box outside the cards. People: a table of everyone with an Admin pill, counts, total and proof status ("$60 of $65"). For admins only: an empty state for employees, from the app state without asking the API, and on a 403 (DECISIONS #112).
- **Caught:** reviewing my first screenshots, pledged amounts used the red price color and read as a warning; they now use the text color. The not-admin state showed the Totals description; it now shows the general one and title.
- **Tests:** 6 page-rule unit tests (266 in all, 3 todo). 7 browser tests with axe: Totals live and ended, People, For admins only (no API call), the demo bar switching between them at 390 and 1280, a 403, and a failed load with Try again. `Screen` gained a viewer, so Totals and People as Maya and the not-admin page as Jules join the accessibility, reflow and visual checks. Database 107. Browser: 190 a11y and keyboard, 16 reflow, 64 visual. `npm audit` shows only the accepted zod advisory.
- **Screenshots:** `.review/m6-6b/`, 20 PNGs, taken on local dev with Jump to ended and Restore after. No page errors.
- **Preview (19:02 EST):** `kestrel-gives-h7atwlekz`, reads only: `/admin` and `/admin/people` 200 with the new page, `/admin/nope` 404, the script and styles served, Maya's summary and people 200, Jules 403 (`.review/m6-6b/preview-checks.txt`).

### 2026-11-03 — Stage 6C: proof review (19:08 – 19:38 EST)
- **Owner stepped in:** approved 6B with two fixes folded into 6C: $0 totals in the muted color (green only above $0), and People's "Not uploaded" by phase (neutral before close, warning after, Late past the deadline, like Your Items). Asked for the proof review queue with pending first, the short-amount warning, a larger screenshot view, approve, and reject with a required reason.
- **Built:** `/admin/proofs` with Waiting for review first, then Reviewed. Each card has the screenshot, amount against total, notes (short, over, total changed, late upload), who reviewed it and why. View larger opens the screenshot in place. Approve is one click against the total on screen. Reject opens the danger Dialog, which gained a required `reason` field. A refusal reloads the queue with a focused alert. The gallery shows the reason Dialog (DECISIONS #113).
- **Caught:** reviewing my screenshots, an approved short proof still said "You can still approve it."; that sentence now shows only while waiting. My first Preview walk read Rosa's view from the wrong field; I reran the step and she sees "rejected" with the reason.
- **Tests:** 6 proof-review unit tests (274 in all, 3 todo). 8 browser tests at 390 and 1280: order and notes, View larger with `aria-expanded`, Approve (sends the total, toast, focus), Reject (inline error, then sends the reason), a 409 reload with the alert, the empty queue, and the 6B fixes. axe covers the queue, the larger view and the dialog. `admin-proofs` joins the accessibility, reflow and visual checks. DB 107. Browser 208 a11y and keyboard, 17 reflow, 68 visual. `npm audit` shows only the accepted advisory.
- **Screenshots:** `.review/m6-6c/`, 21 PNGs on local dev (live, ended and 30+ days after, a real approve), with Restore after. No page errors.
- **Preview (19:30 EST):** `kestrel-gives-9ke78ctl5` on the dev database: the three admin pages 200; Jules 403; the queue in order (Rosa pending, Dev approved, Owen rejected); an empty reason refused (422); rejecting Rosa worked and she sees the reason; approving a rejected proof refused (409 `already-reviewed`); after a Restore, approving Rosa gave confirmed $165 against $170 owed, $5 short. Restored after each write. Function logs: info only (`.review/m6-6c/preview-checks.txt`).

