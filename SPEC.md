# Kestrel Gives — Build Spec & Conformance Rules

**Status:** v1.2 · Owner: Derek Collins · Last updated: Oct 31, 2026

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
- The site footer MUST include: "Kestrel is a fictional organization. Demo only."

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
- **Jump to:** submission window / live / ended / 30+ days after. Moves the stored event dates relative to now. It MUST NOT fake the clock; the real time-window rules are what get exercised.
- **Restore demo data:** resets everything to the seeded state (including email templates), behind a confirmation dialog.
- Collapsible to a thin strip using `<details>`; collapsed state is remembered.
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
- MUST deploy to **Vercel** (Hobby plan): static files for the front end, and Vercel Functions (TypeScript) for the API.
- URL: the free `*.vercel.app` address (ideally `kestrel-gives.vercel.app`). No custom domain.
- Everything MUST work within free-plan limits. No feature may require a paid plan.

### Database
- **Neon Postgres** (free plan), via the Vercel Marketplace.
- Plain SQL with parameters. No ORM.
- Schema changes MUST be numbered SQL files in `migrations/`, applied by a small migration script (no dependencies) that records which have run.
- Seed data MUST come from a script that can be re-run safely.
- Two branches: **`main`** for the deployed demo, **`dev`** for local work and tests. Tests reseed `dev` before each run and MUST NOT touch `main`.

### File storage
- **One public Vercel Blob store** on the deployed site, for item photos and proof images uploaded through the app. Production and Preview share it, each under its own path prefix (`production/`, `preview/`); the storage layer MUST refuse to delete anything outside the current environment's prefix.
- **Seed photos** are committed to the repo as static files, never stored in Blob, so restoring demo data costs no Blob operations and works the same everywhere.
- Local dev and tests store uploads in a local folder (ignored by git), so tests don't use up Blob's monthly operation allowance.
- Upload limits: images only (JPEG, PNG, WebP), size-capped, validated on the server.

### Secrets
- `.env.local` holds credentials and MUST be in `.gitignore` from the first commit.
- A pre-commit hook (no dependencies) MUST block committing any `.env` file or database URL.

### Browser support
The latest two versions of Chrome, Safari, Firefox, and Edge.

## 5. Design system

There is no inherited design system, so this project defines its own, from scratch. The design system is itself a spec: the agent builds only from it.

- All visual values MUST come from design tokens (CSS custom properties) in `public/styles/tokens.css` (served as `/styles/tokens.css`): color, type scale, spacing, radius, shadow, motion.
- Every color token MUST have a light and a dark value (section 6).
- Components MUST NOT hard-code colors, font sizes, or spacing. Raw hex values or `px` numbers outside `public/styles/tokens.css` are a conformance failure.
- Every component MUST be documented in `DESIGN-SYSTEM.md`: purpose, variants, states (default, hover, focus, active, disabled, loading, error, empty), and do/don't usage.
- New components MUST be added to the design system before they're used in a screen.
- The look is decided in Milestone 1: the owner reviews a token sheet before any screen is built.
- Starter component list: button, text input, textarea, select, date-time input, form field (label + help + error), radio card, card, item tile, badge/status pill, table, tabs, dialog, toast, banner, empty state, page header, site header and nav, profile menu, avatar (with top-bidder crown), photo uploader (with reorder), photo carousel, demo bar.
- **Logos:** the Kestrel wordmark, the big colorful Kestrel Gives event wordmark for Home, and the three charity logos are original, simple SVGs built from tokens so they work in dark mode.
- **Avatars:** initials on a token-colored circle. No photos of people.
- **Top-bidder crown:** the current high bidder's avatar gets a small, slightly tilted, hand-drawn-style crown at its top edge, everywhere their avatar appears in that item's bid history. It MUST be an original drawing, not traced or copied from any artwork.

## 6. Accessibility

- MUST meet **WCAG 2.2 AA**, in both light and dark mode.
- MUST use semantic HTML first, and ARIA only when no native element works.
- Everything MUST work with a keyboard alone, with visible focus states. No interaction may require dragging (photo reordering uses arrow buttons).
- Status changes (outbid, bid placed, sold out, phase changes, demo user switched) MUST be announced to screen readers.
- MUST respect `prefers-reduced-motion`.
- **Dark mode ships now**, following `prefers-color-scheme`. There is no manual toggle.

## 7. Product and business rules

### 7.1 Event and phases
Each year is one **event** record ("Kestrel Gives 2026," etc.) with its own settings. Phases are driven entirely by admin-set dates. There is no "close event" button.

1. **Submission window** (submissions open → bidding opens): anyone can submit and browse. Bidding and buying are disabled, with a clear "Bidding opens …" message.
2. **Live** (bidding opens → bidding closes): bidding and buying are open. Submissions are closed to employees. Admins MAY still add items.
3. **Ended** (after bidding closes): winners are determined automatically and the proof deadline starts.

