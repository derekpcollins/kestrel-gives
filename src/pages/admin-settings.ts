// The Admin Dashboard's Event settings form (SPEC §7.1; DECISIONS #116, #117). Drawn by
// src/pages/admin.ts, which owns loading, alerts and focus. The words and choices are in
// admin-settings-rules.ts; the field rules are shared with the server.
import type { AdminSettings } from "../admin-api.ts";
import { confirmDialog } from "../components/dialog.ts";
import { el } from "../components/dom.ts";
import { dollarsToCents, parseWholeDollars } from "../components/form-rules.ts";
import { enhanceForm, showServerProblems, type Control } from "../components/forms.ts";
import { icon } from "../components/icons.ts";
import { checkSettings, SETTINGS_LIMITS, type SettingsField, type SettingsInput } from "../components/settings-rules.ts";
import { showToast } from "../components/toast.ts";
import { PHASE_NAMES, phaseChange, phaseFor, SETTINGS_TEXT, timeZones, zoneEffect, zoneHelp } from "./admin-settings-rules.ts";
import { messageOf, problemsOf, setBusy, statusOf, type SectionHost } from "./admin-section.ts";

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
