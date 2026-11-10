# Kestrel Gives — Build Spec & Conformance Rules

**Status:** v1.24 · Owner: Derek Collins · Last updated: Nov 6, 2026

This document describes what to build and the rules every contribution must follow, whether a person or an AI agent writes it. Read it in full before writing any code. If something here conflicts with a request, stop and ask.

Keywords: **MUST** / **MUST NOT** are hard rules. **SHOULD** means follow it unless there's a stated reason not to. **MAY** is optional.

This spec covers as much of the build as we could foresee, but things will come up during development. When they do, stop and ask. Approved changes are logged in `DECISIONS.md` and bump this spec's version (v1.1, v1.2, …) so the spec always matches what was built.

---

## 1. Purpose

**Kestrel Gives** is a web app for running a yearly charity auction for **Kestrel**, a fictional organization of a few hundred employees. It replaces a spreadsheet plus a hand-updated website with one system: silent auction items, instant-sale items, bidding, inventory, donation proof, and an admin dashboard. It is meant to be reused every year.

This is a **from-memory recreation** of a tool I designed and built at a previous employer. It exists to show the experience and how it was built.

## 2. Clean-room and content rules

- MUST be written from scratch. MUST NOT use, copy, or reference any code, designs, or assets from the original.
- MUST use fictional data only: no real company names, brands, logos, people, or charities.
  - **Exception 1:** the README's clean-room sentence (below) names Netflix.
  - **Exception 2:** "Kestrel" is used as a generic word (a bird). It does not refer to any real company. The logo MUST be an original wordmark that doesn't resemble any existing Kestrel brand.
- MUST NOT imitate any real company's visual identity.
- The README MUST include: "Recreated from memory after leaving Netflix. No original code, designs, or data were used."
- The site footer MUST include: "Kestrel is a fictional organization, and this is a demo." (v1.19) It also links to the 5-minute tour and the design system (v1.21).

## 3. Scope

### In scope
- Two item types: **silent auction** (highest bid wins) and **instant sale** (fixed price, limited inventory)
- Two roles: **employee** and **admin**
- Three event phases driven by admin-set dates (section 7.1)
- Employee: browse, bid, buy, submit an item, edit or delete their own items, personal dashboard ("Your Items"), upload donation proof
- Admin: everything an employee can do, plus the admin dashboard (totals, people, bid history), event settings, proof review, cancelling items, removing bids, editing email templates, and the yearly reset
- Demo controls (section 3.1)

### 3.1 Demo controls
A slim bar pinned to the top of every page, in the normal page flow (it never overlays content), visually distinct from the app (its own background treatment and a "Demo" label). It is a design-system component like any other.
- **Viewing as:** a select listing every seeded user with their role. The choice is stored in a cookie; the API reads it to know who is acting. Changes are announced ("Now viewing as …, admin").
- **Jump to:** submission window / live / ending soon / ended / 30+ days after. Moves the stored event dates relative to now. "Ending soon" is live with bidding closing in under 24 hours (the threshold in section 10). (Ending soon added v1.8.) It MUST NOT fake the clock; the real time-window rules are what get exercised.
  - **Submission window clears activity** (v1.20): that phase can't have any, so this jump also deletes every bid, purchase and proof (with the proofs' uploaded files). Items stay. The demo bar says so in a confirmation before it happens ("Submissions open clears bids, purchases and proofs. Restore demo data brings them back."). It follows Restore's lock and cooldown rules. The other jumps only move the dates.
- **Restore demo data:** resets everything to the seeded state (including email templates), behind a confirmation dialog. It also deletes the files visitors uploaded in this environment (v1.13; section 4).
- **Shared and self-repairing** (v1.11): anyone can use Jump to and Restore demo data, and everyone sees the same data. A short global cooldown (about 10 seconds, counted from when the last Restore or clearing jump finished; v1.24) stops repeated Restores. A daily scheduled job (Vercel cron) runs the same Restore, so the demo returns to the live phase every day; the bar says the demo is shared and resets daily. This is the only scheduled job (section 7.1).
- Collapsible to a thin strip using `<details>`; collapsed state is remembered.
- **Tour link** (v1.21): "New here? Take the 5-minute tour" links to the Guide (section 8). It's in the open bar, and in the collapsed strip where it fits (from the small breakpoint).
- **About this demo** (v1.24): a button in the open bar that reopens the welcome dialog.
- **Welcome dialog** (v1.24): a first visit to any page opens "Welcome to the Kestrel Gives demo": what the demo is, four things to try with the bar, and that Restore demo data puts everything back. Two actions: **Start exploring** closes it; **Take the 5-minute tour** goes to the Guide. It opens once the page's data has loaded, never on top of another dialog (then it waits for a later page load), never on the Guide (which counts as seeing it), and never with `?demo=off`. It's remembered in `localStorage` from the moment it opens; if storage is unavailable, it opens on Home only, at most once per page load. It reuses the dialog component, and fits a 390px-wide phone without scrolling; on a shorter screen (a phone held sideways) its content scrolls inside the dialog with both actions always in view.
- Exposed to assistive tech as a region labeled "Demo controls."
- Hidden when the URL includes `?demo=off` (used for clean case-study screenshots).
- This mock login is NOT security. A real deployment would use company login and pass a security review, and would not include demo controls.

