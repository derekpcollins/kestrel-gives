// The Admin Dashboard's Event settings form and Email templates editor (SPEC §7.1, §7.7;
// DECISIONS #116). Drawn by src/pages/admin.ts, which owns loading, alerts and focus. The words
// and choices are in admin-settings-rules.ts; the field rules are shared with the server.
import type { AdminSettings, AdminTemplate, AdminTemplates } from "../admin-api.ts";
import { confirmDialog } from "../components/dialog.ts";
import { el } from "../components/dom.ts";
import { dollarsToCents, parseWholeDollars } from "../components/form-rules.ts";
import { enhanceForm, registerCheck, setFieldMessage, showServerProblems, type Control } from "../components/forms.ts";
import { icon } from "../components/icons.ts";
import { checkSettings, SETTINGS_LIMITS, type SettingsField, type SettingsInput } from "../components/settings-rules.ts";
import { insertAt, TEMPLATE_LIMITS, templateProblems, token, VARIABLES, type Variable } from "../components/template-rules.ts";
import { showToast } from "../components/toast.ts";
import {
  liveProblems, PHASE_NAMES, phaseChange, phaseFor, preview, restoreDialog, SETTINGS_TEXT, TEMPLATE_WHEN, templateStatus, timeZones, VARIABLE_TEXT, zoneEffect, zoneHelp,
} from "./admin-settings-rules.ts";

/** What admin.ts lends these sections. */
export interface SectionHost {
  post(body: Record<string, unknown>): Promise<{ message: string; answer: unknown }>;
  /** Reloads the section and shows the message in its alert (a stale or missing record). */
  reloadWith(message: string): Promise<void>;
  alert(message: string): void;
  denied(): void;
  redraw(nodes: Node[]): void;
  /**
   * Asks the shell to fetch the app state again (the header, banner and phase follow the dates).
   * The section then reloads; focus goes to `focus` (a selector) in it.
   */
  refreshApp(focus: string): void;
}

const pill = (label: string, tone: string) => el("span", { className: `pill${tone === "neutral" ? "" : ` pill--${tone}`}`, text: label });
const statusOf = (error: unknown) => (error as { status?: number }).status;
const problemsOf = (error: unknown) => (error as { problems?: { field: string; message: string }[] }).problems;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong. Please try again.");

function setBusy(button: HTMLButtonElement, busy: boolean, label: string): void {
  button.toggleAttribute("aria-busy", busy);
  if (busy) button.setAttribute("aria-disabled", "true"); else button.removeAttribute("aria-disabled");
  button.textContent = label;
}

// ---------------------------------------------------------------------------------------------
// Event settings

const SETTINGS_ID: Record<SettingsField, string> = {
  name: "settings-name", timeZone: "settings-zone",
  submissionsOpen: "settings-submissions", biddingOpens: "settings-opens", biddingCloses: "settings-closes",
  minStartingBidCents: "settings-min-bid", bidIncrementCents: "settings-increment",
  proofDeadlineDays: "settings-proof-days", givingPlatformUrl: "settings-giving",
};

interface FieldOptions {
  id: string;
  label: string;
  help?: string;
  optional?: boolean;
  messageName?: string;
  patternMessage?: string;
}

function field(o: FieldOptions, control: HTMLElement): HTMLElement {
  const helpId = `${o.id}-help`;
  const target = control.matches("input, select, textarea") ? control : control.querySelector<HTMLElement>("input, select, textarea");
  if (o.help) target?.setAttribute("aria-describedby", helpId);
  const wrap = el("div", { className: "field", attrs: { ...(o.messageName ? { "data-message-name": o.messageName } : {}), ...(o.patternMessage ? { "data-pattern-message": o.patternMessage } : {}) } },
    el("label", { className: "field__label", attrs: { for: o.id } }, o.label, o.optional ? el("span", { className: "field__optional", text: " (optional)" }) : null),
    o.help ? el("p", { className: "field__help", text: o.help, attrs: { id: helpId } }) : null,
    control);
  return wrap;
}

function textInput(id: string, name: string, value: string, attrs: Record<string, string> = {}): HTMLInputElement {
  const input = el("input", { className: "input", attrs: { id, name, type: "text", autocomplete: "off", ...attrs } });
  input.value = value;
  return input;
}

function moneyInput(id: string, name: string, cents: number): HTMLElement {
  const input = el("input", { className: "input input--money input--short", attrs: { id, name, type: "text", inputmode: "numeric", pattern: "[0-9]+", autocomplete: "off", required: "", "data-money": "", "data-min": "1" } });
  input.value = String(cents / 100);
  return el("div", { className: "input-group" }, el("span", { className: "input-group__affix", attrs: { "aria-hidden": "true" }, text: "$" }), input);
}

