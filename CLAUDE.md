# Kestrel Gives

A demo web app for running a yearly charity auction: silent auction and instant-sale items, bidding, inventory, donation proof, and an admin dashboard. It's a portfolio case study in designing and building with AI. Plain HTML, CSS and TypeScript compiled with `tsc` (no framework, no bundler); Vercel hosts the front end and the API functions; data is in Neon Postgres and uploads in Vercel Blob.

`SPEC.md` is the contract. Record each stage in `BUILD-LOG.md` and significant decisions in `DECISIONS.md`. Setup, secrets and checks are in `README.md`.

**Pushes to `main` deploy the live demo**, which runs on the Neon `main` branch. Previews and local work use the Neon `dev` branch.

## Commands

- `npm run build`: compiles the front end and the component CSS. Touches no database.
- `npm start`: `tsc --watch`, the CSS watcher and `vercel dev` (uses `dev`).
- `npm run check:quick`: fast checks plus the DB and browser tests mapped from changed files (uses `dev`).
- `npm run check`: all eight conformance checks, about 30 minutes (uses `dev`). For pushes to `main`, milestone ends, and schema, seed or demo-control changes.
- `npm run db:check`: confirms `DATABASE_URL` points at `dev`; prints endpoint IDs only.

## Rules

- Never commit or push to `main`. Always work on a branch and open a PR. Merging to `main` needs the owner's approval.
- Every PR gets a Vercel preview URL (it appears on the PR). Review it before merging.
- `npm run build` must pass before every commit.
- Run every gating command with `set -o pipefail` or without pipes. Never commit after a gate whose exit code you haven't seen.
- Never run `npm run build:vercel` locally. It's Vercel's build step and runs `scripts/deploy-db.ts`.
- Never run `vercel env pull .env.local` (or `vercel env pull` with no file name, which writes `.env.local`). The Development environment has no Neon variables, so it would drop `DATABASE_URL` and both `NEON_*` keys. Refresh `VERCEL_OIDC_TOKEN` with the README's steps.
- Never run anything against the Neon `main` branch, and never pass `--allow-main`.
- One machine at a time on `dev`. Before anything that touches it (`npm start`, `check`, `check:quick`, `test:db`, the browser checks, `db:*`), confirm no other machine is using it. Tests reseed `dev`.
- Restart the dev server before each full check: `vercel dev` leaves function workers running and slows later runs.
- Never print secrets or `.env` contents, and never put infrastructure IDs (endpoint, project or store IDs) in the repo.
