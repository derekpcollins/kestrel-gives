// Form behavior (DESIGN-SYSTEM.md › Form field, Error summary). Uses the browser's own
// constraint checks (required, type, maxlength, min) but shows our messages inline, under
// each field, instead of the browser's bubbles. On submit with problems, an error summary
// at the top of the form takes focus and links to each field.
import { messageFor, moneyProblem, summaryTitle, type FieldInfo } from "./form-rules.ts";
import { icon } from "./icons.ts";

export type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const customChecks = new WeakMap<Element, () => string>();

/** Adds a check the browser can't do (the photo uploader's "at least one photo"). */
export function registerCheck(control: Element, check: () => string): void {
  customChecks.set(control, check);
}

export interface EnhanceOptions {
  /** Runs when the form is submitted with no problems. */
  onValid?: (form: HTMLFormElement) => void;
}

export function enhanceForm(form: HTMLFormElement, { onValid }: EnhanceOptions = {}): void {
  form.noValidate = true;
  let submitted = false;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitted = true;
    const problems = validateAll(form);
    showSummary(form, problems);
    if (problems.length === 0) onValid?.(form);
  });

  // New messages appear only on submit. A field already showing one re-checks as it's
  // edited, so its message updates and clears when fixed. (Adding messages on blur would
  // shift the layout under the pointer: the submit button moved mid-click.)
  const recheck = (event: Event) => {
    if (!submitted) return;
    const control = event.target;
    if (!isControl(control) || !control.closest(".field--error")) return;
    validateField(control);
    const summary = form.querySelector<HTMLElement>(".error-summary");
    if (summary) {
      const problems = validateAll(form, { silent: true });
      if (problems.length === 0) summary.remove();
    }
  };
  form.addEventListener("change", recheck);
  form.addEventListener("focusout", recheck);
}

/** Enables `target` (a fieldset) once any radio named `name` is checked (SPEC §7.2: the
    rest of the submit form stays disabled until a sale type is chosen). */
export function enableWhenChosen(form: HTMLFormElement, name: string, target: HTMLFieldSetElement): void {
  const update = () => { target.disabled = !form.querySelector(`input[name="${CSS.escape(name)}"]:checked`); };
  form.addEventListener("change", update);
  update();
}

interface Problem { control: Control; label: string; message: string }

function validateAll(form: HTMLFormElement, { silent = false } = {}): Problem[] {
  const problems: Problem[] = [];
  const seenGroups = new Set<string>();
  for (const el of Array.from(form.elements)) {
    if (!isControl(el) || el.disabled || el.closest("fieldset:disabled") || el.type === "submit" || el.type === "button") continue;
    if (el.type === "radio") {
      if (seenGroups.has(el.name)) continue;
      seenGroups.add(el.name);
    }
    const message = silent ? problemFor(el) : validateField(el);
    if (message) problems.push({ control: el, label: labelFor(el), message });
  }
  return problems;
}

/** Checks one control, shows or clears its message, and returns the message. */
function validateField(control: Control): string {
  return setFieldMessage(control, problemFor(control));
}

/**
 * Shows problems the server found (DECISIONS #98): each under its field, as if the browser had
 * found it, plus the error summary, which takes focus. A field's message clears as it's fixed.
 */
export function showServerProblems(form: HTMLFormElement, problems: readonly { control: Control; message: string }[]): void {
  for (const { control, message } of problems) setFieldMessage(control, message);
  showSummary(form, problems.map(({ control, message }) => ({ control, label: labelFor(control), message })));
}

/** Shows or clears one control's message (also used for live checks, like a template's variables). */
export function setFieldMessage(control: Control, message: string): string {
  const field = control.closest<HTMLElement>(".field");
  if (!field) return message;
  const group = control.type === "radio" ? Array.from(field.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(control.name)}"]`)) : [control];
  let slot = field.querySelector<HTMLElement>(":scope > .field__message--error");
  if (message) {
    if (!slot) {
      slot = document.createElement("p");
      slot.className = "field__message field__message--error";
      slot.id = `${group[0]!.id || control.name}-error`;
      field.append(slot);
    }
    slot.replaceChildren(icon("alert", { size: "sm" }), document.createTextNode(message));
    field.classList.add("field--error");
    for (const c of group) {
      c.setAttribute("aria-invalid", "true");
      addDescribedBy(c, slot.id);
    }
  } else {
    field.classList.remove("field--error");
    for (const c of group) {
      c.removeAttribute("aria-invalid");
      if (slot) removeDescribedBy(c, slot.id);
    }
    slot?.remove();
  }
  return message;
}

function problemFor(control: Control): string {
  const custom = customChecks.get(control);
  if (custom) return custom();
  const field = control.closest<HTMLElement>(".field");
  const name = field?.dataset.messageName ?? labelFor(control);
  if (control instanceof HTMLInputElement && "money" in control.dataset) {
    const min = control.dataset.min === undefined ? undefined : Number(control.dataset.min);
    return moneyProblem(control.value, { label: name, min, required: control.required });
  }
  if (control.validity.patternMismatch && field?.dataset.patternMessage) return field.dataset.patternMessage;
  return messageFor(control.validity, infoFor(control, name));
}

function infoFor(control: Control, label: string): FieldInfo {
  const kind: FieldInfo["kind"] =
    control instanceof HTMLSelectElement || control.type === "radio" ? "choice"
    : control.type === "email" ? "email"
    : control.type === "number" ? "number"
    : control.type === "datetime-local" ? "datetime"
    : control.type === "file" ? "file"
    : "text";
  const info: FieldInfo = { label, kind };
  if (control instanceof HTMLInputElement) {
    if (control.min) info.min = control.min;
    if (control.max) info.max = control.max;
  }
  if (!(control instanceof HTMLSelectElement) && control.maxLength > 0) info.maxLength = control.maxLength;
  if (!(control instanceof HTMLSelectElement) && control.minLength > 0) info.minLength = control.minLength;
  return info;
}

function labelFor(control: Control): string {
  const field = control.closest(".field");
  const label = field?.querySelector(".field__label");
  if (!label) return control.name;
  const copy = label.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(".field__optional").forEach((el) => el.remove());
  return (copy.textContent ?? "").trim();
}

function showSummary(form: HTMLFormElement, problems: readonly Problem[]): void {
  form.querySelector(".error-summary")?.remove();
  if (problems.length === 0) return;
  const summary = document.createElement("div");
  summary.className = "banner banner--danger error-summary";
  summary.tabIndex = -1;
  summary.setAttribute("role", "alert");
  const body = document.createElement("div");
  body.className = "banner__body";
  const title = document.createElement("p");
  title.className = "banner__title";
  title.textContent = summaryTitle(problems.length);
  const list = document.createElement("ul");
  list.className = "error-summary__list";
  for (const { control, label, message } of problems) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.className = "link link--quiet";
    link.href = `#${control.id}`;
    link.textContent = `${label}: ${message}`;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      control.focus();
    });
    item.append(link);
    list.append(item);
  }
  body.append(title, list);
  summary.append(icon("alert"), body);
  form.prepend(summary);
  summary.focus();
}

function isControl(el: unknown): el is Control {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
}

function addDescribedBy(el: Element, id: string): void {
  const ids = new Set((el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
  ids.add(id);
  el.setAttribute("aria-describedby", [...ids].join(" "));
}

function removeDescribedBy(el: Element, id: string): void {
  const ids = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((x) => x && x !== id);
  if (ids.length) el.setAttribute("aria-describedby", ids.join(" "));
  else el.removeAttribute("aria-describedby");
}
