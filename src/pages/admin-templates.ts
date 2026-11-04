// The Admin Dashboard's Email templates editor (SPEC §7.7; DECISIONS #116). Drawn by
// src/pages/admin.ts, which owns loading, alerts and focus. Split from admin-settings.ts.
import type { AdminTemplate, AdminTemplates } from "../admin-api.ts";
import { confirmDialog } from "../components/dialog.ts";
import { el } from "../components/dom.ts";
import { pill } from "../components/pill.ts";
import { enhanceForm, registerCheck, setFieldMessage, showServerProblems } from "../components/forms.ts";
import { icon } from "../components/icons.ts";
import { insertAt, TEMPLATE_LIMITS, templateProblems, token, VARIABLES, type Variable } from "../components/template-rules.ts";
import { showToast } from "../components/toast.ts";
import { liveProblems, preview, restoreDialog, TEMPLATE_WHEN, templateStatus, VARIABLE_TEXT } from "./admin-settings-rules.ts";
import { messageOf, problemsOf, setBusy, statusOf, type SectionHost } from "./admin-section.ts";

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