Winners are finalized on the first request after the close time, exactly once, even if two requests arrive together. No scheduled jobs.

**Event time zone:** each event stores an IANA time zone, default **America/New_York**. (The original defaulted to Pacific because the event was held in San Francisco.) Admins enter dates in the event's zone. All times MUST be stored in UTC and shown in the viewer's local time zone, with the zone labeled.

**Event settings (admin):** name, time zone, submissions open, bidding opens, bidding closes, default minimum starting bid (default $10), bid increment (default $5), proof deadline in days after close (default 7), giving platform URL.

### 7.2 Charities
Three fictional charities, seeded and read-only in v1:

| Charity | What it does |
|---|---|
| **Lantern Paws** | Fosters and rehomes cats and dogs from crowded shelters |
| **Lunchbox Brigade** | Packs weekend and summer meals for kids who rely on school lunch |
| **Saplingworks** | Plants and cares for street trees in neighborhoods with the least shade |

Each has a name, a one-sentence description, and an original logo. There is **one donation destination**: people donate once on the giving platform, and the funds are **split equally among the three charities**. Donors don't choose a charity.

### 7.3 Items
- **Submitting** (employees during the submission window; admins any time). The form's first question is the sale type, shown as two side-by-side radio cards: **Silent auction** and **Instant sale**, each with a label and a one-line description of when to choose it. The rest of the form is disabled until one is chosen.
  - Silent auction: starting bid (defaults to the event minimum; the submitter MAY set it higher).
  - Instant sale: price and quantity.
  - Both: title, description, and **1–5 photos (at least one required)**. Each uploaded thumbnail has left and right arrow buttons to reorder it; the first photo is the cover.
- **Item page:** photo carousel with clickable thumbnails beneath, details, current high bid or price and stock, and actions.
- **Edit:** shown to the submitter and admins. Once an item has any bid or purchase, its **sale type, starting bid, price, and quantity are locked**. Title, description, and photos stay editable.
- **Delete:** the submitter or an admin, only while the item has no bids and no purchases.
- **Cancel:** admins only. The item is removed from listings, but its page stays up with a clear "This item has been cancelled" banner. Anyone who bid on it or bought it sees the cancellation on their dashboard. Purchases and bids on it are marked cancelled.

### 7.4 Bidding (silent auction)
- A first bid MUST be at least the item's starting bid. Every later bid MUST exceed the current high bid by at least the event's increment.
- Bidding MUST be blocked outside the live phase.
- The current high bidder MUST NOT bid again on that item ("You're already the high bidder").
- Placing a bid shows a confirmation dialog with the amount and item.
- **Simultaneous bids:** each bid locks the item's row, checks it against the current high bid, and saves it in one transaction. The first saved wins. The other is rejected with the new minimum ("Someone just bid $55. The minimum is now $60."). Timestamps come from the database, never the browser.
- Bidders cannot retract bids. **Admins can remove a bid**, and the high bid recalculates.
- **Bid history is public:** every logged-in user sees each bid's bidder name, avatar, amount, and time. This is intentional; coworkers enjoyed outbidding each other. The high bidder's avatar wears the crown.
- The item page refreshes the high bid while visible (polling every 30 seconds) and after any bid.
- No time extensions: every item closes at the event's close time.

### 7.5 Buying (instant sale)
- Buying MUST be blocked outside the live phase.
- Each purchase buys one unit, behind a confirmation dialog. People MAY buy again while stock lasts. No per-person limit.
- Inventory MUST NOT go below zero, even with simultaneous purchases. Use a transaction with a row lock.

### 7.6 Donation proof and statuses
- Auction winners and instant-sale buyers donate on the outside giving platform, then upload proof: the amount and a screenshot. (No charity choice; see 7.2.)
- Proof is due **7 days after the event closes** (event setting). The dashboard shows days remaining.
- If the amount entered is less than what's owed, the form warns but allows submission. The admin decides.
- Admins **approve** or **reject** each proof. A rejection requires a reason, shown to the person, who MAY upload again.
- Instead of emails, statuses appear in the app: outbid (on the item and dashboard), won (with an upload-proof link), purchase receipt, proof rejected (with reason), item cancelled.

### 7.7 Email templates (admin)
- Six templates: bid receipt, outbid, winner, purchase receipt, proof rejected, item cancelled.
- Each has a subject and a plain-text body. No rich-text editor.
- An **Insert variable** menu inserts tokens such as `{{first_name}}`, `{{item_name}}`, `{{amount}}`, `{{proof_deadline}}`, `{{rejection_reason}}` at the cursor. Each template offers only the variables that apply to it.
- Unknown or misspelled tokens show an inline error and block saving.
- A live preview beside the editor fills the template with sample seed data.
- Each template has **Restore default**.
- Nothing is sent.