export function settingsSection(answer: AdminSettings, host: SectionHost, focusSave = false): Node[] {
  const loadedAt = performance.now();
  const now = () => new Date(Date.parse(answer.now) + (performance.now() - loadedAt));
  const saved = answer.values;
  const before = phaseFor(saved, now()) ?? "unscheduled";
  const T = SETTINGS_TEXT;

  const name = textInput(SETTINGS_ID.name, "name", saved.name, { required: "", maxlength: String(SETTINGS_LIMITS.nameMax) });
  const zone = el("select", { className: "input", attrs: { id: SETTINGS_ID.timeZone, name: "timeZone", required: "" } });
  const known = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [saved.timeZone];
  zone.append(...timeZones(saved.timeZone, known, now()).map((z) => el("option", { text: z.label, attrs: { value: z.value } })));
  zone.value = saved.timeZone;

  const dateHelp = el("p", { className: "field__help", attrs: { id: "settings-dates-help" }, text: zoneHelp(saved.timeZone, now()) });
  const dateInput = (key: "submissionsOpen" | "biddingOpens" | "biddingCloses") => {
    const input = el("input", { className: "input", attrs: { id: SETTINGS_ID[key], name: key, type: "datetime-local", step: "60", "aria-describedby": "settings-dates-help settings-dates-effect" } });
    input.value = saved[key];
    return el("div", { className: "field" }, el("label", { className: "field__label", attrs: { for: SETTINGS_ID[key] }, text: T[key].label }), input);
  };
  // A changed zone keeps the typed wall times (DECISIONS #116); this line says what the close becomes.
  const effect = el("p", { className: "field__help admin-settings__effect", attrs: { id: "settings-dates-effect", "aria-live": "polite", "data-settings-effect": "" } });
  const showEffect = () => {
    const words = zoneEffect(saved.timeZone, {
      timeZone: zone.value,
      submissionsOpen: form.querySelector<HTMLInputElement>(`#${SETTINGS_ID.submissionsOpen}`)!.value,
      biddingOpens: form.querySelector<HTMLInputElement>(`#${SETTINGS_ID.biddingOpens}`)!.value,
      biddingCloses: form.querySelector<HTMLInputElement>(`#${SETTINGS_ID.biddingCloses}`)!.value,
    });
    effect.textContent = words ?? "";
    effect.hidden = !words;
  };
  effect.hidden = true;
  zone.addEventListener("change", () => { dateHelp.textContent = zoneHelp(zone.value, now()); showEffect(); });

  const days = textInput(SETTINGS_ID.proofDeadlineDays, "proofDeadlineDays", String(saved.proofDeadlineDays), { inputmode: "numeric", pattern: "[0-9]+", required: "", class: "input input--money input--short" });
  const giving = textInput(SETTINGS_ID.givingPlatformUrl, "givingPlatformUrl", saved.givingPlatformUrl, { inputmode: "url", maxlength: String(SETTINGS_LIMITS.urlMax), spellcheck: "false" });

  const save = el("button", { className: "btn", attrs: { type: "submit", "data-settings-save": "" }, text: "Save settings" });
  const form = el("form", { className: "card card--flat admin-settings", attrs: { "aria-label": "Event settings", novalidate: "" } },
    el("p", { className: "admin-glance", attrs: { "data-settings-phase": "" } }, "Phase now: ", el("strong", { text: PHASE_NAMES[before] }), ". Saving new dates moves the event to the phase they describe."),
    field({ id: SETTINGS_ID.name, label: T.name.label, help: T.name.help, messageName: "the event's name" }, name),
    field({ id: SETTINGS_ID.timeZone, label: T.timeZone.label, help: T.timeZone.help }, el("div", { className: "select" }, zone, icon("chevron-down"))),
    el("fieldset", { className: "field admin-settings__group" },
      el("legend", { className: "field__label", text: T.dates.legend }), dateHelp,
      el("div", { className: "field-row" }, dateInput("submissionsOpen"), dateInput("biddingOpens"), dateInput("biddingCloses")), effect),
    el("div", { className: "field-row" },
      field({ id: SETTINGS_ID.minStartingBidCents, label: T.minStartingBidCents.label, help: T.minStartingBidCents.help, messageName: "a minimum starting bid" }, moneyInput(SETTINGS_ID.minStartingBidCents, "minStartingBid", saved.minStartingBidCents)),
      field({ id: SETTINGS_ID.bidIncrementCents, label: T.bidIncrementCents.label, help: T.bidIncrementCents.help, messageName: "a bid increment" }, moneyInput(SETTINGS_ID.bidIncrementCents, "bidIncrement", saved.bidIncrementCents))),
    field({ id: SETTINGS_ID.proofDeadlineDays, label: T.proofDeadlineDays.label, help: T.proofDeadlineDays.help, messageName: "the number of days", patternMessage: "Whole numbers only." },
      el("div", { className: "input-group" }, days, el("span", { className: "input-group__affix", attrs: { "aria-hidden": "true" }, text: "days" }))),
    field({ id: SETTINGS_ID.givingPlatformUrl, label: T.givingPlatformUrl.label, help: T.givingPlatformUrl.help, optional: true }, giving),
    el("div", { className: "admin-settings__actions" }, save),
  );

  form.addEventListener("input", (event) => { if ((event.target as HTMLElement).matches?.("input[type=datetime-local]")) showEffect(); });
  const control = (f: SettingsField) => form.querySelector<Control>(`#${SETTINGS_ID[f]}`)!;
  const values = (): SettingsInput => {
    const money = (id: string) => dollarsToCents(parseWholeDollars(form.querySelector<HTMLInputElement>(`#${id}`)!.value) ?? 0);
    return {
      name: name.value, timeZone: zone.value,
      submissionsOpen: control("submissionsOpen").value, biddingOpens: control("biddingOpens").value, biddingCloses: control("biddingCloses").value,
      minStartingBidCents: money(SETTINGS_ID.minStartingBidCents), bidIncrementCents: money(SETTINGS_ID.bidIncrementCents),
      proofDeadlineDays: Number(days.value.trim()), givingPlatformUrl: giving.value,
    };
  };
  const showProblems = (list: readonly { field: string; message: string }[]) =>
    showServerProblems(form, list.flatMap((p) => (p.field in SETTINGS_ID ? [{ control: control(p.field as SettingsField), message: p.message }] : [])));

  let saving = false;
  const send = async (input: SettingsInput) => {
    const done = await host.post({ action: "save-settings", settings: input });
    host.redraw(settingsSection(done.answer as AdminSettings, host, true));
    showToast(done.message, { tone: "success" });
    host.refreshApp("[data-settings-save]");
  };
  /** Turns a refusal into what the person sees: problems under fields, a reload, or an alert. */
  const failedWith = async (error: unknown) => {
    const status = statusOf(error);
    if (status === 403) return host.denied();
    const problems = problemsOf(error);
    if (status === 422 && problems) return showProblems(problems);
    if (status === 404 || status === 409) return host.reloadWith(`${messageOf(error)} The settings have been reloaded.`);
    host.alert(messageOf(error));
  };

  enhanceForm(form, {
    onValid: () => void (async () => {
      if (saving) return;
      const input = values();
      const checked = checkSettings(input);
      if ("problems" in checked) return showProblems(checked.problems);
      const after = phaseFor(input, now()) ?? before;
      const words = phaseChange(before, after);
      if (words) {
        let refusal: unknown = null;
        await confirmDialog({
          variant: words.variant, title: words.title, body: words.body, confirmLabel: words.confirmLabel, cancelLabel: "Keep editing", busyLabel: "Saving…",
          onConfirm: async () => {
            try { await send(input); } catch (error) {
              if (statusOf(error) === undefined || statusOf(error)! >= 500) throw error; // shown in the dialog; they can retry
              refusal = error;
            }
          },
        });
        if (refusal) await failedWith(refusal);
        return;
      }
      saving = true;
      setBusy(save, true, "Saving…");
      try { await send(input); } catch (error) {
        setBusy(save, false, "Save settings");
        await failedWith(error);
      } finally { saving = false; }
    })(),
  });
  if (focusSave) queueMicrotask(() => save.focus());

  return [
    el("p", { className: "admin-glance", text: "Dates are entered in the event's time zone. Everyone else sees times in their own." }),
    el("div", { className: "admin-alert", attrs: { "data-admin-alert": "" } }),
    form,
  ];
}

