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
| `--sm` | Size = Small (default Medium; Small is drawn in the Default state only) |
| state | State = Default / Hover / Active / Focus / Disabled / Loading |
| `--icon` | a separate component, *Icon button* (Variant × Size) |
| `--block` | no variant: the *Button* instance is set to Fill width |

The same pattern applies to every component below. Each entry's **Figma** line gives the component name and its properties.

- **Keep each variant matrix under about 30 combinations.** When a component would need more, split it into separate components and say so in its Figma line (as *Icon button* is split from *Button*).
- **Layout-only modifiers aren't variants** when Figma can do the same with instance settings (Fill width for `--block`).
- **Icons are instance-swapped**, not variants (see Icon).

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
- **Figma:** each icon is its own component, *Icon / menu* … *Icon / trash* (14). Components that contain an icon expose an **instance-swap** property for it. Sizes aren't variants: the instance is resized to 16, 20 or 24 (sm, md, lg) and the stroke stays 2 on the 24-unit grid.

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
- **Figma:** *Button* · Variant = Primary / Secondary / Quiet / Danger × State = Default / Hover / Active / Focus / Disabled / Loading at Size = Medium (24), plus Size = Small in the Default state only, one per variant (4): **28 combinations**. Optional leading icon as an instance swap. **Separate component:** *Icon button* (`--icon`) · Variant × Size, with the icon as an instance swap. **Block** (`--block`) isn't a variant: set the *Button* instance to Fill width.

## Link

**Purpose:** takes you somewhere: another page, a section, or an external site.

- **Classes:** `.link`; `--quiet` (inherits the text color, for links inside meta text); `--external` (opens in a new tab: add the `external` icon and hidden "(opens in a new tab)" text, with `target="_blank" rel="noopener"`). Plain `<a>` in body text gets the same look from `base.css`.
- **States:** default (underlined); hover (thicker underline); active (text color); focus (ring). Disabled: N/A (a link that goes nowhere should be plain text). Loading, error, empty: N/A.
- **Accessibility:** always underlined, so it never relies on color alone. Link text says where it goes; avoid "click here".
- **Do:** use links for navigation, even when they look like buttons elsewhere. **Don't:** open internal pages in new tabs.
- **Figma:** *Link* · Variant = Default / Quiet / External × State = Default / Hover / Active / Focus (12).

## Status pill

**Purpose:** a short, non-interactive status label such as "Approved", "Proof due", "Ending soon" or "Outbid". SPEC calls it badge/status pill.

- **Classes:** `.pill`; tones `--success`, `--warning`, `--danger`; neutral has no modifier. Optional leading icon (sized sm automatically).
- **States:** default only. Hover, focus, active and disabled are N/A: it isn't interactive. Loading and empty are N/A. Error: use `--danger`.
- **Accessibility:** the word carries the meaning; color and icon only support it. Icons inside are decorative.
- **Do:** keep it to one or two words. **Don't:** make pills clickable; use a button or link.
- **Figma:** *Pill* · Tone = Neutral / Success / Warning / Danger × Icon = On / Off (8), with the icon as an instance swap.

## Banner

**Purpose:** a message about the whole page or event that stays until the situation changes.

- **Classes:** `.banner` with `__body`, `__title`, `__text`, `__action`, and a leading icon. Tones: `--phase` (butter; where the event is: "Bidding is open"), `--info` (neutral: `--color-surface-muted` fill with an accent icon; also the default fill), `--success` (teal-soft fill), `--warning`, `--danger`.
- **States:** default. Hover, focus, active, disabled and loading are N/A on the banner itself; its action button has its own states. **Error** is `--danger`. Empty: N/A (no banner is shown).
- **Accessibility:** the phase banner and banners that appear after page load use `role="status"`. A danger banner that appears after a failed submit uses `role="alert"`, or focus moves to it, and it links to the field to fix. Icons are decorative.
- **Do:** say what happened and what to do next. **Don't:** use a banner for a passing confirmation (use a toast); don't stack more than two.
- **Figma:** *Banner* · Tone = Phase / Info / Success / Warning / Danger × Action = On / Off (10), with the icon as an instance swap and the action as a nested *Button* (Size = Small).

## Toast

**Purpose:** a brief confirmation that something just happened ("Bid placed").

