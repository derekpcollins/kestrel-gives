// The Admin Dashboard (SPEC §8; DECISIONS #112). One page for every section: `/admin` (Totals),
// `/admin/people`, …, rewritten to admin.html, which reads its section from the path. The
// section nav is plain links with aria-current (DECISIONS entry 59). Employees see why they
// can't use it, both from the app state and from the API's 403. Redraws when the demo bar
// changes who's viewing or the phase; only the newest answer is drawn.
import type { AdminItems, AdminPeople, AdminProof, AdminProofs, AdminSettings, AdminSummary, AdminTemplates } from "../admin-api.ts";
import type { AppState } from "../app-state.ts";
import { renderAvatar } from "../components/avatar.ts";
import { el } from "../components/dom.ts";
import { pill } from "../components/pill.ts";
import { hydrateIcons, icon } from "../components/icons.ts";
import { confirmDialog } from "../components/dialog.ts";
import { enhanceTableScroll } from "../components/table.ts";
import { fetchWithTimeout, pageLoading } from "../components/loading.ts";
import { showToast } from "../components/toast.ts";
import { GENERAL_DESCRIPTION, gapText, glanceLine, rejectDialog, initials, leadingBids, money, NOT_ADMIN, pageTitle, proofCell, SECTIONS, sectionFor, totalCards, TOTALS_KEY, type Section } from "./admin-rules.ts";
import { cancelItemDialog, cancelPurchaseDialog, removeBidDialog } from "./admin-items-rules.ts";
import { adminResetOffer, resetSection } from "./admin-reset.ts";
import type { SectionHost } from "./admin-section.ts";
import { settingsSection } from "./admin-settings.ts";
import { templatesSection, type TemplateState } from "./admin-templates.ts";
import { proofs, type ProofActions } from "./admin-proofs.ts";
import { items, type ItemActions } from "./admin-items.ts";


function nav(current: Section): HTMLLIElement[] {
  return SECTIONS.map((s) => {
    const link = el("a", { className: "admin-nav__link", text: s.label, attrs: { href: s.href } });
    if (s.key === current.key) link.setAttribute("aria-current", "page");
    return el("li", {}, link);
  });
}

function totals(summary: AdminSummary): Node[] {
  const cards = totalCards(summary).map((c) =>
    el("li", { className: `card card--flat total-card total-card--${c.key}` },
      el("h3", { className: "total-card__title", text: c.title, attrs: { id: `total-${c.key}` } }),
      el("dl", { className: "total-card__figures", attrs: { "aria-labelledby": `total-${c.key}` } },
        el("div", { className: "total-card__figure" }, el("dt", { text: "Pledged" }), el("dd", { className: `total-card__amount${c.pledgedZero ? " total-card__amount--zero" : ""}`, text: c.pledged })),
        el("div", { className: "total-card__figure" }, el("dt", { text: "Confirmed" }), el("dd", { className: `total-card__amount ${c.confirmedZero ? "total-card__amount--zero" : "total-card__amount--confirmed"}`, text: c.confirmed })),
      ),
    ));
  const nodes: Node[] = [
    // After a Reset on the shared demo, offer Restore right away (SPEC v1.17 §7.8).
    ...(summary.demoReset ? [adminResetOffer(summary)] : []),
    el("p", { className: "admin-glance", text: glanceLine(summary) }),
    el("ul", { className: "total-cards", attrs: { "aria-label": "Totals by sale type" } }, ...cards),
    el("p", { className: "admin-gap" }, icon("info", { size: "sm" }), el("span", { text: gapText(summary) })),
    el("dl", { className: "admin-key" },
      el("div", {}, el("dt", { text: "Pledged" }), el("dd", { text: TOTALS_KEY.pledged })),
      el("div", {}, el("dt", { text: "Confirmed" }), el("dd", { text: TOTALS_KEY.confirmed })),
    ),
  ];
  const leading = leadingBids(summary);
  if (leading) {
    nodes.push(el("section", { className: "leading-note", attrs: { "aria-labelledby": "leading-title" } },
      icon("clock"),
      el("div", { className: "leading-note__body" },
        el("h3", { className: "leading-note__title", text: leading.title, attrs: { id: "leading-title" } }),
        el("p", { className: "leading-note__amount", text: leading.amount }),
        el("p", { className: "leading-note__text", text: leading.text }),
      ),
    ));
  }
  return nodes;
}

