// Dialog (DESIGN-SYSTEM.md › Dialog): a native modal <dialog>, so the browser moves focus
// in, keeps it inside, and makes the rest of the page inert. Three variants: confirm (bid
// confirmation), danger (restore demo data, cancel item) and type-to-confirm (the yearly
// reset, SPEC §7.8). Any variant may ask for a required reason (rejecting a proof, §7.6). Escape closes it, except while the request runs; focus returns to
// the control that opened it.
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

/** Opens a confirmation dialog. Resolves true once onConfirm succeeds, false if cancelled. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
  document.body.append(dialog);

  let busy = false;
  const matches = () => !input || input.value === options.confirmText;
  const syncConfirm = () => {
    if (busy || !matches()) confirm.setAttribute("aria-disabled", "true");
    else confirm.removeAttribute("aria-disabled");
  };
  input?.addEventListener("input", () => { error.hidden = true; syncConfirm(); });
  syncConfirm();

  return new Promise<boolean>((resolve) => {
    let confirmed = false;
    const finish = () => {
      dialog.remove();
      trigger?.focus();
      resolve(confirmed);
    };
    dialog.addEventListener("close", finish, { once: true });

    // Escape: the browser fires cancel; refuse it while the request runs.
    dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
    dialog.addEventListener("keydown", (event) => { if (busy && event.key === "Escape") event.preventDefault(); });

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

    dialog.showModal();
    // First focus: the input to type into; Cancel for destructive actions; otherwise the
    // confirm button (the person just chose to act).
    (input ?? textarea ?? (danger ? cancel : confirm)).focus();
  });
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
