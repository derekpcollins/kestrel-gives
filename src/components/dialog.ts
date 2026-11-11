// Dialog (DESIGN-SYSTEM.md › Dialog): a native modal <dialog>, so the browser moves focus
// in, keeps it inside, and makes the rest of the page inert. Three variants ask before acting:
// confirm (bid confirmation), danger (restore demo data, cancel item) and type-to-confirm (the
// yearly reset, SPEC §7.8). Any of them may ask for a required reason (rejecting a proof,
// §7.6). The info variant (the welcome, DECISIONS entry 139) offers a way on instead. Escape
// closes any of them, except while a request runs; focus returns to the control that opened it.
import { icon } from "./icons.ts";

export interface ConfirmOptions {
  variant: "confirm" | "danger" | "type-to-confirm";
  title: string;
  /** Body content: plain text or nodes (an item summary, for example). */
  body: string | Node;
  confirmLabel: string;
  /** The dismiss button's label; "Cancel" unless that reads oddly ("Keep item" beside "Cancel item"). */
  cancelLabel?: string;
  /** Label while the request runs ("Placing bid…"). */
  busyLabel?: string;
  /** type-to-confirm only: the exact text to type (the event name). */
  confirmText?: string;
  /**
   * A required text the person writes (a rejection reason). `check` returns the inline error,
   * or null; the dialog won't confirm until it passes. Its value goes to onConfirm.
   */
  reason?: { label: string; help?: string; maxLength: number; check: (value: string) => string | null };
  /** The work to do on confirm. Throw an Error with a plain message to show it in the dialog. */
  onConfirm: (reason: string) => Promise<void>;
}

let count = 0;

/**
 * Every variant's life: shows the dialog as a modal with focus on `first`, refuses Escape while
 * `busy()`, and on close removes it and returns focus to what had it before. Resolves on close.
 */
function openModal(dialog: HTMLDialogElement, first: HTMLElement, busy: () => boolean = () => false): Promise<void> {
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  return new Promise<void>((resolve) => {
    dialog.addEventListener("close", () => {
      dialog.remove();
      trigger?.focus();
      resolve();
    }, { once: true });
    // Escape: the browser fires cancel; refuse it while the request runs.
    dialog.addEventListener("cancel", (event) => { if (busy()) event.preventDefault(); });
    dialog.addEventListener("keydown", (event) => { if (busy() && event.key === "Escape") event.preventDefault(); });
    document.body.append(dialog);
    dialog.showModal();
    first.focus();
  });
}