### Out of scope (MUST NOT build)
- Real payments. Donations happen on an outside giving platform, and the app only records proof. The "giving platform" link goes to an in-app stub page explaining that the real event links out to one donation page whose funds are split equally among the three charities.
- Admin management of charities (adding, editing, removing). The original had it; here the three charities are seeded and read-only, since they rarely change and the reset keeps them.
- Real authentication (see 3.1).
- Sending email, and any sent-emails log. Statuses appear in the app instead (section 7.6), and admins can edit email templates (section 7.7).
- An approval queue for submitted items. Everyone is a trusted employee, so items go live immediately.
- Automated checking of donation screenshots.

### In a real deployment (documented, not built)
- **Emails** for: bid receipt, outbid, winner, purchase receipt, proof rejected, item cancelled, sent from the editable templates.
- **Private file storage** for donation proofs, since they can contain personal details.
- **Company login** and a security review.
- **Unpaid winners** handled by admins outside the app (nudges, or offering the item to the next bidder).

### Future ideas
- "AI suggests, admin decides" checking of donation screenshots (amount, confidence), with the admin making the final call.
- Extending an item's end time when bids arrive in the last few minutes.

## 4. Technology constraints

### Languages and frameworks
- MUST use standard HTML, CSS, and TypeScript.
- MUST NOT add a UI framework (React, Vue, Svelte, etc.), CSS framework (Tailwind, Bootstrap, etc.), or component library.
- Front-end TypeScript is compiled with **`tsc` only** to native ES modules. No bundler, no Vite. Local dev runs `tsc --watch`.
- Any third-party dependency not on the list below MUST be proposed first, in writing, with: what it does, why the platform isn't enough, what it costs (size, lock-in), and the alternative. Nothing is added without approval.

### Approved dependencies (complete list)
| Package | Purpose |
|---|---|
| `typescript` | Compiler and type checking |
| `@neondatabase/serverless` | Postgres client for Vercel Functions, including transactions |
| `@vercel/blob` | Photo and proof uploads on the deployed site |
| `@playwright/test` | Browser tests and visual-review screenshots |
| `@axe-core/playwright` | Automated accessibility checks |
| `@types/node` (`24.x`, dev only) | Type definitions for Node built-ins used by the API, scripts, and tests (added v1.1) |

The Vercel CLI is installed globally, not as a project dependency. Node's built-in `node:test` is used for unit tests (no package).

### Platform features to prefer
- Native HTML elements: `<dialog>`, `<form>` with built-in validation, `<details>`, `<fieldset disabled>`, `<input type="datetime-local">`
- Web Components (custom elements) for reusable UI
- CSS custom properties, cascade layers, container queries, and nesting
- `fetch` for data, and URL-based routing with real URLs (no hash routing)

### Hosting
- MUST deploy to **Vercel** (Pro plan since v1.15, with spend alerts and no hard pause; Hobby before): static files for the front end, and Vercel Functions (TypeScript) for the API.
- URL: the free `*.vercel.app` address (ideally `kestrel-gives.vercel.app`). No custom domain.
- Everything MUST work within free-plan limits. No feature may require a paid plan.

