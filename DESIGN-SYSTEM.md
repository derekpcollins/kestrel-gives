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
- **Describe the demo accurately.** It's shared by everyone and resets to the live phase once a day (SPEC §3.1, v1.11); anyone can start over sooner with **Restore demo data** in the top bar, which resets it for everyone.
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
- **Variables** mirror `public/styles/tokens.css` (the source of truth) with matching names, `color/accent` ↔ `--color-accent`. As of Milestone 3 the library has **103**, including `color/banner-calm`, `color/banner-calm-border`, `color/on-banner-calm`, `size/charity-logo` and `size/step-number`.

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

- **Classes:** `.banner` with `__body`, `__title`, `__text`, `__action`, and a leading icon. Tones: `--phase` (where the event is: "Bidding is open"; butter in light mode, and in dark mode a dark butter-tinted surface with a butter border and light text, from `--color-banner-calm*`), `--phase --urgent` ("Bidding ends soon": the bright butter, `--color-banner`, in both modes so urgency stands out), `--info` (neutral: `--color-surface-muted` fill with an accent icon; also the default fill), `--success` (teal-soft fill), `--warning`, `--danger`.
- **States:** default. Hover, focus, active, disabled and loading are N/A on the banner itself; its action button has its own states. **Error** is `--danger`. Empty: N/A (no banner is shown).
- **Accessibility:** the phase banner and banners that appear after page load use `role="status"`. A danger banner that appears after a failed submit uses `role="alert"`, or focus moves to it, and it links to the field to fix. Icons are decorative.
- **Do:** say what happened and what to do next. **Don't:** use a banner for a passing confirmation (use a toast); don't stack more than two.
- **Figma:** *Banner* · Tone = Phase / Phase urgent / Info / Success / Warning / Danger × Action = On / Off (12), with the icon as an instance swap and the action as a nested *Button* (Size = Medium: 44px, SPEC §6).

## Toast

**Purpose:** a brief confirmation that something just happened ("Bid placed").