/** Opens a confirmation dialog. Resolves true once onConfirm succeeds, false if cancelled. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  const id = `dialog-${++count}`;
  const danger = options.variant !== "confirm";

  const dialog = document.createElement("dialog");
  dialog.className = `dialog dialog--${options.variant}`;
  dialog.setAttribute("aria-labelledby", `${id}-title`);
  dialog.setAttribute("aria-describedby", `${id}-body`);

  const form = document.createElement("form");
  form.className = "dialog__form";
  form.noValidate = true;

  const title = document.createElement("h2");
  title.className = "dialog__title";
  title.id = `${id}-title`;
  title.append(...keepWordsWhole(options.title));

  const body = document.createElement("div");
  body.className = "dialog__body";
  body.id = `${id}-body`;
  body.append(typeof options.body === "string" ? paragraph(options.body) : options.body);

  let input: HTMLInputElement | null = null;
  const field = document.createElement("div");
  if (options.variant === "type-to-confirm") {
    field.className = "field";
    const label = document.createElement("label");
    label.className = "field__label";
    label.htmlFor = `${id}-confirm`;
    label.textContent = `Type ${options.confirmText} to confirm`;
    input = document.createElement("input");
    input.className = "input";
    input.id = `${id}-confirm`;
    input.autocomplete = "off";
    input.spellcheck = false;
    field.append(label, input);
  }

  let textarea: HTMLTextAreaElement | null = null;
  const reasonField = document.createElement("div");
  const reasonError = document.createElement("p");
  if (options.reason) {
    reasonField.className = "field";
    const label = document.createElement("label");
    label.className = "field__label";
    label.htmlFor = `${id}-reason`;
    label.textContent = options.reason.label;
    textarea = document.createElement("textarea");
    textarea.className = "input";
    textarea.id = `${id}-reason`;
    textarea.rows = 3;
    textarea.maxLength = options.reason.maxLength;
    textarea.required = true;
    const described: string[] = [];
    reasonField.append(label);
    if (options.reason.help) {
      const help = document.createElement("p");
      help.className = "field__help";
      help.id = `${id}-reason-help`;
      help.textContent = options.reason.help;
      described.push(help.id);
      reasonField.append(help);
    }
    reasonError.className = "field__message field__message--error";
    reasonError.id = `${id}-reason-error`;
    reasonError.hidden = true;
    described.push(reasonError.id);
    textarea.setAttribute("aria-describedby", described.join(" "));
    reasonField.append(textarea, reasonError);
  }
  const reasonProblem = () => (options.reason && textarea ? options.reason.check(textarea.value) : null);
  const showReasonProblem = (message: string | null) => {
    if (!textarea) return;
    reasonError.replaceChildren(...(message ? [icon("alert", { size: "sm" }), document.createTextNode(message)] : []));
    reasonError.hidden = !message;
    if (message) textarea.setAttribute("aria-invalid", "true");
    else textarea.removeAttribute("aria-invalid");
  };
  // Once shown, the message updates as the person types, and clears when it's fixed (#53).
  textarea?.addEventListener("input", () => { if (!reasonError.hidden) showReasonProblem(reasonProblem()); });

  const error = document.createElement("p");
  error.className = "field__message field__message--error dialog__error";
  error.setAttribute("role", "alert");
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className = "dialog__actions";
  const cancel = button(options.cancelLabel ?? "Cancel", "btn btn--secondary");
  cancel.type = "button";
  const confirm = button(options.confirmLabel, danger ? "btn btn--danger" : "btn");
  confirm.type = "submit";
  actions.append(cancel, confirm);

  form.append(title, body, ...(input ? [field] : []), ...(textarea ? [reasonField] : []), error, actions);
  dialog.append(form);

  let busy = false;
  const matches = () => !input || input.value === options.confirmText;
  const syncConfirm = () => {
    if (busy || !matches()) confirm.setAttribute("aria-disabled", "true");
    else confirm.removeAttribute("aria-disabled");
  };
  input?.addEventListener("input", () => { error.hidden = true; syncConfirm(); });
  syncConfirm();

  let confirmed = false;
  cancel.addEventListener("click", () => { if (!busy) dialog.close(); });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || confirm.getAttribute("aria-disabled") === "true") return;
    const problem = reasonProblem();
    showReasonProblem(problem);
    if (problem) {
      textarea?.focus();
      return;
    }
    busy = true;
    error.hidden = true;
    dialog.setAttribute("aria-busy", "true");
    confirm.setAttribute("aria-busy", "true");
    cancel.setAttribute("aria-disabled", "true");
    syncConfirm();
    const label = confirm.textContent;
    if (options.busyLabel) confirm.textContent = options.busyLabel;
    try {
      await options.onConfirm(textarea ? textarea.value.trim() : "");
      confirmed = true;
      busy = false;
      dialog.close();
    } catch (err) {
      busy = false;
      dialog.removeAttribute("aria-busy");
      confirm.removeAttribute("aria-busy");
      cancel.removeAttribute("aria-disabled");
      confirm.textContent = label;
      syncConfirm();
      error.replaceChildren(icon("alert", { size: "sm" }), document.createTextNode(err instanceof Error ? err.message : "Something went wrong. Try again."));
      error.hidden = false;
      confirm.focus();
    }
  });

  // First focus: the input to type into; Cancel for destructive actions; otherwise the
  // confirm button (the person just chose to act).
  return openModal(dialog, input ?? textarea ?? (danger ? cancel : confirm), () => busy).then(() => confirmed);
}

export interface InfoOptions {
  title: string;
  /** The one line a screen reader announces with the title (aria-describedby). */
  lead: string;
  /** The rest of the body, under the lead. */
  more: Node[];
  /** Closes the dialog. The primary button, with first focus, so Enter and Escape only close. */
  dismissLabel: string;
  /** Where to go instead: a real link, since it navigates. */
  link: { label: string; href: string };
}