### Database
- **Neon Postgres** (free plan), via the Vercel Marketplace.
- Plain SQL with parameters. No ORM.
- Schema changes MUST be numbered SQL files in `migrations/`, applied by a small migration script (no dependencies) that records which have run.
- Seed data MUST come from a script that can be re-run safely.
- **Production migrations run in the Vercel production build** (`scripts/deploy-db.ts`, the build's last step, after compiling and the unit tests). It connects only through `DATABASE_URL_UNPOOLED`, the Neon integration's direct, Production-only URL, with no fallback. Before touching the database it MUST confirm both that `VERCEL_ENV` is `production` and that this URL is a direct (not pooled) connection to the `main` branch, and refuse otherwise, failing the build; every other build skips it. Migrating and seed-if-empty (seeding only a database that has no event yet) run under one Postgres advisory lock on that connection, so two builds can't race. A failure fails the build, so the deployment doesn't go live. Applied migrations are recorded with a checksum of the file (line endings normalized) and MUST NOT be edited; schema changes are additive, so the previous deployment keeps working if it's rolled back. (Added v1.8.)
- Two branches: **`main`** for the deployed demo, **`dev`** for local work and tests. Tests reseed `dev` before each run and MUST NOT touch `main`.

### File storage
- **One public Vercel Blob store** on the deployed site, for item photos and proof images uploaded through the app. Production and Preview share it, each under its own path prefix (`production/`, `preview/`); the storage layer MUST refuse to delete anything outside the current environment's prefix, and MUST refuse anything under `seed/`. Proof images are uploaded with a short browser cache (60 seconds), so a deleted proof doesn't linger in browsers; item photos keep the long default (v1.16).
- **Seed photos** (v1.10) MUST NOT be committed to git; a check fails if any image file appears under a seed or photo path (the committed placeholders excepted). They live in the same Blob store under `seed/`, shared by Production and Preview, uploaded once by a script and never deleted by the app. The database stores relative keys (`seed/<slug>-<n>.jpg`), never URLs, and a key is resolved when shown: on Production and Preview to `SEED_PHOTOS_BASE_URL` plus the key; locally to the gitignored copy in `public/seed/` if present, otherwise the placeholder. On Production and Preview a missing or malformed `SEED_PHOTOS_BASE_URL` MUST fail the build, and `/api/health` reports it as `"seedPhotos": false`; the URL itself is never printed. Tests MUST NOT need network access or Blob for seed photos.
- Local dev and tests store uploads in a local folder (ignored by git), so tests don't use up Blob's monthly operation allowance.
- **Restore demo data and the daily job delete uploaded files** (v1.13): everything under the current environment's prefix (`production/` or `preview/`; locally the dev folder), never `seed/`, page by page through the same delete guard, after the database has been restored. Listing costs Blob operations, so a manual Restore lists only when something was uploaded since the last one; the daily job always sweeps.
- Upload limits: images only (JPEG, PNG, WebP), size-capped, validated on the server by the file's contents. The browser resizes each picture before upload (long side about 1600px), which also drops its metadata.
- **Daily upload caps** (v1.13) protect the shared demo's Blob allowance: one for everyone and one per person, over the last 24 hours, with a clear refusal. Restore does not reset them.
- **Blob circuit breaker** (v1.14; v1.15): the app counts its own billed Blob operations (uploads and lists) and stops accepting uploads, with a clear message, at a set number a month. On Pro there is no 30-day lockout, so this is an abuse guard that limits cost, not a guard on a free allowance. Restore and the daily job keep working.

### Secrets
- `.env.local` holds credentials and MUST be in `.gitignore` from the first commit.
- A pre-commit hook (no dependencies) MUST block committing any `.env` file or database URL.

### Browser support
The latest two versions of Chrome, Safari, Firefox, and Edge.

## 5. Design system

There is no inherited design system, so this project defines its own, from scratch. The design system is itself a spec: the agent builds only from it.

- All visual values MUST come from design tokens (CSS custom properties) in `public/styles/tokens.css` (served as `/styles/tokens.css`): color, type (scale and roles), spacing, sizes, radius, shadow, motion, breakpoints.
- Every color token MUST have a light and a dark value (section 6).
- Components MUST NOT hard-code colors, font sizes, or spacing. Raw hex values or `px` numbers outside `public/styles/tokens.css` are a conformance failure.
- Every component MUST be documented in `DESIGN-SYSTEM.md`: purpose, variants, states (default, hover, focus, active, disabled, loading, error, empty), and do/don't usage.
- New components MUST be added to the design system before they're used in a screen.
- The look is decided in Milestone 1: the owner reviews a token sheet before any screen is built.
- **Type roles:** type is set with semantic role tokens (`--type-hero`, `--type-display`, `--type-heading-1` to `-3`, `--type-amount`, `--type-body-lg`, `--type-body`, `--type-label`, `--type-button`, `--type-caption`, `--type-badge`, `--type-overline`), each setting size, weight, leading, and family through the `font` shorthand. Components MUST use the roles, never the `--text-*` scale steps directly. Only the hero, display, and heading roles use the heading font; every other role, including amount, uses the system stack. The largest steps (`--text-3xl`, `--text-4xl`) are fluid with `clamp()` so they shrink on phones. Prices, bid amounts, and other figures that change or line up MUST use tabular numerals (`font-variant-numeric: var(--figures-amount)`).
- **Breakpoints:** layouts are intrinsic by default (grids wrap at `--size-tile-min`). Things that need a condition, such as the nav collapsing to a menu, MAY use only the named breakpoint values documented in `tokens.css` (`--breakpoint-sm` 40rem, `--breakpoint-lg` 64rem). They're written out only inside `@media` or `@container` conditions, in range syntax, because CSS can't read custom properties there.
- **Fonts:** body, UI, and numbers use the system font stack. One Google Font, self-hosted, is used only for headings (the display and heading roles) and the hero lockup: **Plus Jakarta Sans** (Tokotype, SIL OFL 1.1), preloaded on each page. It's the variable WOFF2 with the Latin subset, committed under `public/fonts/` with its license, and loaded with `@font-face` and `font-display: swap`. The system stack is its fallback. The site MUST NOT request anything from Google's servers. The font's license (SIL OFL) is recorded in `CREDITS.md`.
- **Figma:** `tokens.css` is the source of truth. Figma variables and styles mirror it with matching names: drop the `--` and turn the first hyphen into a slash (`--color-accent` ↔ `color/accent`). The token sheet lists each Figma name. On Figma Pro there's no Variables REST API or Code Connect, so the sync is a manual push plus a drift check at each milestone checkpoint, not CI. The Figma work happens outside this repo.
- Starter component list: button, text input, textarea, select, date-time input, form field (label + help + error), radio card, card, item tile, badge/status pill, table, dialog, toast, banner, empty state, page header, site header and nav, profile menu, avatar (with top-bidder crown), photo uploader (with reorder), photo carousel, demo bar.
- **Logos:**
  - **Marks:** the Kestrel org mark (the teal bird) and the Kestrel Gives event mark (the bird holding a heart) are the owner's own raster artwork, kept in `design/source/logos/`. They MUST be used unmodified: no redrawing, recoloring, or tracing. The only allowed changes are cropping whitespace and resizing or exporting (PNG at 1x and 2x, in `public/brand/`).
  - **Dark mode:** the marks' white face and chest are part of the art, so in dark mode the marks sit on a light rounded tile in the art's own white. The Home hero (event mark with the lettering) is a light card in both modes, because the event mark's file has its white background built in.
  - **Hero lockup:** the event mark, then "Kestrel" in brand teal over "gives" in brand coral, both live text in the heading font (`--type-hero`). There's no hand-drawn lettering, no heart over the i (the mark carries the heart), and no swash. The whole lockup has one accessible name, "Kestrel Gives". Brand teal and coral are sampled from the event mark.
  - **Favicon:** the org mark as-is, padded to a square (16 and 32px, transparent). The Apple touch icon (180px) is the org mark placed on a white square, since iOS shows transparency as black. A dedicated small mark MAY come later.
  - **Charities** (v1.20, v1.22): the owner's own files, used unmodified (no redrawing, recoloring, or tracing; resizing and compressing are allowed). The originals stay in `design/source/charities/`; the site serves resized, compressed copies at 2x the displayed size from `public/brand/charities/`. On Home and the giving page each card stacks the logo, big, over the name and the description, on a light tile in dark mode. The logo spells the name, so it's decorative (`alt=""`).
- **Avatars:** initials on a token-colored circle. No photos of people.
- **Top-bidder crown:** the current high bidder's avatar gets a small, slightly tilted, hand-drawn-style crown at its top edge, everywhere their avatar appears in that item's bid history. It MUST be an original drawing, not traced or copied from any artwork.

## 6. Accessibility

- MUST meet **WCAG 2.2 AA**, in both light and dark mode.
- MUST use semantic HTML first, and ARIA only when no native element works.
- Everything MUST work with a keyboard alone, with visible focus states. No interaction may require dragging (photo reordering uses arrow buttons).
- Interactive targets are at least 44px (`--size-target`). 36px (`--size-target-sm`) is allowed only in dense rows (tables) and the toast's dismiss button; never below WCAG 2.2's 24px. Links inside running text are exempt, as in WCAG 2.5.8. (Added v1.6.)
- Status changes (outbid, bid placed, sold out, phase changes, demo user switched) MUST be announced to screen readers.
- MUST respect `prefers-reduced-motion`.
- **Dark mode ships now**, following `prefers-color-scheme`. There is no manual toggle.

## 7. Product and business rules

### 7.1 Event and phases
Each year is one **event** record ("Kestrel Gives 2026," etc.) with its own settings. Phases are driven entirely by admin-set dates. There is no "close event" button.

0. **Not scheduled yet** (v1.17): the event is missing any of its three dates, as it is right after Reset for next year (section 7.8). Employees can't submit, bid or buy; the phase banner says the dates for the event aren't set yet. Admins can still add items and set the dates. **Before submissions open** (dates set, submissions not yet open) works the same way, and the banner gives the date submissions open.
1. **Submission window** (submissions open → bidding opens): anyone can submit and browse. Bidding and buying are disabled, with a clear "Bidding opens …" message.
2. **Live** (bidding opens → bidding closes): bidding and buying are open. Submissions are closed to employees. Admins MAY still add items.
3. **Ended** (after bidding closes): winners are determined automatically and the proof deadline starts.

Winners are finalized on the first request after the close time, exactly once, even if two requests arrive together. App rules MUST NOT rely on scheduled jobs (v1.11: the demo's daily Restore in section 3.1 is the one scheduled job, and it is demo tooling, not an app rule).

**Event time zone:** each event stores an IANA time zone, default **America/New_York**. (The original defaulted to Pacific because the event was held in San Francisco.) Admins enter dates in the event's zone. All times MUST be stored in UTC and shown in the viewer's local time zone, with the zone labeled.

**Event settings (admin):** name, time zone, submissions open, bidding opens, bidding closes, default minimum starting bid (default $10), bid increment (default $5), proof deadline in days after close (default 7), giving platform URL.

### 7.2 Charities
Three fictional charities, seeded and read-only in v1:

| Charity | What it does |
|---|---|
| **Lantern Paws** | Fosters and rehomes cats and dogs from crowded shelters |
| **Lunchbox Brigade** | Packs weekend and summer meals for kids who rely on school lunch |
| **Saplingworks** | Plants and cares for street trees in neighborhoods with the least shade |

Each has a name, a one-sentence description, and an original logo. The owner supplies the logos, and each charity has its own (v1.8, v1.22; section 5). There is **one donation destination**: people donate once on the giving platform, and the funds are **split equally among the three charities**. Donors don't choose a charity.

### 7.3 Items
- **Submitting** (employees during the submission window; admins any time). The form's first question is the sale type, shown as two side-by-side radio cards: **Silent auction** and **Instant sale**, each with a label and a one-line description of when to choose it. The rest of the form is disabled until one is chosen.
  - Silent auction: starting bid (defaults to the event minimum; the submitter MAY set it higher).
  - Instant sale: price and quantity.
  - Both: title, description, and **1–5 photos (at least one required)**. Each uploaded thumbnail has left and right arrow buttons to reorder it; the first photo is the cover.
- **Item page:** photo carousel with clickable thumbnails beneath, details, current high bid or price and stock, and actions.
- **Edit:** shown to the submitter and admins **until bidding ends** (v1.16). Once an item has any bid or purchase, its **sale type, starting bid, price, and quantity are locked**. Title, description, and photos stay editable. After bidding ends, nobody edits or deletes an item, admins included: the results are final.
- **Delete:** the submitter or an admin, only while the item has no bids and no purchases.
- **Cancel:** admins only. The item is removed from listings, but its page stays up with a clear "This item has been cancelled" banner. Anyone who bid on it or bought it sees the cancellation on their dashboard. Purchases and bids on it are marked cancelled.

### 7.4 Bidding (silent auction)
- A first bid MUST be at least the item's starting bid. Every later bid MUST exceed the current high bid by at least the event's increment.
- Copy that states a minimum bid or the increment ("At least $50. Bids go up by $5.") MUST be computed from the event settings and the item's current high bid, never hard-coded.
- Bidding MUST be blocked outside the live phase.
- The current high bidder MUST NOT bid again on that item ("You're already the high bidder").
- No one bids on their own item; its page shows "This is your item." in place of the form (v1.12). Admins otherwise bid like anyone.
- Placing a bid shows a confirmation dialog with the amount and item.
- **Simultaneous bids:** each bid locks the item's row, checks it against the current high bid, and saves it in one transaction. The first saved wins. The other is rejected with the new minimum ("Someone just bid $55. The minimum is now $60."). Timestamps come from the database, never the browser.
- Bidders cannot retract bids. **Admins can remove a bid**, and the high bid recalculates.
- **Bid history is public:** every logged-in user sees each bid's bidder name, avatar, amount, and time. This is intentional; coworkers enjoyed outbidding each other. The high bidder's avatar wears the crown.
- The item page refreshes the high bid while visible (polling every 30 seconds) and after any bid.
- No time extensions: every item closes at the event's close time.

### 7.5 Buying (instant sale)
- Buying MUST be blocked outside the live phase.
- Each purchase buys one unit, behind a confirmation dialog. People MAY buy again while stock lasts. No per-person limit.
- No one buys their own item; its page shows "This is your item." in place of the button (v1.12). Admins otherwise buy like anyone.
- Inventory MUST NOT go below zero, even with simultaneous purchases. Use a transaction with a row lock.
- **Admins can cancel a single purchase** (v1.18), behind a confirmation. The buyer's donation total drops and their proof is re-checked (section 7.6). The unit goes back into stock only while the sale is still open (live), not after the close. Two admins cancelling the same purchase at once cancel it once.

### 7.6 Donation proof and statuses
- Auction winners and instant-sale buyers donate on the outside giving platform, then upload proof: the amount and a screenshot. (No charity choice; see 7.2.)
- **One combined proof per person per event**, covering their total, since every donation is split across all three charities. The **donation total** is the sum of the person's winning bids plus their non-cancelled purchases. It is computed, never stored; each proof records the total as it was at upload.
- If a person's total changes after they uploaded proof (an admin removes a winning bid after close, a purchase or item is cancelled, winners are finalized), what happens depends on their latest proof (v1.9):
  - **Approved:** it goes back to pending with its review cleared, and a banner asks them to check it ("Your donation total changed…").
  - **Pending:** unchanged; the amount warning already covers a mismatch.
  - **Rejected:** stays rejected with its reason; the banner shows the new total and still asks for a new upload.

  One function makes this check, and every path that changes a total calls it. (Combined proof added v1.8.)
- Proof is due **7 days after the event closes** (event setting). The dashboard shows days remaining.
- If the amount entered is less than the donation total, the form warns but allows submission. The admin decides.
- Admins **approve** or **reject** each proof. A rejection requires a reason, shown to the person, who MAY upload again.
- Instead of emails, statuses appear in the app: outbid (on the item and dashboard), won (with an upload-proof link), purchase receipt, proof rejected (with reason), item cancelled.

### 7.7 Email templates (admin)
- Six templates: bid receipt, outbid, winner, purchase receipt, proof rejected, item cancelled.
- Each has a subject and a plain-text body. No rich-text editor.
- Copy that asks for proof uses the person's donation total ("Upload proof of your $345 donation"), never an item name (v1.8).
- An **Insert variable** menu inserts tokens such as `{{first_name}}`, `{{item_name}}`, `{{amount}}`, `{{proof_deadline}}`, `{{rejection_reason}}` at the cursor. Each template offers only the variables that apply to it.
- Unknown or misspelled tokens show an inline error and block saving.
- A live preview beside the editor fills the template with sample seed data.
- Each template has **Restore default**.
- Nothing is sent.

### 7.8 Yearly reset (admin)
- **Reset for next year** wipes items, photos (including their uploaded files), bids, purchases, and proofs.
- It keeps users, roles, charities, email templates, and event settings. It creates the next year's event as a new event record with the settings copied and the dates cleared (v1.8); the previous event record stays.
- Locked until **30 days after bidding closes**. Requires a confirmation dialog where the admin types the event name.
- **On the shared demo** (v1.17): after a Reset, the empty Admin Dashboard and Home both say the demo was reset for next year and offer **Restore demo data** right away (the same action as the demo bar's, with its cooldown). Nobody has to wait for the daily Restore.

### 7.9 Money
Money MUST be stored as whole cents (integers), never floating point.
- **Whole dollars only, everywhere** (added v1.5): starting bid, price, bids, and the proof amount. No cents anywhere. Stored amounts are always a multiple of 100 cents, and the API rejects any other value.
- Money inputs are `type="text"` with `inputmode="numeric"` and a digits-only pattern, never `type="number"` (which allows decimals, "e" notation, and scroll-wheel changes). If someone types cents or symbols, the field shows the inline message "Whole dollars only."

## 8. Screens

### Navigation
Site header with the Kestrel wordmark and: **Home**, **Silent Auction**, **Instant Sale**, **Your Items**, and **Submit an Item** (shown only during the submission window). In the upper right is the user's avatar. For admins, it has a chevron and opens a menu with a link to the **Admin Dashboard**: a disclosure (a button with `aria-expanded` and a list of links), not an ARIA `role="menu"`, since it's navigation. Admin links are never shown to employees. The nav collapses to a menu button when the header is narrower than `--breakpoint-lg` (64rem), measured on the header's own width (a container query); the full nav needs about 52rem, and 64rem is the next named breakpoint. (Updated v1.6.)

### Responsive
One responsive, mobile-first site, not a separate app. Every screen MUST work from 360px wide up (the design target), and at 320px nothing may scroll or be cut off sideways (WCAG 2.2 reflow, 1.4.10). The only exceptions are regions meant to scroll sideways, such as a wide table. Layouts start from the phone and add columns as space allows (section 5, Breakpoints). The browser checks run at 390px and 1280px, plus a reflow check at 320px (section 12).

### Phase banners
A banner just below the header shows the current phase message, for example "Submissions are open until Nov 14," "Bidding opens Nov 17 at 9:00 AM," "Bidding ends in 2 days," "Bidding has ended. Winners, please upload proof by Dec 1." One banner at a time.

### Screen list
- **Home**, matching the original:
  1. A big, colorful **Kestrel Gives** event wordmark as the hero (original, built from tokens, with a dark-mode version)
  2. A description of the event
  3. **How to participate** (submit, bid or buy, donate once, upload proof)
  4. Cards for the three charities, noting that donations are split equally among them
  No item lists on Home. On a first visit, the welcome dialog (section 3.1) introduces the demo (v1.24; it replaced v1.21's "New here?" line above the hero).
- **Silent Auction** and **Instant Sale:** separate browse pages, each a grid of item tiles. Sort by newest, price, or (silent auction) most bids. No search.
- **Item page** (section 7.3).
- **Submit an Item** and **Edit item** (section 7.3).
- **Your Items** (personal dashboard), four sections: *My bids* (winning or outbid), *Won & purchased* (with proof status and days left), *My donated items* (with edit), and *Cancelled* (shown only if something was cancelled).
- **Proof upload** (section 7.6).
- **Giving platform stub** (section 3).
- **Guide** (v1.21), `/guide`, "Try it: a 5-minute tour" for first-time visitors (portfolio reviewers): six scenarios (get outbid; buy the last one; win and donate, review as admin and change the outcome as one story; submit an item last, since its phase clears activity), each with who to view as, which phase, numbered steps, and one line on why it works that way; then "Also try" (dark mode, a phone, keyboard only, 200% zoom) and a closing line on Restore. Each scenario has **Set me up**, which says before the click what it changes (the viewer is just you; the phase is everyone), then sets the viewer and the phase with the demo bar's own rules (only Submissions open asks first, with its cooldown), never restores on its own, and checks that the state the scenario needs is still there (finding items by title, never by id). If it's gone, it says what happened and points to Restore demo data. With `?demo=off` the steps stay and the buttons go. It meets the same conformance checks as every screen.
- **Admin Dashboard:**
  - **Totals:** silent auction total, instant sale total, and grand total, each shown as **pledged** (winning bids and purchases) and **confirmed** (approved proofs only). (v1.17) A proof is one combined amount per person, so: the **grand confirmed** total is the sum of the amounts on approved proofs; the **silent auction** and **instant sale confirmed** totals are the winning bids and purchases owed by people whose latest proof is approved. A line under the totals shows where the approved amounts differ from what those people owe ("Approved proofs: $1,240 against $1,300 owed by those people, $60 short"). So the two sale-type figures can add up to a different number than the grand confirmed total.
  - **People:** employees with their bids, wins, purchases, and proof status.
  - **Proof review queue** (section 7.6).
  - **Items:** all items with bid history (and, for instant sale, their purchases), plus remove bid, cancel purchase (v1.18), and cancel item.
  - **Event settings** (section 7.1).
  - **Email templates** (section 7.7).
  - **Reset for next year** (section 7.8).

## 9. Data model (starting point)

The agent proposes the final schema in Milestone 2. Expected tables: `events`, `users` (name, role), `charities`, `items` (type, status, prices in cents, quantity, submitter), `item_photos` (position), `bids`, `purchases`, `proofs` (one per person per event: amount, the donation total at upload, image, status, rejection reason; v1.8), `email_templates`.

## 10. Seed data

- **7 users:** 2 admins and 5 employees, with invented names.
- **16 items:** 10 silent auction and 6 instant sale, the kind of thing coworkers actually donate (a pottery class for two, a sourdough starter, a custom pet portrait, a weekend at a lake cabin, guitar lessons…). All invented; no real businesses.
- **States covered**, so every screen state appears in the visual review: no bids yet, the current viewer outbid, the current viewer winning, ending soon, won, sold out, low stock, cancelled, and proofs pending, approved, and rejected. "Ending soon" means bidding closes within 24 hours; "low stock" means an instant-sale item has 3 or fewer left. Both numbers live in one module, `src/components/thresholds.ts` (DECISIONS #61). (Added v1.7.)
- **Photos** (stored in Blob, never in git; see section 4, v1.10): real free, royalty-free stock photos (the Unsplash, Pexels and Pixabay licenses qualify) with no recognizable faces, brands, logos, or real places, checked at full size after download. The owner approves a contact sheet of candidates, with links and licenses, before anything is downloaded. Every photo is credited, even when its license doesn't require it (v1.8). Most items get one photo, three get three, and one gets five. Every photo is logged in `CREDITS.md` with its source link, photographer, and license, checked when downloaded. The owner approves the photos in Milestone 2.
- No past events.

## 11. Code conventions

- Small, single-purpose modules. No file over about 300 lines without a reason.
- TypeScript in `strict` mode. No `any` without a comment explaining why.
- Comments explain why, not what.
- No dead code, commented-out code, or unused dependencies.
- Every API endpoint validates its input, checks the acting user's role, and returns clear errors.

## 12. Conformance checks

These run before any change counts as done. Each is a script in `package.json`. They run at two levels (v1.23):

- **Quick check** (`npm run check:quick`), required at every stage checkpoint: the dependency allowlist, no seed images, the token check, the type check and the unit tests, all of them; plus the database tests and browser tests for the areas the stage changed. A script maps the files changed against `main` to test files: for example, the admin pages, `lib/data/admin*` and `api/admin.ts` map to the admin database tests, the admin browser spec, and the axe and reflow checks for the admin screens. Shared code (the shell, shared components, tokens and base CSS, the core of the data layer, the seed, migrations, configs and shared test helpers) runs everything, and so does any file the map doesn't know. A changed test file runs itself. The quick check prints what it ran and why, and still runs database tests and browser tests one after the other.
- **Full check** (`npm run check`): every check below, on every screen and state. Required before any push to `main`, at the end of every milestone, and at the checkpoint of any stage that changes the schema, the seed, or the demo controls.

The checkpoint says which level ran.


1. **Dependency allowlist:** `package.json` contains only the packages in section 4.
2. **Token check:** a short Node script (no dependencies) finds raw color, size, or spacing values outside `public/styles/tokens.css`. The only exceptions are the named breakpoint values, and only inside `@media` or `@container` conditions. It also flags `--text-*` scale steps used outside `tokens.css` (use a `--type-*` role), and confirms every color token in that file has a light and a dark value, written `light-dark(<light>, <dark>)`.
3. **Accessibility:** axe checks via Playwright on every screen, in light and dark mode, at 390px and 1280px wide, with zero violations. The same check runs keyboard tests for interactive components (added v1.5): operating them with the keyboard alone, where focus goes, and what is announced.
4. **Type check:** `tsc --noEmit` passes.
5. **Business rules:** `node:test` tests cover section 7: bid minimums and increments, no self-outbidding, time windows for every phase, the inventory floor, simultaneous bids and purchases (against real Postgres on the `dev` branch), edit locks, delete and cancel rules, the reset lock, and template variable validation.
6. **Visual review:** Playwright screenshots of every screen in every seeded state, in light and dark mode, at 390px and 1280px wide, with `?demo=off`, for a human to review.
7. **Reflow:** Playwright loads every screen at 320px wide and fails if the page scrolls sideways or any element cuts off content sideways. Regions meant to scroll (overflow auto or scroll) and text truncated with an ellipsis are allowed.
8. **No seed images in git** (added v1.10): a short Node script fails if git tracks or has staged any `.jpg`, `.jpeg`, `.png` or `.webp` under a seed or photo path, except the two committed placeholders. The pre-commit hook runs it too.

## 13. How the agent works

- **Work in stages with checkpoints.** Each milestone is broken into small stages. Each stage ends at a checkpoint: stop, show something running (a URL or screenshots) with the quick check passing (the full check where section 12 requires it), and wait for the owner's go before continuing. The full check runs before any push to `main`. No stage should be big enough to waste much work if it's off track.
- Propose before building. For each milestone, share the plan (data model, screens, files) and wait for approval.
- Ask when something is ambiguous. Don't guess.
- Log every significant decision in `DECISIONS.md`: date, decision, options considered, why.
- Keep `BUILD-LOG.md` for the case study: dated entries on what was built, what was hard, what AI did well, and where the owner stepped in, with start and end timestamps per milestone.
- Never mark something done if a conformance check fails.

## 14. Milestones

1. **Design system:** token sheet for review (light and dark), then core components and `DESIGN-SYSTEM.md`.
2. **Data:** schema, migrations, seed script, seed photos and `CREDITS.md`.
3. **App shell:** header and nav, profile menu, demo bar, phase banners, Home.
4. **Browsing and buying:** Silent Auction and Instant Sale pages, item page with carousel, bidding, bid history with crown, buying.
5. **Employee flows:** Submit an Item, edit and delete, Your Items, proof upload.
6. **Admin:** dashboard totals, people, proof review, item management (remove bid, cancel), event settings, email templates, reset.
7. **Polish and ship:** full conformance pass, README, final deploy.

## 15. Definition of done

- Every in-scope feature works, end to end, with seed data.
- All conformance checks pass.
- Deployed to Vercel with a working URL.
- README covers what it is, the clean-room note, how to run it locally (one command), and how to deploy.

---

## Decisions

All decisions, with options considered and reasons, are logged in [`DECISIONS.md`](DECISIONS.md).