function people(answer: AdminPeople): Node[] {
  const head = el("tr", {},
    ...["Person", "Bids", "Wins", "Purchases", "Donation total", "Proof"].map((h, i) =>
      el("th", { text: h, attrs: { scope: "col" }, className: i >= 1 && i <= 4 ? "table__num" : "" })),
  );
  const rows = answer.people.map((p) => {
    const cell = proofCell(p, { phase: answer.phase, deadline: answer.proofDeadline, now: new Date(answer.now) });
    const name = el("th", { attrs: { scope: "row" } },
      el("span", { className: "admin-person" },
        renderAvatar(initials(p.firstName, p.lastName), { size: "sm" }),
        el("span", { className: "admin-person__name", text: `${p.firstName} ${p.lastName}` }),
        ...(p.role === "admin" ? [pill("Admin", "neutral")] : []),
      ),
    );
    return el("tr", {},
      name,
      el("td", { className: "table__num", text: String(p.bidCount) }),
      el("td", { className: "table__num", text: String(p.wins) }),
      el("td", { className: "table__num", text: String(p.purchases) }),
      el("td", { className: "table__num", text: money(p.totalCents) }),
      el("td", {}, el("span", { className: "admin-proof" }, pill(cell.label, cell.tone), ...(cell.detail ? [el("span", { className: "admin-proof__detail", text: cell.detail })] : []))),
    );
  });
  const wrap = el("div", { className: "table-wrap", attrs: { role: "region", "aria-labelledby": "admin-section-title", "data-table-scroll": "" } },
    el("table", { className: "table admin-people" }, el("thead", {}, head), el("tbody", {}, ...rows)),
  );
  enhanceTableScroll(wrap);
  return [el("p", { className: "admin-glance", text: `${answer.people.length} people. Admins bid and buy too, so they're listed.` }), wrap];
}


/** POST /api/admin; resolves with the answer, or throws an Error with the message to show. */
async function post(body: Record<string, unknown>): Promise<{ message: string; answer: unknown }> {
  let response: Response;
  try {
    response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  } catch {
    throw new Error("We couldn't reach the server. Check your connection and try again.");
  }
  const json = (await response.json().catch(() => ({}))) as { message?: string; error?: string; answer?: unknown; problems?: unknown; code?: string };
  if (!response.ok) throw Object.assign(new Error(json.error ?? "Something went wrong. Please try again."), { status: response.status, problems: json.problems, code: json.code });
  return { message: json.message ?? "Done.", answer: json.answer };
}