- **Code:** `showToast(message, { tone, duration })` in `src/components/toast.ts`. It creates one `.toast-region` (`role="status"`, `aria-live="polite"`) at the bottom of the screen, above everything (`--layer-toast`).
- **Classes:** `.toast`; tones `--neutral`, `--success`, `--danger`; `__message`, `__dismiss`. `.toast--static` shows one in place, for the gallery only.
- **States:** default; it enters with a short rise that is instant under reduced motion. Hover and focus **pause** the timer (6 seconds by default), and it resumes when the pointer and focus leave. The dismiss button has the quiet button's states. Disabled, loading and empty: N/A. Error: `--danger` ("Couldn't save…"), but an error that needs action goes in a banner.
- **Accessibility:** announced politely without moving focus. Always dismissible. Never the only place important information appears.
- **Do:** keep it under one line where possible. **Don't:** put the only way to undo something in a toast.
- **Figma:** *Toast* · Tone = Neutral / Success / Danger (3). The dismiss control is a nested *Icon button* (Quiet, Small).

## Card

**Purpose:** a contained group of content: an item, an event, a summary.

- **Classes:** `.card` with optional `__media`, `__header` > `__title`, `__body`, `__footer`. Modifiers: `--flat` (no shadow, for cards on other surfaces) and `--link` (the whole card opens the title's link).
- **States:** default. For `--link`: hover (deeper shadow, stronger border, underlined title); focus (ring around the whole card when its title link is focused); active (shadow settles). Disabled: N/A (don't link to something unavailable; show a status pill instead). Loading: N/A for now; skeletons come with the item tile in stage C. Empty: use the empty state inside the list, not an empty card. Error: N/A.
- **Accessibility:** the title is a heading at the right level. In `--link` cards the title's `<a>` is the only tab stop, and its `::after` stretches over the card, so other content in the card shouldn't be interactive.
- **Do:** keep footers to status and one figure. **Don't:** nest cards; don't put buttons inside a linked card.
- **Figma:** *Card* · Style = Raised / Flat × Media = On / Off (4). **Split:** *Linked card* (`--link`) · Style × Media × State = Default / Hover / Focus / Active (16). One combined matrix would be 32, and states only apply to linked cards.

## Empty state

**Purpose:** what a list or page shows when there's nothing in it yet.

- **Classes:** `.empty` with `__icon`, `__title`, `__text`, `__actions`.
- **States:** this *is* the empty state of other components. Default only; its action button has its own states. Hover, focus, active, disabled, loading and error: N/A. An error loading the list uses a danger banner instead.
- **Accessibility:** the title is a heading at the right level for the page. The icon is decorative.
- **Do:** say what's missing, why, and the next step, with one action if there is one. **Don't:** blame the person ("You haven't…") or leave it blank.
- **Figma:** *Empty state* · Action = On / Off (2), with the icon as an instance swap and the action as a nested *Button*.

## Avatar

**Purpose:** a person's initials on a token-colored circle. The current high bidder wears the crown (SPEC §5).

- **Classes:** `.avatar`, `--sm` (bid history), md default (header), `--lg` (profile menu); `.avatar__crown` (inline SVG with `__crown-shape` and `__crown-band`).
- **States:** default, and *crowned* (top bidder). Hover, focus and active: N/A (avatars sit inside buttons or rows that have their own states, such as the profile menu button in stage C). Disabled, loading, error and empty: N/A; with no name, show no avatar.
- **Accessibility:** `aria-hidden="true"`, because it always sits next to the person's name. The name carries "(top bidder)" as visually hidden text. The crown edge passes 3:1 against the avatar and the page in both modes (BUILD-LOG, stage A part 1).
- **Do:** show the crown everywhere that person's avatar appears in the item's bid history. **Don't:** use the crown for anything but the current high bid.
- **Figma:** *Avatar* · Size = Small / Medium / Large × Crown = On / Off (6).

---

## Forms (stage B)

How forms behave, for every component below:
- **Native controls and built-in checks.** `required`, `maxlength`, `pattern` and `accept` sit on the controls. `src/components/forms.ts` (`enhanceForm`) turns off the browser's bubbles (`novalidate`), reads the browser's own validity, and shows our messages inline.
- **When messages appear.** Only on submit. After that, a field that's showing a message re-checks as it's edited: the message updates and clears when fixed. New messages never appear on blur, because that shifts the layout under the pointer (the submit button moved mid-click when we tried it).
- **Error summary.** A submit with problems puts an error summary at the top of the form, moves focus to it, and links each problem to its field.
- **Messages** are short instructions written from the field's in-sentence name (`data-message-name="a starting bid"` → "Enter a starting bid."). Amounts in messages come from the field's settings (`data-min`), never fixed text (SPEC §7.4).
- **Money** is whole dollars only, everywhere (SPEC §7.9).

## Form field

**Purpose:** one question: label, optional help, the control, then a message.

- **Markup:** `.field` (a `<div>`, or a `<fieldset>` for a radio group) > `.field__label` (`<label for>` or `<legend>`), `.field__help` (linked with `aria-describedby`), the control, `.field__message`. `.field-row` puts short fields side by side and wraps them on small screens.
- **Optional fields** say `<span class="field__optional">(optional)</span>` in the label. Required fields aren't marked: there are no asterisks.
- **Variants:** `.field--error` with `.field__message--error`; `.field--warning` with `.field__message--warning` (something worth knowing that still lets you submit, such as a proof amount below the winning bid).
- **States:** default; hover and focus are on the control; **disabled**: the control is disabled and the label keeps full contrast; **error**: danger border on the control (`aria-invalid="true"`) and a message with an alert icon, linked with `aria-describedby`; loading: N/A (the submit button shows it); empty: an empty optional field is fine, and an empty required field is an error on submit.
- **Accessibility:** every control has a visible label. Messages are linked with `aria-describedby`, and the message's icon is decorative.
- **Do:** write labels as short nouns ("Starting bid") and help as one sentence. **Don't:** use placeholder text as the label; don't mark required fields.
- **Figma:** *Field* · State = Default / Error / Warning / Disabled × Help = On / Off × Optional = On / Off (16). The control is a nested instance (*Input*, *Money input*, *Select* …).

## Text input and textarea

**Purpose:** free text: title, description, notes.

- **Classes:** `.input` on `<input>` and `<textarea>`. `.input--short` caps the width for short values.
- **States:** default; hover (darker border); focus (ring and accent border); active: N/A (focus covers it); disabled (muted fill, disabled text); **read-only** (muted fill, normal text) for values that can't change, such as a locked sale type (SPEC §7.3); error (`aria-invalid`, danger border); loading and empty: N/A (an empty input is just empty, and help says what to enter).
- **Accessibility:** 44px minimum height. Long values scroll inside the box; that's expected and allowed by the reflow check.
- **Do:** set `maxlength` where a limit exists so the message can name it. **Don't:** turn off resizing on textareas.
- **Figma:** *Input* · Type = Text / Textarea × State = Default / Hover / Focus / Disabled / Read-only / Error (12). `.input--short` isn't a variant: set a fixed width on the instance.

## Money input

**Purpose:** whole-dollar amounts: starting bid, price, bid, and proof amount (SPEC §7.9).

- **Markup:** `.input-group` > `.input-group__affix` "$" (`aria-hidden`) + `<input class="input input--money" type="text" inputmode="numeric" pattern="[0-9]+" autocomplete="off" data-money data-min="…">`. Never `type="number"`, which allows decimals, "e" notation and scroll-wheel changes.
- **Rules:** digits only. Cents or symbols (`12.50`, `$20`, `1,000`) show "Whole dollars only." Below `data-min` shows "Enter at least $10." with the amount taken from the attribute, which comes from event settings. Stored as cents with `dollarsToCents()`, always a multiple of 100.
- **States:** as text input, plus **warning**: amber border and message ("That's less than your $60 winning bid. You can still submit; an admin will review it.").
- **Accessibility:** the "$" is visual only; the label and help say it's dollars. The numeric keyboard appears on phones.
- **Do:** put the minimum in the help text, computed from settings. **Don't:** accept or display cents anywhere.
- **Figma:** *Money input* · State = Default / Hover / Focus / Disabled / Error / Warning (6).

## Select

**Purpose:** choosing one of a known list (time zone, viewing as).

- **Markup:** `.select` > `<select class="input">` + the `chevron-down` icon. It's the native control, so the keyboard and the phone picker work as usual.
- **States:** default, hover, focus, disabled and error as text input. When nothing is chosen yet, the first option is a prompt ("Choose a time zone") with `value=""`. Loading: N/A. Empty: N/A (a select always has options).
- **Do:** use radio cards instead when there are two or three options that need explaining. **Don't:** build a custom listbox.
- **Figma:** *Select* · State = Default / Hover / Focus / Disabled / Error (5), with the chevron as a nested *Icon / chevron-down*.

## Date-time input

**Purpose:** an event date and time, entered in the event's time zone (SPEC §7.1).

- **Markup:** `.input-group` > `<input class="input" type="datetime-local">` + `.input-group__affix` with the zone abbreviation ("ET"). Help names the zone in full. Converting to and from UTC comes with event settings (Milestone 6).
- **States:** as text input. Error for an incomplete value: "Enter a complete date and time."
- **Accessibility:** native, so each part (month, day, year, time) works with the keyboard and announces itself.
- **Do:** always show the zone. **Don't:** show a time without saying which zone it's in.
- **Figma:** *Date-time input* · State = Default / Focus / Disabled / Error (4), with the zone suffix as a text property.

## Radio card

**Purpose:** a choice between a few big options, each with a title and a line on when to choose it: the submit form's sale type (SPEC §7.2).

- **Markup:** `<fieldset class="field">` + `<legend class="field__label">` > `.radio-cards` > `<label class="radio-card">` with `<input class="radio-card__input" type="radio">`, `.radio-card__title` and `.radio-card__text`.
- **States:** default; hover (accent border); **checked** (accent border, accent-soft fill); active (deeper fill); focus (ring around the card); disabled (muted, `cursor: not-allowed`); error (danger borders and a message under the group: "Choose a sale type."); loading and empty: N/A.
- **Gating:** `enableWhenChosen(form, name, fieldset)` keeps the rest of a form in a `<fieldset disabled>` until an option is chosen.
- **Accessibility:** native radios: Tab reaches the group, arrow keys move and select, and the legend names the group. The space between the legend and the cards is wider than the focus ring, so the ring never covers the question.
- **Do:** keep to 2–4 options, each with a "when to choose it" line. **Don't:** use radio cards for long lists (use a select).
- **Figma:** *Radio card* · Checked = On / Off × State = Default / Hover / Active / Focus / Disabled / Error (12). The pair is laid out with auto layout, not as a variant.

## Photo uploader

**Purpose:** add 1–5 photos (JPEG, PNG or WebP, up to 4 MB each), put them in order, and pick the cover (first) (SPEC §7.2, §4).

- **Markup:** `.field` > `.field__label` + `.uploader[data-uploader][data-required][data-max-mb]` with:
  - `.uploader__add`: a visually hidden `<input type="file" class="uploader__input">`, its `<label class="btn">` as the visible button, `.uploader__count` and help
  - `.uploader__list` of `.uploader__item`: thumbnail, a "Cover" pill on the first, and a control row underneath with move-left, move-right and remove buttons. Each control is a full `--size-target` (44px) icon button, and each item is as wide as that row, so photos wrap to fewer per row on narrow screens
  - `.uploader__problems`
  - a visually hidden `.uploader__status` live region
  - Behavior: `createUploader(root)` in `src/components/uploader.ts`.
- **States:**
  - Default/empty (dashed box, "0 of 5 photos"), and with photos.
  - Hover, active and focus come from the buttons; the file input's focus shows on its label button.
  - Disabled: the edge arrows use `aria-disabled` (so focus can stay on them).
  - **Full** (`.uploader--full`): the add button looks inactive but stays focusable, and pressing it explains why ("Remove one to add another").
  - **Loading**: `.uploader__item--uploading` dims the thumbnail with "Uploading…". It's wired to storage in Milestone 5.
  - **Error**: "Add at least one photo." on submit, plus a message per bad file that names it ("“scan.gif” isn't a JPEG, PNG or WebP image.", "“cabin.png” is larger than 4 MB.", "You can add up to 5 photos. 1 photo wasn't added.").
- **Accessibility:**
  - No dragging (SPEC §6).
  - Each thumbnail's alt gives its position: "Photo 1 of 3 (cover): starter.jpg".
  - After a move, focus stays on the same button of the photo that moved, or on the other arrow at an end. After a remove, focus goes to the next photo's remove button, or to the add button.
  - Every change is announced ("Moved to photo 2 of 3.", "Photo removed. 2 of 5.").
- **Do:** say the limits in the help text. **Don't:** hide a problem in a toast; problems stay until the next pick.
- **Figma:** split in two. *Photo uploader* · State = Empty / With photos / Error / Full (4), with thumbnails as nested instances. *Photo thumbnail* · Position = Cover / Middle / Last / Only × Uploading = On / Off (8). Cover shows the pill and an inactive left arrow, Last an inactive right arrow, and Only (a single photo) both. The arrows and remove are nested *Icon button*s (Secondary, Medium: 44px).

## Error summary

**Purpose:** after a submit with problems, one place that lists them all and gets you to each.

- **Markup:** `.banner.banner--danger.error-summary` (`role="alert"`, `tabindex="-1"`) with a title ("2 fields need attention") and `.error-summary__list` of links ("Starting bid: Whole dollars only."). Built by `enhanceForm`; it's removed once everything is fixed.
- **States:** default (it only exists when there are errors); focus (ring, since it takes focus on submit); links have link states. Hover, active, disabled, loading and empty: N/A.
- **Accessibility:** focus moves to it, so screen readers read it right away. Each link moves focus to its field.
- **Do:** keep messages identical to the ones under the fields. **Don't:** show it before the first submit.
- **Figma:** *Error summary* · no variants: a *Banner* (Tone = Danger) with a list of links in place of the text.

---

## Page structure (stage C1)

## Skip link

**Purpose:** lets keyboard users jump past the header to the page's content.

- **Markup:** `<a class="skip-link" href="#main">Skip to main content</a>` as the first element in `<body>`; `<main id="main" tabindex="-1">`.
- **States:** hidden until focused; **focus** shows it over the top-left corner with the focus ring. Hover and active: it's only visible while focused. Disabled, loading, error and empty: N/A.
- **Accessibility:** it's the first tab stop on every page. `tabindex="-1"` on `<main>` lets focus land there in every browser.
- **Do:** keep the wording exactly "Skip to main content". **Don't:** hide it with `display: none` (it must stay focusable).
- **Figma:** *Skip link* · no variants (show it in the Focus state).

## Site header and nav

**Purpose:** the org mark and name, the main nav (Home, Silent Auction, Instant Sale, Your Items, and Submit an Item during the submission window only), and the person (SPEC §8).

- **Markup:** `<header class="site-header">` > `.site-header__inner` with:
  - `.site-header__brand`: `.site-header__mark` (org mark, `alt=""`) and `.site-header__name`
  - `<nav class="site-header__nav" aria-label="Main">`: `.site-header__menu-button` and `ul.site-header__links` of `a.site-header__link`
  - `.site-header__end`: a profile menu or an avatar
  - Behavior: `enhanceSiteHeader()` in `src/components/disclosure.ts`.
- **Collapsing:** the header is a size container. Below `--breakpoint-lg` (64rem) **of its own width**, the links collapse behind a **Menu** button (a disclosure). They open as a panel under the header, and Escape or a click outside closes it. The full nav needs about 52rem, and 64rem is the next named breakpoint (DECISIONS #57). Without JavaScript the links simply show, wrapped.
- **Mark:** in light mode no backing; in dark mode it sits on the art's own white (`--color-mark-backing`, #39).
- **States (links):** default; hover (muted fill); active (deeper fill); focus (ring); **current page** (`aria-current="page"`: accent text and a bar, so it isn't shown by color alone; the bar is under the link when expanded and beside it in the collapsed panel). Disabled: N/A (a link that doesn't apply is left out, like Submit an Item outside the window). Loading, error and empty: N/A.
- **States (Menu button):** the quiet button's states, plus open: `aria-expanded="true"` and the icon changes to `close`. Its accessible name stays "Menu".
- **Accessibility:** one `<nav aria-label="Main">`. Every link and button is 44px tall. Focus stays on the Menu button when the panel opens, and Tab moves into the links.
- **Do:** keep link labels exactly as SPEC names them. **Don't:** add admin links here; they live in the profile menu.
- **Figma:** *Site header* · Layout = Expanded / Collapsed × Role = Admin / Employee (4), with the collapsed panel shown as *Site header* · Layout = Collapsed, Menu = Open. *Nav link* · State = Default / Hover / Active / Focus / Current (5).

## Profile menu

**Purpose:** the person in the top right. For admins, a button (avatar and chevron) opens a short list of links: the Admin Dashboard (SPEC §8). Employees see their avatar only.

- **Markup:** `.profile-menu` > `button.profile-menu__button` (avatar, visually hidden "Maya Okafor, admin", `chevron-down`) and `.profile-menu__panel` (`hidden` when closed) with `.profile-menu__who` and `ul.profile-menu__links`. Employees: `.profile-menu__static` with the avatar and visually hidden "Signed in as Jules Ferreira".
- **Pattern:** a **disclosure**, not `role="menu"`. It's navigation, so Tab moves through the links and there are no arrow-key menu rules. `aria-expanded` on the button and `aria-controls` point at the panel.
- **States:**
  - Default, hover, active and focus (ring).
  - **Open:** `aria-expanded="true"`, a border on the button, and the chevron flips.
  - **Closing:** Escape closes it and returns focus to the button. A click outside closes it, and focus goes back to the button unless the click landed on another control. Tabbing out closes it.
  - Disabled, loading, error and empty: N/A.
- **Accessibility:** the button's name is the person's name and role. The avatar is `aria-hidden`.
- **Do:** keep the panel to a few links. **Don't:** put actions with side effects here without a confirmation.
- **Figma:** *Profile menu* · Role = Admin / Employee × State = Default / Hover / Focus / Open (8; Employee uses Default only).

## Page header

**Purpose:** the top of each page: an optional back link, the page's h1, an optional description and actions.

- **Markup:** `.page-header` > `a.link.link--quiet.page-header__back` (`chevron-left` + the parent page's name), `.page-header__row` > `.page-header__text` (`h1.page-header__title`, `p.page-header__description`) and `.page-header__actions`.
- **States:** default. The back link and actions have their own states. Hover, focus, active, disabled, loading, error and empty: N/A.
- **Accessibility:** exactly one h1 per page, here. The back link is 44px tall and names where it goes.
- **Do:** keep at most one primary action. **Don't:** repeat the nav here.
- **Figma:** *Page header* · Back = On / Off × Description = On / Off × Actions = On / Off (8).

## Demo bar

**Purpose:** the demo's own controls (SPEC §3.1): **Viewing as**, **Jump to** and **Restore demo data**.

- **Markup:** `<section class="demo-bar" aria-label="Demo controls" data-demo-bar="page">` > `details.demo-bar__details` > `summary.demo-bar__summary` (a "Demo" tag, `.demo-bar__who` and a chevron) and `.demo-bar__controls`:
  - a *Select* field for Viewing as
  - a `fieldset.demo-bar__jump` of four buttons with `aria-pressed`
  - the Restore button (`data-demo-restore`)
  - a visually hidden `role="status"` for announcements
  - Behavior: `enhanceDemoBar()` in `src/components/demo-bar.ts`.
- **Placement:** the first thing on the page, right after the (invisible) skip link in the DOM, so the skip link stays the first tab stop. It's in the normal flow and never overlays content. Inverse colors and a striped top edge set it apart from the app.
- **States:**
  - **Open** and **collapsed** (`<details>`); the collapsed state is remembered in `localStorage`.
  - The current phase shows as **pressed** (filled, `aria-pressed="true"`).
  - Focus rings switch to the on-inverse color on the bar.
  - Hidden entirely with `?demo=off`; gallery specimens (`data-demo-bar="specimen"`) never hide.
  - Loading: it will use the buttons' loading state once it talks to the API (Milestone 3). Disabled, error and empty: N/A.
- **Accessibility:** a region named "Demo controls". Changing who you're viewing as is announced ("Now viewing as Dev Kapoor (employee)"). Moving the phase is announced too. All controls are 44px.
- **Do:** keep it visually distinct from the app. **Don't:** make it sticky or overlay content.
- **Figma:** *Demo bar* · State = Open / Collapsed (2); the jump buttons are *Button* (Secondary), with the pressed look drawn as an override.

## Hero lockup

**Purpose:** the event's name on Home (DECISIONS #47).

- **Markup:** `<div class="lockup lockup--card" role="img" aria-label="Kestrel Gives">` > `img.lockup__mark` (`alt=""`) and `.lockup__words` > `.lockup__kestrel` + `.lockup__gives`. On Home it sits inside the page's h1.
- **Tokens:** `--type-hero` and `--tracking-lockup` for the words; `--size-lockup-mark` scales the mark with them; the brand teal and coral on `--color-mark-tile`.
- **States:** default only (it isn't interactive). Every other state is N/A.
- **Accessibility:** one name, "Kestrel Gives", instead of the mark and two separate words.
- **Do:** use the card in both modes (the mark's file is white). **Don't:** recolor, redraw or crop the mark beyond whitespace (logo rule, #39).
- **Figma:** *Hero lockup* · no variants.

---

## Overlays and data (stage C2)

## Dialog

**Purpose:** asks for a yes or no before something that matters: placing a bid, restoring the demo data, cancelling an item, or the yearly reset (SPEC §7.8).

- **Markup:** a native `<dialog class="dialog dialog--confirm|--danger|--type-to-confirm">` opened with `showModal()`, with `aria-labelledby` (the title) and `aria-describedby` (the body). Inside: `form.dialog__form` > `h2.dialog__title`, `.dialog__body` (text, or for a bid an item summary `.dialog__item` with `.dialog__item-thumb` and `.dialog__item-title`, plus `.dialog__amount`), an optional *Form field* for type-to-confirm, `.dialog__error` (`role="alert"`) and `.dialog__actions` (dismiss, then confirm). Behavior: `confirmDialog()` in `src/components/dialog.ts` resolves `true` once the request succeeds and `false` if dismissed. `.dialog--static` draws a closed dialog in the flow, for the gallery only.
- **Variants:**
  - **Confirm:** says exactly what you're agreeing to, with every amount computed from the data ("Place a $65 bid?"). First focus: the confirm button.
  - **Danger:** a destructive action; the confirm button is a *Button* (Danger). First focus: the dismiss button, so Enter never destroys anything by accident. The dismiss button says "Cancel", or "Keep item" next to "Cancel item".
  - **Type-to-confirm:** the danger variant plus a text field; the confirm button stays inactive (`aria-disabled`) until the event name is typed exactly. First focus: the field.
- **States:**
  - Open: enters with a short rise and fade (instant under reduced motion); the page behind is inert under a backdrop.
  - **Loading:** `aria-busy` on the dialog, the confirm button shows its loading label ("Placing bid…"), the dismiss button is `aria-disabled`, and Escape is ignored until the request finishes.
  - **Error:** the request's plain message shows in `.dialog__error`, and the dialog stays open so you can try again or cancel.
  - Hover, focus and active belong to its buttons. Disabled: only the type-to-confirm button, as above. Empty: N/A.
- **Accessibility:** native modal, so focus moves in and stays in. Escape closes it (except while loading) and focus returns to the control that opened it. The title names the action; the body says what happens and whether it can be undone.
- **Do:** name the action on the confirm button ("Place bid", not "OK"). **Don't:** use a dialog for information that needs no decision (use a toast or banner).
- **Figma:** *Dialog* · Variant = Confirm / Danger / Type-to-confirm × State = Default / Loading / Error (9). The body is a slot; the buttons are nested *Button* instances.

## Item tile

**Purpose:** one item in a browse grid (Silent Auction, Instant Sale) and in Your Items (SPEC §8).

- **Markup:** `ul.item-grid` (wraps at `--size-tile-min`, no breakpoints) of `li` > `.card.card--link.item-tile` with `.card__media` (photo, and the status pill `.pill.item-tile__status` over it), `h3` > the title link, `.item-tile__amount` and `.item-tile__detail`. Built by `renderItemTile()` in `src/components/item-tile.ts`.
- **Words come from data:** `tileText()` in `src/components/item-tile-rules.ts` computes the amount line and the one status from the item, the viewer and the phase; nothing on a tile is typed in. Unit tests: `tests/unit/item-tile-rules.test.ts`.
  - Silent auction: "Starts at $40 / No bids yet", "Top bid $240 / 6 bids"; after close "Winning bid $310 / 9 bids" or "Starting bid $40 / No bids".
  - Instant sale: "$20 / 2 left"; "12 available" during submissions; "None left".
- **Status (one, most important first):** Cancelled (danger) › after close: You won (success), Ended, Sold out › during submissions: "Opens Nov 17" › live silent auction: You're winning (success), Outbid (danger) › live instant sale: Sold out, "2 left" (warning, at 3 or fewer) › Ending soon (warning, within 24 hours of close). No status if none applies. The low-stock and ending-soon thresholds are provisional (DECISIONS #61).
- **States:** the card link's default, hover (lift), active and focus (ring). **Muted** (`.item-tile--muted`, ended and cancelled): the photo fades and the amount turns muted; the pill keeps full contrast. **Cancelled** appears only in Your Items, never in browse grids. Disabled: N/A (a tile always opens its item). Loading: Milestone 3 decides whether grids need skeletons. Empty: the grid's *Empty state*, not the tile. Error: N/A.
- **Accessibility:** the whole tile is one link, named by the title with the status appended as visually hidden text ("Sourdough starter and a loaf a month, Outbid"); the pill itself is `aria-hidden` so it isn't read twice. Status isn't shown by color alone: the pill has words.
- **Do:** keep titles to two lines in the design; long ones wrap. **Don't:** show more than one status, or put buttons inside the tile.
- **Figma:** *Item tile* · Type = Auction / Instant × Phase = Submission / Live / Ended (6), with Status as a nested *Status pill* instance (or hidden) and Muted as a boolean. The text is overridden per example.

## Photo carousel

**Purpose:** an item's 1–5 photos on its page, one at a time.

- **Markup:** `<section class="carousel" aria-label="Photos of …" data-carousel>` > `.carousel__stage` (4:3) with `figure.carousel__slide`s (all but one `hidden`), `button.carousel__nav.carousel__nav--prev` and `--next` (round icon buttons over the photo), and `p.carousel__count` ("Photo 2 of 5", `aria-live="polite"`); then `ul.carousel__thumbs` of `button.carousel__thumb` (named "Photo 2 of 5", the current one `aria-current="true"`). Behavior: `enhanceCarousel()` in `src/components/carousel.ts`. With one photo, `.carousel--single` hides the arrows and thumbnails.
- **States:** arrows and thumbnails have hover, active and focus (ring). **Current** thumbnail: a strong border and `aria-current`. At either end the arrow is **inactive** (`aria-disabled="true"`, faded) but stays focusable, so focus never vanishes. Loading: Milestone 5 decides (real photos replace the placeholders then); no spinner. Error and empty: N/A (an item always has at least one photo, SPEC §7).
- **Accessibility:** no autoplay and no swipe-only control. Every change is announced through the count. Arrows and thumbnails are 44px tall. Each photo has alt text from the submitter's title ("Photo 2 of 5" until real photos land).
- **Do:** keep the cover photo first. **Don't:** add autoplay or arrow-key shortcuts on the page.
- **Figma:** *Photo carousel* · Photos = Single / Multiple × Position = First / Middle / Last (4; Single has no position). *Carousel thumbnail* · State = Default / Hover / Focus / Current (4).

## Table

**Purpose:** rows of records for admins: people, items, proofs waiting for review.

- **Markup:** `<div class="table-wrap" role="region" aria-labelledby="(caption id)" data-table-scroll>` > `table.table` with a `caption`, `th scope="col"` headers, `th scope="row"` for each row's name, `.table__num` on number columns (right-aligned, tabular figures), and `.table__actions` in the last column (its header is visually hidden "Actions"). An empty table has one row: `td.table__empty` spanning every column. Behavior: `enhanceTableScroll()` in `src/components/table.ts`.
- **Narrow screens:** the table keeps its columns and scrolls inside `.table-wrap` (WCAG's exception for two-dimensional content). The region joins the tab order (`tabindex="0"`) only while it actually scrolls, so keyboard users can scroll it with the arrow keys. The wrap is positioned so visually hidden text inside it can't widen the page.
- **States:** rows have a hover fill. Row actions are *Button* Small (`--size-target-sm`, allowed in dense rows by SPEC §6) with the row's name in their label (visible "View bids", read as "View bids by Maya Okafor"). **Empty:** the message row, and the headers wrap so the message stays in view. Loading and error: Milestone 3 (an error uses a danger banner above the table). Disabled: N/A.
- **Accessibility:** the caption names the table and the region. Column and row headers are real `th` elements. No sorting until a screen needs it.
- **Do:** keep row actions to one or two. **Don't:** hide columns on small screens; scroll instead.
- **Figma:** *Table* · Rows = Filled / Empty (2), built from *Table row* · Kind = Header / Body × State = Default / Hover (3; Header has Default only) and *Table cell* · Align = Start / End × Content = Text / Actions (4).