### 7.8 Yearly reset (admin)
- **Reset for next year** wipes items, photos (including their uploaded files), bids, purchases, and proofs.
- It keeps users, roles, charities, email templates, and event settings. Settings carry over as the starting point for next year, with the dates cleared.
- Locked until **30 days after bidding closes**. Requires a confirmation dialog where the admin types the event name.

### 7.9 Money
Money MUST be stored as whole cents (integers), never floating point.

## 8. Screens

### Navigation
Site header with the Kestrel wordmark and: **Home**, **Silent Auction**, **Instant Sale**, **Your Items**, and **Submit an Item** (shown only during the submission window). In the upper right is the user's avatar. For admins, it has a chevron and opens a menu with a link to the **Admin Dashboard**. Admin links are never shown to employees.

### Phase banners
A banner just below the header shows the current phase message, for example "Submissions are open until Nov 14," "Bidding opens Nov 17 at 9:00 AM," "Bidding ends in 2 days," "Bidding has ended. Winners, please upload proof by Dec 1." One banner at a time.

### Screen list
- **Home**, matching the original:
  1. A big, colorful **Kestrel Gives** event wordmark as the hero (original, built from tokens, with a dark-mode version)
  2. A description of the event
  3. **How to participate** (submit, bid or buy, donate once, upload proof)
  4. Cards for the three charities, noting that donations are split equally among them
  No item lists on Home.
- **Silent Auction** and **Instant Sale:** separate browse pages, each a grid of item tiles. Sort by newest, price, or (silent auction) most bids. No search.
- **Item page** (section 7.3).
- **Submit an Item** and **Edit item** (section 7.3).
- **Your Items** (personal dashboard), four sections: *My bids* (winning or outbid), *Won & purchased* (with proof status and days left), *My donated items* (with edit), and *Cancelled* (shown only if something was cancelled).
- **Proof upload** (section 7.6).
- **Giving platform stub** (section 3).
- **Admin Dashboard:**
  - **Totals:** silent auction total, instant sale total, and grand total, each shown as **pledged** (winning bids and purchases) and **confirmed** (approved proofs only).
  - **People:** employees with their bids, wins, purchases, and proof status.
  - **Proof review queue** (section 7.6).
  - **Items:** all items with bid history, plus remove bid and cancel.
  - **Event settings** (section 7.1).
  - **Email templates** (section 7.7).
  - **Reset for next year** (section 7.8).

## 9. Data model (starting point)

The agent proposes the final schema in Milestone 2. Expected tables: `events`, `users` (name, role), `charities`, `items` (type, status, prices in cents, quantity, submitter), `item_photos` (position), `bids`, `purchases`, `proofs` (amount, image, status, rejection reason), `email_templates`.

## 10. Seed data

- **7 users:** 2 admins and 5 employees, with invented names.
- **16 items:** 10 silent auction and 6 instant sale, the kind of thing coworkers actually donate (a pottery class for two, a sourdough starter, a custom pet portrait, a weekend at a lake cabin, guitar lessons…). All invented; no real businesses.
- **States covered**, so every screen state appears in the visual review: no bids yet, the current viewer outbid, the current viewer winning, ending soon, won, sold out, low stock, cancelled, and proofs pending, approved, and rejected.
- **Photos** (committed as static files; see section 4): real free-license stock photos (for example Unsplash or Pexels) with no visible brands, logos, or identifiable faces. Most items get one photo, three get three, and one gets five. Every photo is logged in `CREDITS.md` with its source link, photographer, and license, checked when downloaded. The owner approves the photos in Milestone 2.
- No past events.

## 11. Code conventions

- Small, single-purpose modules. No file over about 300 lines without a reason.
- TypeScript in `strict` mode. No `any` without a comment explaining why.
- Comments explain why, not what.
- No dead code, commented-out code, or unused dependencies.
- Every API endpoint validates its input, checks the acting user's role, and returns clear errors.

## 12. Conformance checks

These run before any change counts as done. Each is a script in `package.json`.

1. **Dependency allowlist:** `package.json` contains only the packages in section 4.
2. **Token check:** a short Node script (no dependencies) finds raw color, size, or spacing values outside `public/styles/tokens.css`.
3. **Accessibility:** axe checks via Playwright on every screen, in light and dark mode, with zero violations.
4. **Type check:** `tsc --noEmit` passes.
5. **Business rules:** `node:test` tests cover section 7: bid minimums and increments, no self-outbidding, time windows for every phase, the inventory floor, simultaneous bids and purchases (against real Postgres on the `dev` branch), edit locks, delete and cancel rules, the reset lock, and template variable validation.
6. **Visual review:** Playwright screenshots of every screen in every seeded state, in light and dark mode, with `?demo=off`, for a human to review.

## 13. How the agent works

- **Work in stages with checkpoints.** Each milestone is broken into small stages. Each stage ends at a checkpoint: stop, show something running (a URL or screenshots) with all conformance checks passing, and wait for the owner's go before continuing. No stage should be big enough to waste much work if it's off track.
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