// ---------------------------------------------------------------------------------------------
// Email templates

interface Draft { subject: string; body: string; field: "subject" | "body" }

/** Open editors and their unsaved words, kept across redraws (saving another template, say). */
export interface TemplateState { drafts: Map<string, Draft> }

function editor(t: AdminTemplate, answer: AdminTemplates, draft: Draft, state: TemplateState, host: SectionHost, redraw: (answer: AdminTemplates, focusId?: string) => void): HTMLElement {
  const allowed = t.variables.filter((v): v is Variable => (VARIABLES as readonly string[]).includes(v));
  const id = (s: string) => `template-${t.key}-${s}`;
  const subject = el("input", { className: "input", attrs: { id: id("subject"), name: "subject", type: "text", autocomplete: "off", spellcheck: "true", required: "", maxlength: String(TEMPLATE_LIMITS.subjectMax) } });
  subject.value = draft.subject;
  const body = el("textarea", { className: "input admin-template__body", attrs: { id: id("body"), name: "body", rows: "10", required: "", maxlength: String(TEMPLATE_LIMITS.bodyMax), spellcheck: "true" } });
  body.value = draft.body;

  const previewSubject = el("p", { className: "admin-template__preview-subject" });
  const previewBody = el("p", { className: "admin-template__preview-body" });
  const update = () => {
    draft.subject = subject.value;
    draft.body = body.value;
    const p = preview(subject.value, body.value);
    previewSubject.textContent = p.subject;
    previewBody.textContent = p.body;
  };
  update();

  // Variables are checked as they're typed (SPEC §7.7); empty fields only on save.
  const fullCheck = (which: "subject" | "body") => () =>
    templateProblems({ subject: subject.value, body: body.value }, allowed).filter((p) => p.field === which).map((p) => p.message).join(" ");
  registerCheck(subject, fullCheck("subject"));
  registerCheck(body, fullCheck("body"));
  for (const [control, which] of [[subject, "subject"], [body, "body"]] as const) {
    control.addEventListener("input", () => {
      update();
      setFieldMessage(control, liveProblems(control.value, allowed) ?? "");
    });
    control.addEventListener("focus", () => { draft.field = which; });
    if (draft.subject !== t.subject || draft.body !== t.body) setFieldMessage(control, liveProblems(control.value, allowed) ?? "");
  }

  // Insert variable: a disclosure listing only this template's variables; the chosen one goes
  // in at the cursor of the field last used (the body to start), which gets focus back.
  const menuId = id("variables");
  const menuToggle = el("button", { className: "btn btn--secondary", attrs: { type: "button", "aria-expanded": "false", "aria-controls": menuId } },
    el("span", { text: "Insert variable" }), icon("chevron-down"));
  const menu = el("ul", { className: "admin-template__variables", attrs: { id: menuId, hidden: "" } },
    ...allowed.map((v) => {
      const choose = el("button", { className: "btn btn--quiet btn--sm admin-template__variable", attrs: { type: "button" } },
        el("span", {}, el("code", { text: token(v) }), el("span", { className: "admin-template__variable-text", text: ` ${VARIABLE_TEXT[v]}` })));
      choose.addEventListener("click", () => {
        const target = draft.field === "subject" ? subject : body;
        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? start;
        const next = insertAt(target.value, start, end, v);
        target.value = next.text;
        close();
        target.focus();
        target.setSelectionRange(next.cursor, next.cursor);
        target.dispatchEvent(new Event("input", { bubbles: true }));
      });
      return el("li", {}, choose);
    }));
  const close = () => { menu.hidden = true; menuToggle.setAttribute("aria-expanded", "false"); };
  menuToggle.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuToggle.setAttribute("aria-expanded", String(open));
    if (open) menu.querySelector<HTMLButtonElement>("button")?.focus();
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
    menuToggle.focus();
  });

  const save = el("button", { className: "btn", attrs: { type: "submit" }, text: "Save template" });
  const discard = el("button", { className: "btn btn--secondary", attrs: { type: "button" } }, "Discard changes", el("span", { className: "visually-hidden", text: ` (${t.label})` }));
  discard.addEventListener("click", () => {
    state.drafts.delete(t.key);
    redraw(answer, `template-${t.key}-edit`);
  });

  const form = el("form", { className: "admin-template__editor", attrs: { "aria-label": `Edit the ${t.label} template`, novalidate: "" } },
    el("div", { className: "admin-template__fields" },
      el("div", { className: "field", attrs: { "data-message-name": "a subject" } }, el("label", { className: "field__label", attrs: { for: id("subject") }, text: "Subject" }), subject),
      el("div", { className: "field", attrs: { "data-message-name": "a body" } },
        el("label", { className: "field__label", attrs: { for: id("body") }, text: "Body" }),
        el("p", { className: "field__help", attrs: { id: id("body-help") }, text: "Plain text. Variables are written like {{first_name}}; use Insert variable to add one where the cursor is." }),
        body),
      el("div", { className: "admin-template__insert" }, menuToggle, menu)),
    el("section", { className: "admin-template__preview", attrs: { "aria-labelledby": id("preview") } },
      el("h4", { className: "admin-template__preview-title", attrs: { id: id("preview") }, text: "Preview with sample data" }),
      previewSubject, previewBody),
    el("div", { className: "admin-template__actions" }, save, discard));
  body.setAttribute("aria-describedby", id("body-help"));

  let saving = false;
  enhanceForm(form, {
    onValid: () => void (async () => {
      if (saving) return;
      saving = true;
      setBusy(save, true, "Saving…");
      try {
        const done = await host.post({ action: "save-template", key: t.key, subject: subject.value, body: body.value });
        state.drafts.delete(t.key);
        redraw(done.answer as AdminTemplates, `template-${t.key}-title`);
        showToast(done.message, { tone: "success" });
      } catch (error) {
        setBusy(save, false, "Save template");
        const status = statusOf(error);
        const problems = problemsOf(error);
        if (status === 403) host.denied();
        else if (status === 422 && problems) showServerProblems(form, problems.map((p) => ({ control: p.field === "subject" ? subject : body, message: p.message })));
        else if (status === 404) { state.drafts.delete(t.key); await host.reloadWith(`${messageOf(error)} The list has been updated.`); }
        else host.alert(messageOf(error));
      } finally { saving = false; }
    })(),
  });
  return form;
}

