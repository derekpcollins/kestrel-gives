// The Admin Dashboard's Reset for next year section (SPEC §7.8; DECISIONS #118). Drawn by
// src/pages/admin.ts from the summary answer, which carries the lock and what a Reset would
// delete. Locked: when it unlocks, no button. Ready: a danger button and the type-to-confirm
// dialog. After a Reset on the shared demo the offer to restore it comes first.
import type { AdminSummary } from "../admin-api.ts";
import { confirmDialog } from "../components/dialog.ts";
import { el } from "../components/dom.ts";
import { icon } from "../components/icons.ts";
import { renderResetOffer } from "../components/reset-offer.ts";
import { showToast } from "../components/toast.ts";
import { resetDeletes, resetDialog, resetKeeps, resetStatus } from "./admin-reset-rules.ts";
import type { SectionHost } from "./admin-settings.ts";

const pill = (label: string, tone: string) => el("span", { className: `pill${tone === "neutral" ? "" : ` pill--${tone}`}`, text: label });
const statusOf = (error: unknown) => (error as { status?: number }).status;
const codeOf = (error: unknown) => (error as { code?: string }).code;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong. Please try again.");

/** The offer shown on an admin section while the demo is just reset; focus goes to the section title after a Restore. */
export function adminResetOffer(summary: Pick<AdminSummary, "event">): HTMLElement {
  return renderResetOffer({ eventName: summary.event.name, forAdmin: true, level: 3, focusAfter: () => document.getElementById("admin-section-title") });
}

export function resetSection(summary: AdminSummary, host: SectionHost): Node[] {
  const status = resetStatus(summary);
  const list = (id: string, title: string, items: string[]) =>
    el("section", { className: "admin-reset__list", attrs: { "aria-labelledby": id } },
      el("h4", { className: "admin-reset__list-title", text: title, attrs: { id } }),
      el("ul", {}, ...items.map((t) => el("li", { text: t }))));

  const card = el("div", { className: "card card--flat admin-reset" },
    el("div", { className: "admin-reset__head" },
      el("h3", { className: "admin-reset__title", text: summary.event.name, attrs: { id: "reset-event-title" } }),
      pill(status.pill.label, status.pill.tone)),
    el("p", { className: "admin-reset__status", attrs: { "data-reset-status": "" } }, icon(summary.reset.unlocked ? "alert" : "clock", { size: "sm" }), el("span", { text: status.text })),
    el("div", { className: "admin-reset__lists" },
      list("reset-deletes", "Reset deletes", resetDeletes(summary.reset.counts)),
      list("reset-keeps", "Reset keeps", resetKeeps(summary.event.name, summary.reset.nextName))),
    el("p", { className: "admin-reset__note", text: "The demo is shared, so a Reset empties it for everyone until someone restores the demo data." }),
  );

  if (summary.reset.unlocked) {
    const words = resetDialog(summary);
    const button = el("button", { className: "btn btn--danger", attrs: { type: "button", "data-reset-start": "" } }, "Reset for next year");
    button.addEventListener("click", () => void (async () => {
      let answer: AdminSummary | null = null;
      let message = "";
      let refusal: unknown = null;
      await confirmDialog({
        variant: "type-to-confirm", title: words.title, body: words.body, confirmLabel: words.confirmLabel, busyLabel: words.busyLabel, confirmText: words.confirmText,
        onConfirm: async () => {
          try {
            const r = await host.post({ action: "reset-year", confirmName: summary.event.name });
            answer = r.answer as AdminSummary;
            message = r.message;
          } catch (error) {
            // Busy (someone else is changing the demo), a wrong name or a failure: shown in the
            // dialog, which stays open to retry. Locked, gone or not an admin: close and reload.
            const status = statusOf(error);
            if (status === 403 || status === 404 || (status === 409 && codeOf(error) !== "busy")) { refusal = error; return; }
            throw error;
          }
        },
      });
      if (answer) {
        const done: AdminSummary = answer;
        const nodes = resetSection(done, host);
        host.redraw(nodes);
        const title = document.querySelector<HTMLElement>("[data-reset-offer] .banner__title");
        title?.setAttribute("tabindex", "-1");
        title?.focus();
        showToast(message, { tone: "success" });
        // The header, banner and phase follow the new event; then focus goes to the offer.
        host.refreshApp("[data-reset-offer] .banner__title");
      } else if (refusal) {
        if (statusOf(refusal) === 403) return host.denied();
        await host.reloadWith(`${messageOf(refusal)} The section has been reloaded.`);
      }
    })());
    card.append(el("div", { className: "admin-reset__actions" }, button));
  }

  return [
    ...(summary.demoReset ? [adminResetOffer(summary)] : []),
    el("p", { className: "admin-glance", text: "Once a year, after proofs are in: clear this year's auction and start the next one." }),
    el("div", { className: "admin-alert", attrs: { "data-admin-alert": "" } }),
    card,
  ];
}
