# Kestrel Gives design system

Every component, its variants and states, and how to use it. Required by SPEC §5. The live gallery is at [`/design-system/`](https://kestrel-gives.vercel.app/design-system/) and shows each component in every state, in light and dark.

## Conventions

- **Tokens only.** Components use the custom properties in `public/styles/tokens.css`. Raw colors, px/rem/em lengths and `--text-*` scale steps are rejected by `npm run check:tokens`. Type is set with the `--type-*` roles.
- **One file per component** in `public/styles/components/`, joined into `components.css` inside `@layer components` (DECISIONS #48). Page defaults live in `base.css` (`@layer base`).
- **Naming:** block, element, modifier. `.btn` is the block, `.card__title` is an element, `.btn--danger` is a modifier. Modifiers are the **Figma variant names**, and the Figma component name is the block name in title case (`.btn--secondary` → component *Button*, variant *Variant=Secondary*).
- **States.** SPEC §5 lists eight: default, hover, focus, active, disabled, loading, error, empty. Each entry below says how the component shows each one, or why it doesn't apply (N/A). The `.is-hover`, `.is-active` and `.is-focus` classes force a state **for the gallery and Figma only**. The app relies on the real pseudo-classes.
- **Focus** is always a visible `--focus-width` ring in `--color-focus`, offset by `--focus-offset`, shown on `:focus-visible`.
- **Motion** uses the duration tokens, which become 0ms under `prefers-reduced-motion`.
- **Light and dark.** Every color token has both values, so components need no mode-specific rules.

### Content guidance

- **No payment language.** The app never takes payments: winners donate to the charity themselves and upload proof. Never write pay, paid, payment or checkout. (SPEC's "bid receipt" and "purchase receipt" status names are fine: they confirm a bid or an instant-sale claim, not a payment.) Use **donate**, **donation** and **proof** ("Donate and upload proof by November 21", "Proof of donation due", "Upload proof").
- **Donors are coworkers.** Items are donated by people in the organization (SPEC §10), never by businesses: "donated by Maya Okafor".
- **Describe the demo accurately.** It doesn't reset on a schedule; people start over with **Restore demo data** in the top bar.
- **Computed amounts.** Minimum-bid and increment copy comes from the event settings and the current high bid, never hard-coded (SPEC §7.4).
- Fictional names only (SPEC §2). Sentence case, plain words, and labels that start with a verb.

### Figma names

| Code | Figma |
|---|---|
| `.btn` with `--primary` (none), `--secondary`, `--quiet`, `--danger` | Button · Variant = Primary / Secondary / Quiet / Danger |
| `--sm` | Size = Small (default Medium) |
| `--icon`, `--block` | Layout = Icon only / Block (default Inline) |
| state | State = Default / Hover / Active / Focus / Disabled / Loading |

The same pattern applies to every component below. Each entry's **Figma** line gives the component name and its properties.

---

## Base

**Purpose:** page defaults: box sizing, body text and background, headings h1–h3, links, focus ring, images, and the `.visually-hidden` utility.

- `.visually-hidden`: text for screen readers only, such as "(top bidder)" or "(opens in a new tab)".
- **States:** N/A (element defaults, not a component). Links and focus follow the rules above.
- **Do:** let headings take their role from the element. **Don't:** restyle `h2` to look like `h1`; use the right level.
- **Figma:** text styles named after the type roles (`type/heading-1` …).

## Icon

**Purpose:** a small symbol that supports a label or stands in for one. 14 original line icons: `menu`, `close`, `chevron-down`, `chevron-left`, `chevron-right`, `arrow-up`, `arrow-down`, `upload`, `check`, `alert`, `info`, `clock`, `external`, `trash`.

- **Source:** `src/components/icons.ts` is the only place the drawings live. `icon(name, { label, size })` returns an `<svg>`. In static HTML, `<span data-icon="check" data-icon-size="sm">` is replaced by `hydrateIcons()`. Classes on the span carry over.
- **Drawing rules:** 24-unit grid, stroke width 2, round caps and joins, no fills, `currentColor`.
- **Classes:** `.icon`, `.icon--sm` (16px), default md (20px), `.icon--lg` (24px).
- **States:** default only. Hover, focus, active, disabled, loading and error are N/A: an icon isn't interactive and takes its color from its parent (a button's disabled color, a banner's tone). Empty: N/A.
- **Accessibility:** decorative icons (next to text that says the same thing) get `aria-hidden="true"`. An icon that stands alone gets `label` → `role="img"` and `aria-label`. Icon-only **buttons** put the label on the button instead (`aria-label="Close"`) and keep the icon hidden.
- **Do:** pair icons with words wherever there's room. **Don't:** use an icon as the only signal of status; don't add drawings outside `icons.ts`.
- **Figma:** *Icon* · Name = menu … trash · Size = Small / Medium / Large.

## Button

**Purpose:** starts an action on this page (submit, open, delete). For going somewhere, use a link.

- **Classes:** `.btn`; variants `--secondary`, `--quiet`, `--danger` (primary has no modifier); size `--sm`; layouts `--icon` (square, icon only) and `--block` (full width).
- **Variants:** *primary* for the main action, at most one per view. *Secondary* for alternatives ("Watch item"). *Quiet* for low-emphasis actions such as "Cancel" and toolbar icons. *Danger* for destructive actions, normally behind a confirmation dialog.
- **States:**
  - Default, hover (darker fill), active/pressed (darker still), focus (ring).
  - **Disabled:** `aria-disabled="true"` (preferred, so it stays focusable and nearby text can say why) or the native `disabled` attribute; both look the same. Script must ignore clicks while `aria-disabled` is set.
  - **Loading:** `aria-busy="true"` and `aria-disabled="true"` while a request runs. A spinner appears before the label, and the label may change to say what's happening ("Placing bid…"). The spinner stops under reduced motion; the words still say it's working.
  - Error: N/A on the button. The error is shown by the form field or a banner, and the button returns to default.
  - Empty: N/A.
- **Accessibility:** a real `<button type="button|submit">`. Minimum target `--size-target` (44px); `--sm` is 36px, for dense tables and toasts only. Icon-only buttons need `aria-label`.
- **Do:** start labels with a verb ("Place bid", "Add photos"). **Don't:** put two primary buttons side by side; don't use a button to navigate.
- **Figma:** *Button* · Variant = Primary / Secondary / Quiet / Danger · Size = Medium / Small · Layout = Inline / Icon only / Block · State = Default / Hover / Active / Focus / Disabled / Loading.

## Link

**Purpose:** takes you somewhere: another page, a section, or an external site.

- **Classes:** `.link`; `--quiet` (inherits the text color, for links inside meta text); `--external` (opens in a new tab: add the `external` icon and hidden "(opens in a new tab)" text, with `target="_blank" rel="noopener"`). Plain `<a>` in body text gets the same look from `base.css`.
- **States:** default (underlined); hover (thicker underline); active (text color); focus (ring). Disabled: N/A (a link that goes nowhere should be plain text). Loading, error, empty: N/A.
- **Accessibility:** always underlined, so it never relies on color alone. Link text says where it goes; avoid "click here".
- **Do:** use links for navigation, even when they look like buttons elsewhere. **Don't:** open internal pages in new tabs.
- **Figma:** *Link* · Variant = Default / Quiet / External · State = Default / Hover / Active / Focus.

## Status pill

**Purpose:** a short, non-interactive status label such as "Approved", "Proof due", "Ending soon" or "Outbid". SPEC calls it badge/status pill.

- **Classes:** `.pill`; tones `--success`, `--warning`, `--danger`; neutral has no modifier. Optional leading icon (sized sm automatically).
- **States:** default only. Hover, focus, active and disabled are N/A: it isn't interactive. Loading and empty are N/A. Error: use `--danger`.
- **Accessibility:** the word carries the meaning; color and icon only support it. Icons inside are decorative.
- **Do:** keep it to one or two words. **Don't:** make pills clickable; use a button or link.
- **Figma:** *Pill* · Tone = Neutral / Success / Warning / Danger · Icon = On / Off.

## Banner

**Purpose:** a message about the whole page or event that stays until the situation changes.

- **Classes:** `.banner` with `__body`, `__title`, `__text`, `__action`, and a leading icon. Tones: `--phase` (butter; where the event is: "Bidding is open"), `--info` (neutral: `--color-surface-muted` fill with an accent icon; also the default fill), `--success` (teal-soft fill), `--warning`, `--danger`.
- **States:** default. Hover, focus, active, disabled and loading are N/A on the banner itself; its action button has its own states. **Error** is `--danger`. Empty: N/A (no banner is shown).
- **Accessibility:** the phase banner and banners that appear after page load use `role="status"`. A danger banner that appears after a failed submit uses `role="alert"`, or focus moves to it, and it links to the field to fix. Icons are decorative.
- **Do:** say what happened and what to do next. **Don't:** use a banner for a passing confirmation (use a toast); don't stack more than two.
- **Figma:** *Banner* · Tone = Phase / Success / Warning / Danger / Info · Action = On / Off.

## Toast

**Purpose:** a brief confirmation that something just happened ("Bid placed").

- **Code:** `showToast(message, { tone, duration })` in `src/components/toast.ts`. It creates one `.toast-region` (`role="status"`, `aria-live="polite"`) at the bottom of the screen, above everything (`--layer-toast`).
- **Classes:** `.toast`; tones `--neutral`, `--success`, `--danger`; `__message`, `__dismiss`. `.toast--static` shows one in place, for the gallery only.
- **States:** default; it enters with a short rise that is instant under reduced motion. Hover and focus **pause** the timer (6 seconds by default), and it resumes when the pointer and focus leave. The dismiss button has the quiet button's states. Disabled, loading and empty: N/A. Error: `--danger` ("Couldn't save…"), but an error that needs action goes in a banner.
- **Accessibility:** announced politely without moving focus. Always dismissible. Never the only place important information appears.
- **Do:** keep it under one line where possible. **Don't:** put the only way to undo something in a toast.
- **Figma:** *Toast* · Tone = Neutral / Success / Danger.

## Card

**Purpose:** a contained group of content: an item, an event, a summary.

- **Classes:** `.card` with optional `__media`, `__header` > `__title`, `__body`, `__footer`. Modifiers: `--flat` (no shadow, for cards on other surfaces) and `--link` (the whole card opens the title's link).
- **States:** default. For `--link`: hover (deeper shadow, stronger border, underlined title); focus (ring around the whole card when its title link is focused); active (shadow settles). Disabled: N/A (don't link to something unavailable; show a status pill instead). Loading: N/A for now; skeletons come with the item tile in stage C. Empty: use the empty state inside the list, not an empty card. Error: N/A.
- **Accessibility:** the title is a heading at the right level. In `--link` cards the title's `<a>` is the only tab stop, and its `::after` stretches over the card, so other content in the card shouldn't be interactive.
- **Do:** keep footers to status and one figure. **Don't:** nest cards; don't put buttons inside a linked card.
- **Figma:** *Card* · Style = Raised / Flat · Link = On / Off · State = Default / Hover / Focus / Active · Media = On / Off.

## Empty state

**Purpose:** what a list or page shows when there's nothing in it yet.

- **Classes:** `.empty` with `__icon`, `__title`, `__text`, `__actions`.
- **States:** this *is* the empty state of other components. Default only; its action button has its own states. Hover, focus, active, disabled, loading and error: N/A. An error loading the list uses a danger banner instead.
- **Accessibility:** the title is a heading at the right level for the page. The icon is decorative.
- **Do:** say what's missing, why, and the next step, with one action if there is one. **Don't:** blame the person ("You haven't…") or leave it blank.
- **Figma:** *Empty state* · Action = On / Off.

## Avatar

**Purpose:** a person's initials on a token-colored circle. The current high bidder wears the crown (SPEC §5).

- **Classes:** `.avatar`, `--sm` (bid history), md default (header), `--lg` (profile menu); `.avatar__crown` (inline SVG with `__crown-shape` and `__crown-band`).
- **States:** default, and *crowned* (top bidder). Hover, focus and active: N/A (avatars sit inside buttons or rows that have their own states, such as the profile menu button in stage C). Disabled, loading, error and empty: N/A; with no name, show no avatar.
- **Accessibility:** `aria-hidden="true"`, because it always sits next to the person's name. The name carries "(top bidder)" as visually hidden text. The crown edge passes 3:1 against the avatar and the page in both modes (BUILD-LOG, stage A part 1).
- **Do:** show the crown everywhere that person's avatar appears in the item's bid history. **Don't:** use the crown for anything but the current high bid.
- **Figma:** *Avatar* · Size = Small / Medium / Large · Crown = On / Off.