- **Code:** `showToast(message, { tone, duration, announce })` in `src/components/toast.ts`. `flashToast(message)` saves one for the next page this tab opens (after a save moves you to the item), and `showFlash()` shows it once. It creates one `.toast-region` at the bottom of the screen, above everything (`--layer-toast`), holding two `.toast-region__stack`s: `--live` (`role="status"`, `aria-live="polite"`) and `--quiet`. `announce: false` puts the toast in the quiet stack, for a page that announces the same words through its own live region (the item page's bid and buy results, DECISIONS #88), so they're read once.
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

## Loading

**Purpose:** say that content is on its way, at once, wherever a page waits on the server (a cold database can take seconds). DECISIONS #119.

- **Markup:** `p.loading[role="status"][data-page-loading]` with `span.loading__spinner` (`aria-hidden`) and a short line that names what's coming ("Loading items…", "Loading your items…", "Loading the dashboard…"). It's **in the page's HTML**, where the content will go, so it shows at first paint before any script runs. Code: `pageLoading(on)` and `fetchWithTimeout()` in `src/components/loading.ts`.
- **States:** shown until the page has drawn its content, an empty state, a refusal or an error; shown again while Try again runs. Later redraws (the demo bar, a refresh) keep the current content with `aria-busy` instead. The spinner is the button's and stands still under reduced motion; the words still say it's working. Hover, focus, active, disabled, error and empty: N/A.
- **Timeout and errors:** reads give up after **10 seconds** (`LOAD_TIMEOUT_MS`) and end in the page's *Empty state* error ("We couldn't load the items", Check your connection and try again, **Try again**). If the app state itself fails or times out, the shell's danger *Banner* says "The demo couldn't load" with **Try again**, and the page's loading line goes. Writes (a bid, a save) are never cut off: one that may have happened mustn't be reported as failed.
- **Accessibility:** `role="status"`, so it's announced politely; the content region keeps `aria-busy` while it waits. After a successful Try again in the shell banner, focus goes to `main`.
- **Do:** name what's loading. **Don't:** use skeletons that imitate content, or leave a region empty while waiting.
- **Figma:** *Loading* (one variant), built from the button's spinner and caption text.

## Empty state

**Purpose:** what a list or page shows when there's nothing in it yet.

- **Classes:** `.empty` with `__icon`, `__title`, `__text`, `__actions`.
- **States:** this *is* the empty state of other components. Default only; its action button has its own states. Hover, focus, active, disabled, loading and error: N/A. An error loading the list uses a danger banner instead.
- **Accessibility:** the title is a heading at the right level for the page. The icon is decorative.
- **Do:** say what's missing, why, and the next step, with one action if there is one. **Don't:** blame the person ("You haven't…") or leave it blank.
- **Figma:** *Empty state* · Action = On / Off (2), with the icon as an instance swap and the action as a nested *Button*.

## Avatar

**Purpose:** a person's initials on a token-colored circle. The current high bidder wears the crown (SPEC §5).

- **Classes:** `.avatar`, `--sm` (bid history), md default (header), `--lg` (profile menu); `.avatar__crown` (inline SVG with `__crown-shape` and `__crown-band`). Built by `renderAvatar()` in `src/components/avatar.ts`.
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
- **Variants:** `.field--error` with `.field__message--error`; `.field--warning` with `.field__message--warning` (something worth knowing that still lets you submit, such as a proof amount below the person's donation total).
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
- **States:** as text input, plus **warning**: amber border and message ("That's less than your $345 donation total. You can still submit; an admin will review it.").
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
- **States:** default; hover (accent border); **checked** (accent border, accent-soft fill); active (deeper fill); focus (ring around the card); disabled (muted, `cursor: not-allowed`); **locked** (on the edit page once an item has activity, only the unchosen cards are disabled, so the chosen card keeps its check mark and border); error (danger borders and a message under the group: "Choose a sale type."); loading and empty: N/A.
- **Gating:** `enableWhenChosen(form, name, fieldset)` keeps the rest of a form in a `<fieldset disabled>` until an option is chosen.
- **Accessibility:** native radios: Tab reaches the group, arrow keys move and select, and the legend names the group. The space between the legend and the cards is wider than the focus ring, so the ring never covers the question.
- **Do:** keep to 2–4 options, each with a "when to choose it" line. **Don't:** use radio cards for long lists (use a select).
- **Figma:** *Radio card* · Checked = On / Off × State = Default / Hover / Active / Focus / Disabled / Error (12). The pair is laid out with auto layout, not as a variant.

## Photo uploader

**Purpose:** add 1–5 photos (JPEG, PNG or WebP, up to 4 MB each), put them in order, and pick the cover (first) (SPEC §7.2, §4).

- **Markup:** `.field` > `.field__label` + `.uploader[data-uploader][data-required][data-max-mb]` (and `data-resize` on the submit page, DECISIONS #93) with:
  - `.uploader__add`: a visually hidden `<input type="file" class="uploader__input">`, its `<label class="btn">` as the visible button, `.uploader__count` and help
  - `.uploader__list` of `.uploader__item`: thumbnail, a "Cover" pill on the first, and a control row underneath with move-left, move-right and remove buttons. Each control is a full `--size-target` (44px) icon button, and each item is as wide as that row, so photos wrap to fewer per row on narrow screens
  - `.uploader__problems`
  - a visually hidden `.uploader__status` live region
  - Behavior: `createUploader(root)` in `src/components/uploader.ts`. With `data-resize`, each picked picture is resized to JPEG (long side 1600px, `src/components/resize.ts`) as it's added, so the 4 MB cap applies to the resized file. `setExisting()` shows an item's current photos on the edit page; they keep their ids and read "current photo" in their alt text.
- **States:**
  - Default/empty (dashed box, "0 of 5 photos"), and with photos.
  - Hover, active and focus come from the buttons; the file input's focus shows on its label button.
  - Disabled: the edge arrows use `aria-disabled` (so focus can stay on them).
  - **Full** (`.uploader--full`): the add button looks inactive but stays focusable, and pressing it explains why ("Remove one to add another").
  - **Loading**: while pictures are resized, the uploader has `aria-busy` and announces "Preparing 2 photos…". Uploads happen when the form is saved, and the submit button shows the progress ("Uploading photo 1 of 2…"). `.uploader__item--uploading` (a dimmed thumbnail with "Uploading…") stays in the gallery for a future per-photo upload.
  - **Error**: "Add at least one photo." on submit, plus a message per bad file that names it ("“scan.gif” isn't a JPEG, PNG or WebP image.", "“cabin.png” is larger than 4 MB.", "You can add up to 5 photos. 1 photo wasn't added.", "“scan.heic”: We couldn't read that picture. Try a JPEG, PNG or WebP.").
- **Accessibility:**
  - No dragging (SPEC §6).
  - Each thumbnail's alt gives its position: "Photo 1 of 3 (cover): starter.jpg".
  - After a move, focus stays on the same button of the photo that moved, or on the other arrow at an end. After a remove, focus goes to the next photo's remove button, or to the add button.
  - Every change is announced ("Moved to photo 2 of 3.", "Photo removed. 2 of 5.").
- **Single file** (`data-max="1"`, the proof page, DECISIONS #103): `data-noun` names the thing ("screenshot"), the input has no `multiple`, and the words drop the counts: "No screenshot yet", "Screenshot added. Remove it to choose a different one.", "Add a screenshot." The one thumbnail reads "Screenshot: receipt.png" and has only a Remove button. Words come from `uploaderWords()` in `src/components/upload-rules.ts`.
- **Do:** say the limits in the help text. **Don't:** hide a problem in a toast; problems stay until the next pick.
- **Figma:** split in two. *Photo uploader* · State = Empty / With photos / Error / Full (4), with thumbnails as nested instances. *Photo thumbnail* · Position = Cover / Middle / Last / Only × Uploading = On / Off (8). Cover shows the pill and an inactive left arrow, Last an inactive right arrow, and Only (a single photo) both. The arrows and remove are nested *Icon button*s (Secondary, Medium: 44px).

## Item form

**Purpose:** Submit an Item (`/submit`) and Edit item (`/items/<id>/edit`), one page (SPEC §7.3, DECISIONS #98). The gallery's "Submit an item (demo)" is the same form.

- **Markup:** `form.item-form` on a raised surface at reading width, holding the sale-type radio cards, then `fieldset#item-rest` (disabled until a type is chosen) with title, description, the type's money fields, and the photo uploader. `.item-form__actions` holds the submit button (and Cancel when editing). Below the form, `.item-form__danger` holds "Delete item" (`.btn--danger`) when deleting is allowed. Behavior: `startSubmitPage()` in `src/pages/submit.ts`; decisions in `src/pages/submit-rules.ts`.
- **States:**
  - Default (submit: "Choose one to fill in the rest." under the sale type question, and the starting bid filled in with the event minimum); edit (filled in, with the item's photos; that help is hidden). The nav marks no link as current on Edit item (DECISIONS #99).
  - **Locked** (edit, the item has bids or purchases): an info banner with "Locked: this item has bids or purchases. You can still change the title, description and photos.", and the starting bid, price, quantity and the *unchosen* sale type disabled and described by it. The chosen sale type card keeps its check mark and border (#99).
  - **Blocked:** an empty state in place of the form: "Submissions are closed. Only admins can add items now.", "Only the person who donated this item, or an admin, can change it.", "This item has been cancelled, so it can't be changed.", "That item doesn't exist."
  - **Loading:** the submit button has `aria-busy` and says "Uploading photo 1 of 2…", then "Submitting…" or "Saving…".
  - **Error:** field problems from the browser *or the server* show under each field with the error summary (`showServerProblems`). Anything else (an upload cap, uploads paused, submissions closed, no connection) shows in `.item-form__alert`, a danger banner at the top of the form (`role="alert"`) that takes focus.
  - **Success:** the page moves to the item with a toast ("Thanks. Your item is in.", "Your changes are saved."), via `flashToast()`.
  - Delete asks first in a danger dialog ("Delete “Pottery class for two”?", **Delete item** / **Keep item**), then goes to Your Items with "Your item is deleted."
- **Accessibility:** one tab stop per control; locked controls stay visible with the reason linked by `aria-describedby`; every message is reachable from the summary or the alert, both of which take focus.
- **Do:** keep the field messages the same as the server's (they come from `item-form-rules.ts`; the starting bid hint and refusal both come from `startingBidHelp`/`startingBidTooLow`). **Don't:** hide locked fields; people should see what's fixed and why.
- **Figma:** *Item form* · Mode = Submit / Edit × Locked = Off / On (3 used; Submit has no lock). Built from *Radio card*, *Form field*, *Photo uploader*, *Banner* and *Button* instances.

## Your Items

**Purpose:** the viewer's personal dashboard (SPEC §8): *My bids*, *Won & purchased* with the proof summary, *My donated items* with Edit, and *Cancelled* (only when something was cancelled). DECISIONS #101.

- **Markup:** `.your-items` > `.your-items__section` (each `aria-labelledby` its `h2.your-items__title`) > `ul.item-grid` of *Item tile*s, or `p.your-items__empty` when the list is empty. On donated items, an Edit button (`.btn--secondary.btn--sm.your-items__edit`, read as "Edit <title>") sits under the tile in the same `li`, outside the linked card, until bidding ends (DECISIONS #102). A warning *Banner* ("Your donation total changed") comes first when the total moved after the latest proof (SPEC §7.6). Behavior: `startYourItemsPage()` in `src/pages/your-items.ts`; words in `src/pages/your-items-rules.ts`.
- **Proof summary:** `.card.card--flat.proof-summary` (`role="group"`, named "Your donation total"): the total in the amount style, then a status pill (Proof due / Pending review / Rejected / Approved) with days left or late, a line on what's next (or the rejection reason), and the upload link ("Donate and upload proof" or "Upload a new proof", to `/your-items/proof`) with "Go to the giving page" before a first proof. Two columns from 40rem.
- **Tiles' words:** bids use the browse tiles' labels (You're winning, Outbid, You won) with "Your bid · High bid $60"; a lost auction says **Didn't win** with "Your bid · Winning bid $240" ("Ended" is for items the viewer had no stake in); won says "Won"; purchases fold into **one tile per item**: "Bought Nov 3" for one, or the price with "Bought 2 · $40 · Last on Nov 3" for repeats (event time zone); donated items say exactly what their browse tile says; cancelled ones say why ("Your bid no longer counts", "Purchase cancelled · Not in your total", "You donated this item"). Lost bids and cancelled items are muted.
- **States:** loading (`aria-busy` on `.your-items`); loaded; each list's empty message ("You haven't bid on anything yet.", "Nothing won or bought yet.", "You haven't donated an item yet."); error (an *Empty state* "We couldn't load your items" with Try again). It redraws when the demo bar changes the person or the phase; only the newest answer is drawn.
- **Accessibility:** one `h2` per section, each section a named region; tiles are one link each with their status in the name; the summary is a named group.
- **Do:** keep one proof summary for everything (one combined proof per person). **Don't:** put a proof status on each won tile.
- **Figma:** *Your Items* page, built from *Item tile*, *Card*, *Pill*, *Banner* and *Button* instances; *Proof summary* · Status = None / Due / Pending / Rejected / Approved (5).

## Proof page

**Purpose:** Upload donation proof at `/your-items/proof` (a rewrite to `proof.html`): one combined proof per person, the amount donated and one screenshot (SPEC §7.6, DECISIONS #95, #103).

- **Markup:** *Page header* (back to Your Items), then `.proof-page` > `.proof-page__notes` (one *Banner* per note) and an *Item form*: `.proof-page__total` ("Your donation total is $35. 6 days left to upload proof." and "Go to the giving page"), the demo warning *Banner* ("This is a demo. Don't upload a real receipt or personal details."), the amount *Form field* (money input, starts at the total), `.proof-page__warning`, and a single-file *Photo uploader*. Behavior: `startProofPage()` in `src/pages/proof.ts`; words in `src/pages/proof-rules.ts`. The nav marks Your Items as current.
- **States:**
  - First proof; **below the total**: a warning line under the amount ("That's less than your $35 donation total. You can still submit; an admin will review it.", `aria-live="polite"`) that never blocks submitting.
  - **Notes above the form:** rejected (danger, "Your last proof was rejected" with "Reason: …"), waiting ("A new upload replaces it."), approved for an older total, and a changed total (warning, first).
  - **Blocked:** an *Empty state* with the server's reason: nothing owed yet (info icon) or proof approved for the current total (check mark, the only place it means done; DECISIONS #104).
  - **Loading:** the body has `aria-busy`; on submit the button says "Uploading screenshot…", then "Sending proof…".
  - **Error:** browser and server field problems under their field with the error summary (amount, or a screenshot the server won't take); anything else in `.item-form__alert`. A failed load shows an *Empty state* with Try again.
  - **Success:** back to Your Items with the toast "Thanks. Your proof is in, and an admin will review it."
- **Accessibility:** the demo warning describes the file input; the amount's warning is linked by `aria-describedby` and announced politely; a retry reuses an upload that worked.
- **Do:** let people submit less than the total (an admin decides). **Don't:** name an item; proof covers the total.
- **Figma:** *Proof page* · State = First / Short / Rejected / Blocked (4), built from *Item form* parts, *Banner*, *Form field* and *Photo uploader* (Single).

## Giving stub

**Purpose:** where "Go to the giving page" lands in the demo (`/giving`, the seeded giving platform URL; SPEC §3). It explains that the real event links out to one donation page whose funds are split equally among the three charities, and that no money moves here.

- **Markup:** *Page header*, an info *Banner* ("This is a stand-in"), *Steps* (check your total, donate once, upload proof), then `.giving__you` (`aria-live="polite"`): the viewer's total ("Your total: $35", `.giving__total`) and an "Upload proof" button to `/your-items/proof`. When the viewer owes nothing, the button is hidden and `.giving__none` says "You don't owe anything yet. Bid or buy to have a total." Last, the three *Charity card*s (filled by `showCharities()`, shared with Home). Behavior: `startGivingPage()` in `src/pages/giving.ts`, from `/api/me`, redrawn when the demo bar changes the person; if it can't load, the total is left out and the button stays. No nav link is current (DECISIONS #104).
- **Don't:** link a charity on its own (no charity choice, SPEC §7.2), or use words about paying in the app.
- **Figma:** *Giving stub* page, built from *Banner*, *Steps*, *Button* and *Charity card*.

## Admin Dashboard

**Purpose:** the admin's sections (SPEC §8): Totals and People in 6B, Proof review in 6C, Items in 6D; Event settings and Email templates in 6E, Reset for next year in 6F. One page, `admin.html`, serves every section URL (`/admin` is Totals, `/admin/people`, `/admin/proofs`, `/admin/items`, `/admin/settings`, `/admin/templates`, `/admin/reset`, by rewrites), and reads its section from the path (DECISIONS #112).

- **Admin section nav:** `nav.admin-nav` (`aria-label="Admin sections"`) > `ul.admin-nav__list` of plain links (`.admin-nav__link`), the current one with `aria-current="page"` and the accent fill. They wrap onto more lines when narrow. Not tabs (DECISIONS entry 59): each section is its own page, so the browser's back button and links work.
- **Total card:** `li.card.card--flat.total-card` in `ul.total-cards` (one column, three from `--breakpoint-sm`), one each for Silent auction, Instant sale and Grand total (`.total-card--grand` has the stronger border). A `dl` holds Pledged (text color) and Confirmed (success color), both in the amount type with tabular figures. A $0 amount, pledged or confirmed, takes `.total-card__amount--zero` (muted text color): green is only for confirmed amounts above $0 (owner, 6B review). Below: the gap line (`.admin-gap`, info icon) and a key (`dl.admin-key`) saying what Pledged and Confirmed mean (DECISIONS #107).
- **Leading bids note:** live only. `section.leading-note`, a dashed muted box *outside* the cards, titled "Leading bids so far, not final until bidding closes", with the amount in plain text color (not the amount style) and a line saying they aren't in the totals (owner, 6A review).
- **People table:** a *Table* labeled by the section heading (no caption, like Bid history). The row header is a small *Avatar*, the name and an "Admin" *Pill* for admins; Bids, Wins, Purchases and Donation total are number columns; Proof is a status *Pill* (Approved success, Waiting for review warning, Rejected danger, Nothing owed neutral) and the amount, "$60 of $65" when it differs from the total. With no proof it follows the phase like Your Items (owner, 6B review): **Not uploaded** neutral before bidding closes, **Not uploaded** warning with the days left after close, and **Late** danger with the days late after the proof deadline. It scrolls inside its region on phones.
- **Proof review card:** `li.card.card--flat.proof-review.proof-review--pending|approved|rejected` (named by its `h3`), in two groups, `section.proof-queue` "Waiting for review (n)" then "Reviewed (n)", under a line counting both and giving the proof deadline. Head: *Avatar*, the name, a status *Pill*; then "Uploaded today at 4:00 PM EST". Body: the screenshot thumbnail (`.proof-review__thumb`, fixed 3:4 box, `object-fit: contain`), and a `dl` of Amount donated and Donation total in the amount style. **Notes** (`.proof-review__note--warning|info`, icon + text) come most important first: short ("$5 short of their $65 donation total. You can still approve it." while waiting; the second sentence drops once reviewed), over, the total changed since upload, uploaded after the deadline. Reviewed cards add "Approved by Maya Okafor today at 3:00 PM EST." and, when rejected, "Reason: …". **View larger** is a disclosure button (`aria-expanded`, `aria-controls`; becomes "View smaller") that shows the full-width screenshot (`figure.proof-review__large`) inside the card, so the admin compares it with the figures without a second dialog. **Actions** (under a divider, regular 44px *Buttons*: cards, not tables): while waiting, Approve (*Button* Primary, one click) and Reject (*Button* Secondary, opens the *Dialog* with a reason); once reviewed, the other decision as a *Button* Secondary: **Reject instead** on an approved proof (the reason *Dialog*, titled "Reject Dev Kapoor's approved proof?", saying the amount leaves the confirmed totals, confirm "Reject instead") or **Approve instead** on a rejected one (one click). Hidden text names the person on every button ("Approve Rosa Delgado's proof", "Approve instead (Owen Achterberg's proof)", visible words first).
  - **After a decision:** the queue redraws from the answer, a success *Toast* confirms, and focus moves to the "Waiting for review" heading (or, after a reversal, to that person's card heading). **Refused** (the total moved, a newer upload, the status changed since the page loaded): the queue reloads and a danger *Banner* (`role="alert"`, focused) at the top says why, ending "The queue has been updated." **Empty:** "Nothing is waiting for review." and, with no proofs at all, "No one has uploaded proof yet."
- **Admin item row:** `li.card.card--flat.admin-item` (named by its `h4`, which links to the item page), in `section.admin-items` groups "Silent auction (n)" then "Instant sale (n)", active items first. A square cover thumbnail, the title with a *Pill* when Cancelled (danger) or Sold out (neutral), the figures in semibold ("Top bid $240 · 6 bids", "Winning bid $310 · 9 bids" after the close, "Starting bid $40 · No bids yet", "$15 each · 3 sold · 7 left"), "Donated by …" and, if cancelled, when. `.admin-item--cancelled` fades the thumbnail and figures. **Actions** (regular *Buttons* Secondary; the red is saved for the dialog): **Show bid history (n bids)**, a disclosure (`aria-expanded`, `aria-controls`; becomes "Hide …") for silent auction items (**Show purchases (n)** for instant sale), and **Cancel item** while not cancelled. Which histories are open is kept across redraws.
  - **Bid history table** (`table.admin-bids`, named "Bid history for … , newest first"): Bidder (*Avatar*, crowned on the top bid; name; a success *Pill* "Top bid", or "Winning bid" after the close), Amount, Time, and a **Remove** *Button* (Secondary, small: it's in a table) on each standing bid of an active item. Removed bids stay, muted with the amount struck through, a "Removed" *Pill* and "Removed by Maya Okafor today at 6:20 PM EST." Below 40rem the Time column hides (the time is a caption under the name, like Bid history), avatars hide (the pill names the leader), and cell padding tightens, so Remove fits at 390px; narrower, the table scrolls in its region.
  - **Purchases table** (`table.admin-bids.admin-purchases`, named "Purchases of … , newest first"; instant sale): Buyer (*Avatar*, name), Price, Bought, and **Cancel purchase** (*Button* Secondary, small) on each standing purchase of an active item. Cancelled ones stay, muted, with a "Cancelled" *Pill* and when. Below 40rem Price and Bought hide and become a caption under the name ("$15 · today at 1:00 PM"), so the button fits. **Cancel purchase** opens a danger *Dialog* ("Cancel Dev Kapoor's purchase of Lemon squares, a dozen?", Keep purchase / Cancel purchase) saying whose total drops, whether their approved proof goes back to review, and whether the unit returns to stock (only while live; DECISIONS #115).
  - **Remove bid** opens a danger *Dialog* ("Remove Priya Natarajan's $240 bid?", Keep bid / Remove bid) whose body says what happens, computed from the bids: the top bid stays, goes back to the next bid, or, after the close, who becomes the winner and that totals and approved proofs are rechecked. **Cancel item** opens one ("Cancel Lemon squares, a dozen?", Keep item / Cancel item) saying whose totals change. Both end "This can't be undone." After either, the list redraws, a success *Toast* (with how many approved proofs went back to review, if any) confirms, and focus goes to the item's heading. **Refused** (already removed or cancelled): the list reloads under a danger *Banner*.
- **Settings form** (`/admin/settings`; `form.card.card--flat.admin-settings`, named "Event settings"): "Phase now: **Bidding is open**." then the regular *Form field* pattern: Event name; Time zone (a *Select* of every IANA zone the browser knows by friendly name, "Eastern Time (New York)", sorted by it, with the IANA id as the value and the saved one always kept); **Dates**, a fieldset whose help names the zone and its abbreviation ("Times are in Eastern Time (New York), currently EST. Set all three, or leave all three empty…") over three `datetime-local` inputs in a wrapping row, then, once the zone is changed and the dates are set, a line on what the close becomes (`.admin-settings__effect`, a polite live region that describes the dates: "Bidding now closes at 9:00 PM PST (Dec 6 at midnight Eastern).", DECISIONS #117); Default minimum starting bid and Bid increment (money inputs with the "$" affix, side by side); Proof deadline (digits, with a "days" suffix); Giving platform address (optional; https:// or /giving). One primary **Save settings** *Button*. Problems show under their fields with the *Error summary*, from the browser and the shared rules first and the server's 422 the same way. **When saving moves the event to another phase**, a *Dialog* asks first, with words from the two phases (danger for ending bidding, reopening after the close and clearing the dates; confirm otherwise; cancel is "Keep editing"). After saving: a success *Toast*, the app state is fetched again (header, banner and phase follow), and focus stays on Save (DECISIONS #116).
- **Template editor** (`/admin/templates`): a `li.card.card--flat.admin-template` per template: its name (`h4`) with a *Pill* (Default neutral, Edited warning), when a real deployment would send it, and "Subject: …". **Edit template** opens the editor in place (focus to Subject); **Restore default**, only on edited ones, opens a danger *Dialog* (Keep my version / Restore default). The editor: Subject and Body (plain text), **Insert variable** (a disclosure listing only that template's variables with what each stands for; the choice goes in at the cursor of the field last used, which gets focus back; Escape closes it), and **Preview with sample data** beside the fields from 64rem, under them on phones, updated as you type. Unknown or unoffered variables and unmatched braces show inline under the field as you type ("{{item_nme}} isn't a variable. Did you mean {{item_name}}?") and block saving. **Save template** and **Discard changes** (focus back to Edit). Unsaved editors survive other redraws. Last save wins.
- **Reset for next year** (`/admin/reset`; `.card.card--flat.admin-reset`): the event's name (`h3`) with a *Pill* (Locked neutral, Ready warning), a status line with a clock icon ("Reset for next year unlocks on Saturday, December 5 at 9:00 PM EST, 30 days after bidding closes.") or an alert icon when ready, then two short lists side by side from 40rem, **Reset deletes** (with counts: "16 items with their 40 photos", "42 bids", …) and **Reset keeps**, each a named region with an `h4`, and a caption that the demo is shared. Only when ready, a danger **Reset for next year** *Button* opens the type-to-confirm *Dialog* ("Type Kestrel Gives 2026 to confirm"; Confirm stays disabled until it matches exactly). Locked shows no button: the status line says why and when (DECISIONS #118).
- **Reset offer** (`src/components/reset-offer.ts`): after a Reset on the shared demo, an info *Banner* (`section.banner.banner--info.reset-offer`, named by its title) whose title is a heading ("The demo was reset for next year": `h2` on Home above the hero, `h3` on Totals and the Reset section), a line on what Restore brings back (admins also hear "set its dates in Event settings and add items"), and a primary **Restore demo data** action. It opens the demo bar's own Restore dialog through the shell (`kg:restore`), so it works with the bar hidden; once restored the offer is gone and focus goes to the page's heading (Home's `h1`, the admin section title). Don't show it anywhere else: it's for the moment right after a Reset (SPEC v1.17 §7.8).
- **States:** loading (`aria-busy` on the content); error (an *Empty state* with Try again); **For admins only** for employees (an *Empty state* with an info icon, the hint to choose Maya or Theo in the demo bar, and a link Home; no section nav). It shows from the app state without asking the API, and also on the API's 403. The demo bar's Viewing as switches between the states.
- **Behavior:** `startAdminPage()` in `src/pages/admin.ts`, words in `src/pages/admin-rules.ts`, from `GET /api/admin`. Redrawn when the demo bar changes the person or phase; only the newest answer is drawn.
- **Figma:** *Admin Dashboard* page, built from *Admin section nav* · State = Default / Current, *Total card*, *Leading bids note*, *Proof review card* · Status = Waiting / Approved / Rejected × Larger = Off / On (Approved and Rejected with the reverse button), *Admin item row* · Type = Auction / Instant × State = Active / Sold out / Cancelled × History = Closed / Open, *Bid history table* row · State = Top / Standing / Removed, *Purchases table* row · State = Standing / Cancelled, *Settings form* · State = Default / Errors, *Template card* · Status = Default / Edited × Editor = Closed / Open (with the variable menu open and an inline variable error), *Reset card* · State = Locked / Ready / Empty (after a Reset), *Reset offer* (a *Banner* · Tone = Info × Action = On, with a heading title), *Table*, *Pill*, *Avatar* and *Empty state*.

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

- **Markup:** `.profile-menu` > `button.profile-menu__button` (avatar, visually hidden "Maya Okafor, admin", `chevron-down`) and `.profile-menu__panel` (`hidden` when closed) with `.profile-menu__who` and `ul.profile-menu__links`. Employees: `span.profile-menu__static` with `role="img"` and `aria-label` set to the person's name ("Jules Ferreira"), around the `aria-hidden` avatar. It isn't a control: no pointer cursor, no hover or focus state, not in the tab order.
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
  - a `fieldset.demo-bar__jump` of five buttons with `aria-pressed`: Submissions open, Bidding live, Ending soon (bidding closes in under 24 hours), Bidding ended, 30+ days after
  - the Restore button (`data-demo-restore`)
  - `.demo-bar__note` in the summary: "Shared demo · resets daily", visible open or collapsed; on a bar narrower than 40rem it wraps to its own line under the name
  - a visually hidden `role="status"` for announcements
  - Behavior: `enhanceDemoBar()` in `src/components/demo-bar.ts`.
- **Placement:** the first thing on the page, right after the (invisible) skip link in the DOM, so the skip link stays the first tab stop. It's in the normal flow and never overlays content. Inverse colors and a striped top edge set it apart from the app.
- **States:**
  - **Open** and **collapsed** (`<details>`). With no remembered choice it starts open from `--breakpoint-sm` (40rem) up and collapsed below it; once the visitor toggles it, that choice is remembered in `localStorage` and wins. Collapsed, the strip still shows the Demo tag, who you're viewing as and the shared-demo note.
  - The current phase shows as **pressed** (filled, `aria-pressed="true"`).
  - Focus rings switch to the on-inverse color on the bar.
  - Hidden entirely with `?demo=off`; gallery specimens (`data-demo-bar="specimen"`) never hide.
  - **Loading:** on app pages (`renderDemoBar()`), a Jump to button shows the button loading state while its request runs; the select is `aria-busy` while switching people; Restore uses the danger dialog's loading state ("Restoring…").
  - **Error:** a failed Jump or Viewing as change shows a danger toast with the server's reason and leaves the bar as it was; a failed Restore shows the reason in the dialog (for example the 10-second cooldown). Disabled and empty: N/A.
  - The pressed button comes from the data (`currentJump()`), so it's right after a reload or someone else's jump.
- **Accessibility:** a region named "Demo controls". Changing who you're viewing as is announced ("Now viewing as Dev Kapoor (employee)"). Moving the phase is announced too. All controls are 44px.
- **Do:** keep it visually distinct from the app. **Don't:** make it sticky or overlay content.
- **Figma:** *Demo bar* · State = Open / Collapsed (2); both include the Ending soon jump and the shared-demo line. The jump buttons are *Button* (Secondary), with the pressed look drawn as an override.

## Page layout and footer

**Purpose:** the frame every app page shares (Milestone 3B): demo bar, site header, phase banner, the page's content column, and the footer.

- **Markup:** `<body data-page="…">` > skip link, `[data-shell-demo]`, `[data-shell-header]`, `[data-shell-banner]`, `<main class="page" id="main" tabindex="-1">`, `footer.site-footer`. `src/shell.ts` fills the three slots from `GET /api/app`; the banner sits in `.phase-banner` (the content width, under the header).
- **Phase banner words** come from `phaseBanner()` (`src/components/phase-banner-rules.ts`), one per phase: "Submissions are open", "Bidding is open", "Bidding ends soon" (alert icon), "Bidding has ended" (proof due, or the deadline passed). While live, the page's sale picks the wording (DECISIONS #90): Instant Sale and instant-sale item pages (`<body data-sale="instant">`, set by the item page once it knows) say "The instant sale is open" / "It ends in 47 hours, on …" and "The instant sale ends soon" / "It closes in …"; every other page uses the bidding words. Submission and ended are shared. Times are in the viewer's zone with the zone labeled ("today at 5:00 PM EST", "on Wednesday, November 4 at 1:00 PM EST").
- **States:** default. Loading: the header draws at once without the person or Submit an Item, then fills in. **Error:** if the state can't load, a danger banner (`role="alert"`) takes the banner slot. Hover, focus, active, disabled and empty: N/A.
- **Accessibility:** one `<main>`; the phase banner is `role="status"`, so a phase change is announced. The `hidden` attribute always wins over a component's `display` (base.css).
- **Do:** put page content in `.page`, starting with a *Page header*. **Don't:** put page-specific content in the shell slots.
- **Figma:** *Page frame* · Role = Admin / Employee × Width = 390 / 1280 (4), built from the components above.

## Browse toolbar

**Purpose:** the item count and the sort above a browse grid (Silent Auction, Instant Sale; SPEC §8, Milestone 4B).

- **Markup:** `.browse-toolbar` > `p.browse-toolbar__count` ("9 items") and a *Field* with a *Select* (`.browse-toolbar__sort`, label "Sort by"), then a visually hidden `role="status"`, the `ul.item-grid` and two *Empty states* (no items; couldn't load, with **Try again**). Built by `src/pages/browse.ts`; the words come from `src/pages/browse-rules.ts`.
- **Sorts:** Newest, Price: low to high, and (silent auction only) Most bids. The sort is kept in `?sort=` (Newest leaves the URL clean), so a sorted page can be bookmarked; an unknown value falls back to Newest.
- **States:** default. **Loading:** the grid has `aria-busy="true"` until the items arrive. **Empty:** "No silent auction items yet". **Error:** "We couldn't load the items" with **Try again**. Hover, focus, active and disabled come from *Select*.
- **Accessibility:** changing the sort is announced once the new order is drawn ("Sorted by price: low to high. 9 items."), and focus stays on the select. Redraws after a state change (view as someone else, a jump) announce nothing.
- **Do:** let the count and the sort wrap onto two lines on phones. **Don't:** add a search box (SPEC §8).
- **Figma:** *Browse toolbar* · no variants; the sort is a nested *Select*.

## Hero lockup

**Purpose:** the event's name on Home (DECISIONS #47).

- **Markup:** `<div class="lockup lockup--card" role="img" aria-label="Kestrel Gives">` > `img.lockup__mark` (`alt=""`) and `.lockup__words` > `.lockup__kestrel` + `.lockup__gives`. On Home it sits inside the page's h1.
- **Tokens:** `--type-hero` and `--tracking-lockup` for the words; `--size-lockup-mark` scales the mark with them; the brand teal and coral on `--color-mark-tile`.
- **States:** default only (it isn't interactive). Every other state is N/A.
- **Accessibility:** one name, "Kestrel Gives", instead of the mark and two separate words.
- **Do:** use the card in both modes (the mark's file is white). **Don't:** recolor, redraw or crop the mark beyond whitespace (logo rule, #39).
- **Figma:** *Hero lockup* · no variants.

## Hero

**Purpose:** the top of Home (SPEC §8): the hero lockup inside the page's h1, then the event's name, a lead paragraph and a short description.

- **Classes:** `section.hero` > `h1.hero__title` (holding the *Hero lockup*) and `.hero__text` > `p.hero__event` (overline, filled from the data), `p.hero__lead`, `p.hero__more`.
- **Layout:** stacked on phones, with the lockup and overline centered and the paragraphs left-aligned like the headings and cards below; from 64rem, the lockup and text sit side by side, left-aligned.
- **States:** default only; nothing in it is interactive. The event name stays `hidden` until the data arrives. Every other state is N/A.
- **Accessibility:** the h1's name is "Kestrel Gives" (from the lockup's `role="img"`).
- **Do:** keep the lead to one or two sentences. **Don't:** put item lists here (SPEC §8).
- **Figma:** *Hero* · Width = 390 / 1280 (2).

## Steps

**Purpose:** a short numbered list of what to do, in order (How to participate on Home).

- **Classes:** `ol.steps` > `li.steps__item` > `h3.steps__title` and `p.steps__text`. The number circle is generated from a CSS counter (`--size-step-number`, accent-soft fill).
- **Layout:** intrinsic, like the item grid: items wrap at `--size-tile-min`, so four across on a wide page and one per row on a phone.
- **States:** default only. Hover, focus, active, disabled, loading, error and empty: N/A (not interactive; never empty).
- **Accessibility:** a real `<ol>`, so screen readers announce "list, 4 items" and the order; the drawn numbers are decoration that matches.
- **Do:** start each title with a verb. **Don't:** link the whole step; put a link in the text if one is needed.
- **Figma:** *Step* · no variants; *Steps* is an auto-layout of four.

## Charity card

**Purpose:** a charity on Home: logo, name and what it does (SPEC §7.2).

- **Classes:** `ul.charity-list` > `li` > `article.card.card--flat.charity-card` > `img.charity-card__logo` (`--size-charity-logo`, on the mark tile's white) and `.charity-card__text` > `h3.charity-card__name`, `p.charity-card__description`.
- **States:** default. **Loading:** the list is `aria-busy` and empty until the data arrives. Hover, focus, active, disabled, error and empty: N/A (always three charities; if the data fails, the page's danger banner says so).
- **Accessibility:** a real logo has `alt=""` because the name is right beside it. Until the owner's logos arrive, the placeholder is a dashed tile reading "Logo" with `alt="Placeholder logo"` (`logoAlt()`), so it's marked as a placeholder to everyone (SPEC §7.2).
- **Do:** keep descriptions to one sentence. **Don't:** make the card a link (there's no charity page).
- **Figma:** *Charity card* · Logo = Placeholder / Real (2).

---

## Overlays and data (stage C2)

## Dialog

**Purpose:** asks for a yes or no before something that matters: placing a bid, restoring the demo data, cancelling an item, rejecting a proof (with a reason), or the yearly reset (SPEC §7.8).

- **Markup:** a native `<dialog class="dialog dialog--confirm|--danger|--type-to-confirm">` opened with `showModal()`, with `aria-labelledby` (the title) and `aria-describedby` (the body). Inside: `form.dialog__form` > `h2.dialog__title`, `.dialog__body` (text, or for a bid an item summary `.dialog__item` with `.dialog__item-thumb` and `.dialog__item-title`, plus `.dialog__amount`), an optional *Form field* for type-to-confirm, `.dialog__error` (`role="alert"`) and `.dialog__actions` (dismiss, then confirm). Behavior: `confirmDialog()` in `src/components/dialog.ts` resolves `true` once the request succeeds and `false` if dismissed. `.dialog--static` draws a closed dialog in the flow, for the gallery only.
- **Variants:**
  - **Confirm:** says exactly what you're agreeing to, with every amount computed from the data ("Place a $65 bid?"). First focus: the confirm button.
  - Titles use `text-wrap: balance`, so a long one ("Buy the Hand-knit scarf for $45?") breaks evenly on a phone, and `confirmDialog()` wraps each hyphenated word in `span.dialog__word` (`white-space: nowrap`), because balance alone still let it break after the hyphen ("Hand-" / "knit").
  - **Danger:** a destructive action; the confirm button is a *Button* (Danger). First focus: the dismiss button, so Enter never destroys anything by accident. The dismiss button says "Cancel", or "Keep item" next to "Cancel item".
  - **Type-to-confirm:** the danger variant plus a text field; the confirm button stays inactive (`aria-disabled`) until the event name is typed exactly. First focus: the field.
  - **With a reason:** any variant may add a required *Textarea* (`reason` option: label, help, maximum length, and a check that returns the inline error). Used by Reject proof: "Reason (shown to Rosa)", help with an example and the 300-character limit. Submitting without a valid reason sends nothing: the inline error shows under the field ("Enter a reason. The person will see it.", alert icon), the field gets `aria-invalid` and focus, and the error updates as you type. The confirm button stays active so the error can be found. First focus: the field.
- **States:**
  - Open: enters with a short rise and fade (instant under reduced motion); the page behind is inert under a backdrop.
  - **Loading:** `aria-busy` on the dialog, the confirm button shows its loading label ("Placing bid…"), the dismiss button is `aria-disabled`, and Escape is ignored until the request finishes.
  - **Error:** the request's plain message shows in `.dialog__error`, and the dialog stays open so you can try again or cancel.
  - Hover, focus and active belong to its buttons. Disabled: only the type-to-confirm button, as above. Empty: N/A.
- **Accessibility:** native modal, so focus moves in and stays in. Escape closes it (except while loading) and focus returns to the control that opened it. The title names the action; the body says what happens and whether it can be undone.
- **Do:** name the action on the confirm button ("Place bid", not "OK"). **Don't:** use a dialog for information that needs no decision (use a toast or banner).
- **Figma:** *Dialog* · Variant = Confirm / Danger / Type-to-confirm / Reason × State = Default / Loading / Error (12), plus Reason · Invalid. The body is a slot; the buttons are nested *Button* instances.

## Item tile

**Purpose:** one item in a browse grid (Silent Auction, Instant Sale) and in Your Items (SPEC §8).

- **Markup:** `ul.item-grid` (wraps at `--size-tile-min`, no breakpoints) of `li` > `.card.card--link.item-tile` with `.card__media` (photo, and the status pill `.pill.item-tile__status` over it), `h3` > the title link, `.item-tile__amount` and `.item-tile__detail`. Built by `renderItemTile()` in `src/components/item-tile.ts`. Your Items passes its own words in the same shape (amount, detail, one status, muted) from `src/pages/your-items-rules.ts`; an empty amount is left out.
- **Words come from data:** `tileText()` in `src/components/item-tile-rules.ts` computes the amount line and the one status from the item, the viewer and the phase; nothing on a tile is typed in. Unit tests: `tests/unit/item-tile-rules.test.ts`.
  - Only the number takes the amount style (`.item-tile__amount`, "$240"); its label goes on the detail line.
  - Silent auction: "$40 / Starting bid · No bids yet", "$240 / Top bid · 6 bids"; after close "$310 / Winning bid · 9 bids" or "$40 / Starting bid · No bids".
  - Instant sale: "$20 / 2 left"; "12 available" during submissions; "None left"; after close "Sale ended" for unsold stock (sold out stays "None left" with the Sold out pill).
- **Status (one, most important first):** Cancelled (danger) › after close: You won (success), Ended, Sold out › during submissions: "Opens Nov 17" › live silent auction: You're winning (success), Outbid (danger) › live instant sale: Sold out, "2 left" (warning, at 3 or fewer) › Ending soon (warning, within 24 hours of close). No status if none applies. Both thresholds live in `src/components/thresholds.ts` (SPEC §10, DECISIONS #61).
- **States:** the card link's default, hover (lift), active and focus (ring). **Muted** (`.item-tile--muted`, ended and cancelled): the photo fades and the amount turns muted; the pill keeps full contrast. **Cancelled** appears only in Your Items, never in browse grids. Disabled: N/A (a tile always opens its item). Loading: Milestone 3 decides whether grids need skeletons. Empty: the grid's *Empty state*, not the tile. Error: N/A.
- **Accessibility:** the whole tile is one link, named by an `aria-label` of the title and the status ("Sourdough starter and a loaf a month, Outbid"; visually hidden text read with a stray space before the comma); the pill itself is `aria-hidden` so it isn't read twice. Status isn't shown by color alone: the pill has words.
- **Layout:** tiles in a row stretch to the tallest one, with their content top-aligned, so a two-line title doesn't leave a ragged row.
- **Do:** keep titles to two lines in the design; long ones wrap. **Don't:** show more than one status, or put buttons inside the tile.
- **Figma:** *Item tile* · Type = Auction / Instant × Phase = Submission / Live / Ended (6), plus a *Muted* boolean and a *Title* text property. The status is a nested *Pill* instance (or hidden).

## Item page

**Purpose:** one item (SPEC §7.3, §8; Milestone 4C): its photos, the amount, where the viewer stands, why they can or can't act, the description and the public bid history.

- **Markup:** `/items/<id>` serves `item.html` (DECISIONS #86); `src/pages/item.ts` draws into `.item-page`: a *Page header* (back link to the item's browse page, title, "Donated by …"), a danger *Banner* when cancelled, `.item-layout` (the *Photo carousel* beside `section.card.card--flat.item-panel` from `--breakpoint-lg`, stacked below it), "About this item", and for auctions "Bid history" as a *Table* (`table.bid-history`, newest first). It has no caption: the visible "Bid history (6 bids)" heading names the table and its scroll region (`aria-labelledby`), because a visually hidden `<caption>` still takes a line of height and the table's full width. The panel has the status *Pill*, `.item-panel__amount` (only the number), `.item-panel__detail`, `.item-panel__note` and `.item-panel__actions`.
- **Words come from data:** the amount, detail and status use the tile rules, so a tile and its page agree; the note comes from `panelText()` in `src/pages/item-rules.ts`: the minimum ("At least $245. Bids go up by $5."), "You're the high bidder.", "This is your item.", "Sold out.", "Bidding opens tomorrow at 9:00 AM EST.", "Won by Priya Natarajan for $240." or "The sale has ended." The winner also gets `a.item-panel__link` under "You won this item for $85.": "Donate and upload proof in Your Items" → `/your-items`.
- **Bid history:** each row's header is the bidder (small *Avatar* and name); the top bid's avatar wears the crown and its name carries visually hidden "(top bidder)". A cancelled item has no winner, so no crown. Times are in the viewer's zone, labeled once beside the heading ("Bid history (6 bids) · times in EST"); a row from the other side of a clock change keeps its own zone ("Oct 31 at 7:00 PM EDT"). Below `--breakpoint-sm` the table has two columns (bidder, amount): the Time column hides and the time shows as a caption line (`.bid-history__when`) under the name; only one of the two is ever displayed. No bids: one "No bids yet." row.
- **States:** default. **Loading:** `aria-busy` on `.item-page`. **Muted** (ended, cancelled): the amount turns muted. **Not found:** an *Empty state* with links to both browse pages. **Error:** an *Empty state* with **Try again**; a failed refresh keeps the page as it was.
- **Refresh:** every 30 seconds while the tab is visible (SPEC §7.4), and when it becomes visible again. The carousel is kept when the photos haven't changed, so the photo the visitor is on stays. Only a change in the viewer's own standing is announced, through a visually hidden `role="status"` ("You've been outbid. The top bid is now $300."); redraws after view-as or a jump are silent (DECISIONS #88).
- **Actions (Stage 4D; DECISIONS #88, #89):** `src/pages/item-actions.ts`.
  - **Bid form** (live, nothing in the way): `form.bid-form` > a *Form field* "Your bid" whose help is the computed minimum ("At least $245. Bids go up by $5.") > a *Money input* (`inputmode="numeric"`), starting at the minimum > **Place bid**. While the form shows, the minimum isn't repeated as the note.
  - **Buy button:** **Buy one**.
  - **Confirm dialogs:** "Place a $250 bid?" or "Buy the Hand-knit scarf for $45?", with the item's cover, title and where it stands, the amount, and "Bids can't be taken back." or "One per purchase. Purchases can't be taken back."
  - **Results** go to the page's status region and a quiet *Toast*, so they're read once. Each result replaces the page's earlier toast.
  - **Amount refusals** (too low, lost race) close the dialog and put the reason under the field only (no toast), with the new minimum filled in and focus on the field. Other refusals (sold out, ended) redraw the panel, which takes focus, and get a toast. A failed request keeps the dialog open with the reason.
  - What the bidder typed survives the refresh.
  - States: default, **error** (field), **loading** (the dialog's), and **blocked** (no controls; the note says why).
- **Do:** keep actions in the panel. **Don't:** show the history for instant sale, or a crown on anyone but the top bid.
- **Figma:** *Item page* · Type = Auction / Instant × Width = 390 / 1280 (4), built from the components above; *Item panel* · State = Live / Blocked / Ended / Cancelled (4).

## Photo carousel

**Purpose:** an item's 1–5 photos on its page, one at a time.

- **Markup:** `<section class="carousel" aria-label="Photos of …" data-carousel>` > `.carousel__stage` (4:3) with `figure.carousel__slide`s (all but one `hidden`), `button.carousel__nav.carousel__nav--prev` and `--next` (round icon buttons over the photo), and `p.carousel__count` ("Photo 2 of 5", `aria-live="polite"`); then `ul.carousel__thumbs` of `button.carousel__thumb` (named "Photo 2 of 5", the current one `aria-current="true"`). Behavior: `enhanceCarousel()` in `src/components/carousel.ts`. With one photo, `.carousel--single` hides the arrows and thumbnails.
- **States:** arrows and thumbnails have hover, active and focus (ring). **Current** thumbnail: a strong border and `aria-current`. At either end the arrow is **inactive** (`aria-disabled="true"`, faded) but stays focusable, so focus never vanishes. Loading: Milestone 5 decides (real photos replace the placeholders then); no spinner. Error and empty: N/A (an item always has at least one photo, SPEC §7).
- **Accessibility:** no autoplay and no swipe-only control. Every change is announced through the count. Arrows and thumbnails are 44px tall. The thumbnails stay on one row: at 390px all five narrow to fit, never below 44px wide. Each photo has alt text from the submitter's title ("Photo 2 of 5" until real photos land).
- **Do:** keep the cover photo first. **Don't:** add autoplay or arrow-key shortcuts on the page.
- **Figma:** *Photo carousel* · Photos = Single with Position = Only, plus Photos = Multiple × Position = First / Middle / Last (4 variants). *Carousel thumbnail* · State = Default / Hover / Focus / Current (4).

## Table

**Purpose:** rows of records for admins: people, items, proofs waiting for review.

- **Markup:** `<div class="table-wrap" role="region" aria-labelledby="(caption id)" data-table-scroll>` > `table.table` with a `caption`, `th scope="col"` headers, `th scope="row"` for each row's name, `.table__num` on number columns (right-aligned, tabular figures), and `.table__actions` in the last column (its header is visually hidden "Actions"). An empty table has one row: `td.table__empty` spanning every column. Behavior: `enhanceTableScroll()` in `src/components/table.ts`.
- **Narrow screens:** the table keeps its columns and scrolls inside `.table-wrap` (WCAG's exception for two-dimensional content). The region joins the tab order (`tabindex="0"`) only while it actually scrolls, so keyboard users can scroll it with the arrow keys. The wrap is positioned so visually hidden text inside it can't widen the page.
- **States:** rows have a hover fill. Row actions are *Button* Small (`--size-target-sm`, allowed in dense rows by SPEC §6) with the row's name in their label (visible "View bids", read as "View bids by Maya Okafor"). **Empty:** the message row, and the headers wrap so the message stays in view. Loading and error: Milestone 3 (an error uses a danger banner above the table). Disabled: N/A.
- **Accessibility:** the caption names the table and the region. Column and row headers are real `th` elements. No sorting until a screen needs it.
- **Do:** keep row actions to one or two. **Don't:** hide columns on small screens; scroll instead.
- **Figma:** *Table* · Rows = Filled / Empty (2), built from *Table row* · State = Header / Default / Hover (3) and *Table cell* · Kind = Header / Text / Number / Link (4), with a *Value* text property.