/**
 * Opens an info dialog (DECISIONS entry 139): something to read and a way on, no request.
 * When it's taller than the screen (a phone held sideways), only the body scrolls, between the
 * title and the actions, with a divider above the actions, and becomes a focusable, named region
 * so a keyboard can scroll it.
 */
export function infoDialog(options: InfoOptions): Promise<void> {
  const id = `dialog-${++count}`;
  const dialog = document.createElement("dialog");
  dialog.className = "dialog dialog--info";
  dialog.setAttribute("aria-labelledby", `${id}-title`);
  dialog.setAttribute("aria-describedby", `${id}-lead`);

  const content = document.createElement("div");
  content.className = "dialog__form";

  const title = document.createElement("h2");
  title.className = "dialog__title";
  title.id = `${id}-title`;
  title.append(...keepWordsWhole(options.title));

  const body = document.createElement("div");
  body.className = "dialog__body";
  const lead = paragraph(options.lead);
  lead.id = `${id}-lead`;
  body.append(lead, ...options.more);

  const actions = document.createElement("div");
  actions.className = "dialog__actions";
  const link = document.createElement("a");
  link.className = "btn btn--secondary";
  link.href = options.link.href;
  link.textContent = options.link.label;
  const dismiss = button(options.dismissLabel, "btn");
  dismiss.type = "button";
  dismiss.addEventListener("click", () => dialog.close());
  // The primary on the right (or below, when they stack), as in every dialog here (entry 139),
  // so visual order and Tab order agree; first focus still goes to the dismiss.
  actions.append(link, dismiss);

  content.append(title, body, actions);
  dialog.append(content);

  // A scrolling region needs to take focus to be scrolled from the keyboard (WCAG 2.1.1), but
  // when nothing scrolls that would be a stop with nothing to do, so it's only there when needed.
  // So is the divider above the actions, the cue that there's more to read.
  const scrollable = new ResizeObserver(() => {
    const scrolls = body.scrollHeight > body.clientHeight;
    body.classList.toggle("dialog__body--scrolls", scrolls);
    if (scrolls) {
      body.tabIndex = 0;
      body.setAttribute("role", "region");
      body.setAttribute("aria-labelledby", title.id);
    } else {
      body.removeAttribute("tabindex");
      body.removeAttribute("role");
      body.removeAttribute("aria-labelledby");
    }
  });
  scrollable.observe(body);
  return openModal(dialog, dismiss).then(() => scrollable.disconnect());
}

/**
 * Title text with each hyphenated word held together ("Hand-knit"): browsers may break after
 * a hyphen, which `text-wrap: balance` alone doesn't prevent (owner, 4E).
 */
function keepWordsWhole(text: string): Node[] {
  return text.split(/(\S*\w-\w\S*)/).filter(Boolean).map((part) => {
    if (!/\w-\w/.test(part)) return document.createTextNode(part);
    const span = document.createElement("span");
    span.className = "dialog__word";
    span.textContent = part;
    return span;
  });
}

function paragraph(text: string): HTMLParagraphElement {
  const p = document.createElement("p");
  p.textContent = text;
  return p;
}

function button(text: string, className: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = className;
  b.textContent = text;
  return b;
}