export function templatesSection(answer: AdminTemplates, state: TemplateState, host: SectionHost, focusId?: string): Node[] {
  const redraw = (next: AdminTemplates, focus?: string) => host.redraw(templatesSection(next, state, host, focus));
  const cards = answer.templates.map((t) => {
    const status = templateStatus(t.isDefault);
    const titleId = `template-${t.key}-title`;
    const draft = state.drafts.get(t.key);
    const card = el("li", { className: "card card--flat admin-template", attrs: { "aria-labelledby": titleId } },
      el("div", { className: "admin-item__head" },
        el("h4", { className: "admin-item__title", attrs: { id: titleId, tabindex: "-1" }, text: t.label }),
        pill(status.label, status.tone)),
      el("p", { className: "admin-item__donor", text: TEMPLATE_WHEN[t.key] ?? "" }),
      el("p", { className: "admin-template__subject" }, el("span", { className: "admin-template__subject-label", text: "Subject: " }), t.subject));
    const buttons: HTMLElement[] = [];
    if (!draft) {
      const edit = el("button", { className: "btn btn--secondary", attrs: { type: "button", id: `template-${t.key}-edit` } }, "Edit template", el("span", { className: "visually-hidden", text: ` (${t.label})` }));
      edit.addEventListener("click", () => {
        state.drafts.set(t.key, { subject: t.subject, body: t.body, field: "body" });
        redraw(answer, `template-${t.key}-subject`);
      });
      buttons.push(edit);
    }
    if (!t.isDefault) {
      const restore = el("button", { className: "btn btn--secondary", attrs: { type: "button" } }, "Restore default", el("span", { className: "visually-hidden", text: ` (${t.label})` }));
      restore.addEventListener("click", () => void (async () => {
        const words = restoreDialog(t.label);
        let next: AdminTemplates | null = null;
        let message = "";
        let gone = "";
        const done = await confirmDialog({
          variant: "danger", title: words.title, body: words.body, confirmLabel: words.confirmLabel, cancelLabel: words.cancelLabel, busyLabel: "Restoring…",
          onConfirm: async () => {
            try {
              const r = await host.post({ action: "restore-template", key: t.key });
              next = r.answer as AdminTemplates;
              message = r.message;
            } catch (error) {
              if (statusOf(error) === 404) { gone = messageOf(error); return; }
              throw error;
            }
          },
        });
        if (done && next) {
          state.drafts.delete(t.key);
          redraw(next, titleId);
          showToast(message, { tone: "success" });
        } else if (gone) await host.reloadWith(`${gone} The list has been updated.`);
      })());
      buttons.push(restore);
    }
    if (buttons.length) card.append(el("div", { className: "admin-item__actions" }, ...buttons));
    if (draft) card.append(editor(t, answer, draft, state, host, redraw));
    return card;
  });
  if (focusId) queueMicrotask(() => document.getElementById(focusId)?.focus());
  const edited = answer.templates.filter((t) => !t.isDefault).length;
  return [
    el("p", { className: "admin-glance", text: `${answer.templates.length} templates, ${edited === 0 ? "none" : edited} edited. This demo never sends email; the preview shows sample data in place of each variable.` }),
    el("div", { className: "admin-alert", attrs: { "data-admin-alert": "" } }),
    el("ul", { className: "admin-items__list" }, ...cards),
  ];
}
