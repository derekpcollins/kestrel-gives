# Kestrel Gives — Build Log

A running, honest record of how this project was built, for the case study. Times are US Eastern. Each milestone records a start and end time; git commit times are the fallback.

Entry format: what we built, what was hard, what AI did well, where the owner stepped in.

---

## Milestone 0: Local infrastructure

**Started:** 2026-10-31 12:07 EDT
**Ended:** —

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
