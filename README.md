# Kestrel Gives

A web app for running a yearly charity auction: silent auction and instant-sale items, bidding, inventory, donation proof, and an admin dashboard. Built as a portfolio case study in designing and building with AI.

Recreated from memory after leaving Netflix. No original code, designs, or data were used.

Kestrel is a fictional organization. Every person, item, and charity in the demo is invented.

- [`SPEC.md`](SPEC.md): what to build and the rules every change follows
- [`DECISIONS.md`](DECISIONS.md): every significant decision and why
- [`BUILD-LOG.md`](BUILD-LOG.md): how it was built, including where AI helped and where the owner stepped in

## Stack

Plain HTML, CSS, and TypeScript, compiled with `tsc` to native ES modules (no framework, no bundler). Vercel hosts the static front end and the TypeScript API functions. Data lives in Neon Postgres (plain SQL, no ORM) and uploads in Vercel Blob.

## Run it locally

Prerequisites: Node 24, and the Vercel CLI installed globally (`npm install -g vercel`), logged in with access to the project.

```sh
npm install
vercel link              # once: connect this folder to the Vercel project
npm start                # http://localhost:3000
```

`npm start` runs `tsc --watch` (front end → `public/js/`) and `vercel dev` (static files and API functions) together. Ctrl-C stops both. There's no hot reload; refresh the browser after a change.

It's `npm start` rather than `npm run dev` because `vercel dev` refuses to run when `package.json` has a `dev` script that leads back to itself (see DECISIONS #33).

### `.env.local`

Never committed; a pre-commit hook blocks `.env` files and database URLs. It holds:

| Key | What |
|---|---|
| `DATABASE_URL` | Pooled connection string for the Neon **`dev`** branch. Never `main`, which is the live demo. |
| `NEON_DEV_ENDPOINT` | The `dev` branch's endpoint ID (`ep-…`) |
| `NEON_MAIN_ENDPOINT` | The `main` branch's endpoint ID. Database scripts refuse to run against it without `--allow-main`. |
| `VERCEL_OIDC_TOKEN` | Written by the Vercel CLI |

Vercel CLI commands may rewrite .env.local; run npm run db:check afterward.

### Database

```sh
npm run db:check         # confirms DATABASE_URL points at dev; prints endpoint IDs only
npm run db:migrate       # applies new files in migrations/ (numbered SQL, each in a transaction)
npm run db:seed          # loads demo data (placeholder until Milestone 2); safe to re-run
```

### Uploads

On the deployed site, uploads go to one public Vercel Blob store under a per-environment prefix (`production/`, `preview/`). Locally and in tests they go to `.local-uploads/` (ignored by git). Seed photos are static files in the repo.

## Checks

Every change must pass the six conformance checks in SPEC.md section 12. `npm run check` runs them all, in this order:

| Script | Check |
|---|---|
| `npm run check:deps` | `package.json` lists only the packages in SPEC.md's approved table (read from the spec itself) |
| `npm run check:tokens` | No raw colors or lengths in `public/` or `src/` outside `public/styles/tokens.css` (except the two named breakpoints, inside `@media`/`@container` conditions); type set with `--type-*` roles, not `--text-*` steps; every color token has a light and a dark value |
| `npm run check:types` | `tsc --noEmit` for server and browser code |
| `npm run test:rules` | `node:test` unit tests; SPEC §7 rules not yet built are listed as todos |
| `npm run check:a11y` | axe (WCAG 2.2 AA) on every screen in `tests/e2e/screens.ts`, light and dark, at 390px and 1280px; zero violations allowed |
| `npm run check:visual` | Full-page screenshots of every screen, light and dark, at 390px and 1280px, with `?demo=off`, saved to `visual-review/` for a person to review |

The browser checks start `npm start` themselves (or reuse one that's running) and reseed the `dev` database first. One-time setup for them:

```sh
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium   # installs into node_modules/
```

## Deploy

Pushes to `main` deploy the demo through Vercel's GitHub integration; other branches get preview URLs. Production uses the Neon `main` branch; previews and local work use `dev`.