export function startAdminPage(): void {
  const main = document.querySelector<HTMLElement>("[data-admin-page]");
  if (!main) return;
  const $ = <T extends HTMLElement>(selector: string) => main.querySelector<T>(selector)!;
  const body = $<HTMLElement>("[data-admin-body]");
  const denied = $<HTMLElement>("[data-admin-denied]");
  const content = $<HTMLElement>("[data-admin-content]");
  const failed = $<HTMLElement>("[data-admin-error]");
  const section = sectionFor(location.pathname) ?? SECTIONS[0]!;

  document.title = pageTitle(section);
  $<HTMLElement>("[data-admin-description]").textContent = section.description;
  $<HTMLElement>("[data-admin-section-title]").textContent = section.label;
  $<HTMLElement>("[data-admin-nav]").replaceChildren(...nav(section));
  $<HTMLElement>("[data-admin-denied-title]").textContent = NOT_ADMIN.title;
  $<HTMLElement>("[data-admin-denied-text]").textContent = NOT_ADMIN.text;

  let latest = 0;
  const description = $<HTMLElement>("[data-admin-description]");
  const showDenied = () => {
    latest++; // drop any answer still on its way
    pageLoading(false);
    document.title = "Admin Dashboard · Kestrel Gives";
    description.textContent = GENERAL_DESCRIPTION;
    body.hidden = true;
    denied.hidden = false;
  };

  const load = async () => {
    const request = ++latest;
    document.title = pageTitle(section);
    description.textContent = section.description;
    denied.hidden = true;
    body.hidden = false;
    content.setAttribute("aria-busy", "true");
    const view = section.key === "totals" || section.key === "reset" ? "summary" : section.key;  // people, proofs, items, settings, templates
    let status: number | null = null;
    let answer: unknown = null;
    try {
      const response = await fetchWithTimeout(`/api/admin?view=${view}`, { headers: { Accept: "application/json" }, credentials: "same-origin" });
      status = response.status;
      answer = response.ok ? await response.json() : (await response.text().catch(() => ""), null);
    } catch {
      status = null;
    }
    if (request !== latest) return;
    content.removeAttribute("aria-busy");
    pageLoading(false);
    if (status === 403) return showDenied();
    if (!answer) {
      content.replaceChildren();
      failed.hidden = false;
      return;
    }
    failed.hidden = true;
    content.replaceChildren(...(section.key === "totals" ? totals(answer as AdminSummary)
      : section.key === "people" ? people(answer as AdminPeople)
      : section.key === "proofs" ? proofs(answer as AdminProofs, actions)
      : section.key === "settings" ? settingsSection(answer as AdminSettings, host)
      : section.key === "templates" ? templatesSection(answer as AdminTemplates, templateState, host)
      : section.key === "reset" ? resetSection(answer as AdminSummary, host)
      : items(answer as AdminItems, itemActions)));
    hydrateIcons(content);
  };

  /** A refusal or failure, at the top of the section, read out; then the queue is reloaded. */
  const alertWith = (message: string) => {
    const box = content.querySelector<HTMLElement>("[data-admin-alert]");
    if (!box) return;
    const banner = el("div", { className: "banner banner--danger", attrs: { role: "alert", tabindex: "-1" } },
      icon("alert"), el("div", { className: "banner__body" }, el("p", { className: "banner__text", text: message })));
    box.replaceChildren(banner);
    banner.focus();
  };
  /**
   * After a decision: from the waiting queue, focus goes to its heading (the next proof);
   * after reversing a reviewed one, to that person's card, which stays in Reviewed.
   */
  const focusAfter = (proof: AdminProof) => {
    const target = proof.status === "pending" ? content.querySelector<HTMLElement>("#queue-waiting") : content.querySelector<HTMLElement>(`#proof-${proof.id}-name`);
    target?.setAttribute("tabindex", "-1");
    target?.focus();
  };
  const redrawProofs = (answer: AdminProofs) => {
    content.replaceChildren(...proofs(answer, actions));
    hydrateIcons(content);
  };
  const actions: ProofActions = {
    approve: async (proof, button) => {
      if (button.getAttribute("aria-busy") === "true") return;
      button.setAttribute("aria-busy", "true");
      button.setAttribute("aria-disabled", "true");
      try {
        const done = await post({ action: "approve-proof", proofId: proof.id, totalCents: proof.totalCents, fromStatus: proof.status });
        redrawProofs(done.answer as AdminProofs);
        showToast(done.message, { tone: "success" });
        focusAfter(proof);
      } catch (error) {
        button.removeAttribute("aria-busy");
        button.removeAttribute("aria-disabled");
        const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
        const status = (error as { status?: number }).status;
        if (status === 403) return showDenied();
        if (status === 409 || status === 404) {
          await load();
          alertWith(`${message} The queue has been updated.`);
        } else alertWith(message);
      }
    },
    reject: async (proof) => {
      const words = rejectDialog(proof);
      let answer: AdminProofs | null = null;
      let message = "";
      let stale = false;
      const done = await confirmDialog({
        variant: "danger", title: words.title, body: words.body, confirmLabel: words.confirmLabel, busyLabel: "Rejecting…",
        reason: { label: words.label, help: words.help, maxLength: words.maxLength, check: words.check },
        onConfirm: async (reason) => {
          try {
            const r = await post({ action: "reject-proof", proofId: proof.id, reason, fromStatus: proof.status });
            answer = r.answer as AdminProofs;
            message = r.message;
          } catch (error) {
            const status = (error as { status?: number }).status;
            if (status === 409 || status === 404) stale = true;
            throw error;
          }
        },
      });
      if (done && answer) {
        redrawProofs(answer);
        showToast(message, { tone: "success" });
        focusAfter(proof);
      } else if (stale) {
        await load();
      }
    },
  };

  const redrawItems = (answer: AdminItems) => {
    content.replaceChildren(...items(answer, itemActions));
    hydrateIcons(content);
  };
  const focusItem = (id: string) => content.querySelector<HTMLElement>(`#item-${id}-title`)?.focus();
  /** Remove bid and Cancel item: a danger dialog, then the list redraws from the answer. */
  const confirmThenPost = async (words: { title: string; body: string; confirmLabel: string; cancelLabel: string }, busyLabel: string, body: Record<string, unknown>, itemId: string) => {
    let answer: AdminItems | null = null;
    let message = "";
    let stale = false;
    let staleMessage = "";
    const done = await confirmDialog({
      variant: "danger", title: words.title, body: words.body, confirmLabel: words.confirmLabel, cancelLabel: words.cancelLabel, busyLabel,
      onConfirm: async () => {
        try {
          const r = await post(body);
          answer = r.answer as AdminItems;
          message = r.message;
        } catch (error) {
          const status = (error as { status?: number }).status;
          if (status === 409 || status === 404) { stale = true; staleMessage = error instanceof Error ? error.message : ""; return; }
          throw error;
        }
      },
    });
    if (done && answer) {
      redrawItems(answer);
      showToast(message, { tone: "success" });
      focusItem(itemId);
    } else if (stale) {
      await load();
      alertWith(`${staleMessage} The list has been updated.`);
    }
  };
  const itemActions: ItemActions = {
    open: new Set<string>(),
    removeBid: (item, bid, phase) => void confirmThenPost(removeBidDialog(item, bid, phase), "Removing…", { action: "remove-bid", bidId: bid.id }, item.id),
    cancel: (item, phase) => void confirmThenPost(cancelItemDialog(item, phase), "Cancelling…", { action: "cancel-item", itemId: item.id }, item.id),
    cancelPurchase: (item, purchase, phase) => void confirmThenPost(cancelPurchaseDialog(item, purchase, phase), "Cancelling…", { action: "cancel-purchase", purchaseId: purchase.id }, item.id),
  };

  // Event settings and Email templates (src/pages/admin-settings.ts, admin-templates.ts).
  const templateState: TemplateState = { drafts: new Map() };
  /** After saving settings or a Reset the app state is fetched again; its redraw puts focus back here (a selector). */
  let refocus: string | null = null;
  const host: SectionHost = {
    post,
    reloadWith: async (message) => { await load(); alertWith(message); },
    alert: (message) => alertWith(message),
    denied: () => showDenied(),
    redraw: (nodes) => { content.replaceChildren(...nodes); hydrateIcons(content); },
    refreshApp: (focus) => { refocus = focus; document.dispatchEvent(new CustomEvent("kg:refresh")); },
  };

  failed.querySelector("button")?.addEventListener("click", () => { failed.hidden = true; pageLoading(true); void load(); });
  document.addEventListener("kg:state", (event) => {
    const state = (event as CustomEvent<AppState>).detail;
    if (!state.viewer) return;
    if (state.viewer.role !== "admin") return showDenied();
    const focus = refocus;
    refocus = null;
    void load().then(() => {
      const target = focus ? content.querySelector<HTMLElement>(focus) : null;
      if (!target) return;
      if (!target.matches("button, input, select, textarea, a[href]") && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus();
    });
  });
}
