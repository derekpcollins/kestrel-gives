// The Admin Dashboard (SPEC §8; DECISIONS #112). One page for every section: `/admin` (Totals),
// `/admin/people`, …, rewritten to admin.html, which reads its section from the path. The
// section nav is plain links with aria-current (DECISIONS entry 59). Employees see why they
// can't use it, both from the app state and from the API's 403. Redraws when the demo bar
// changes who's viewing or the phase; only the newest answer is drawn.
import type { AdminPeople, AdminProof, AdminProofs, AdminSummary } from "../admin-api.ts";
import type { AppState } from "../app-state.ts";
import { renderAvatar } from "../components/avatar.ts";
import { el } from "../components/dom.ts";
import { hydrateIcons, icon } from "../components/icons.ts";
import { confirmDialog } from "../components/dialog.ts";
import { enhanceTableScroll } from "../components/table.ts";
import { showToast } from "../components/toast.ts";
import {
  deadlineLine, GENERAL_DESCRIPTION, gapText, glanceLine, groupProofs, proofReview, queueLine, rejectDialog, initials, leadingBids, money, NOT_ADMIN, pageTitle, proofCell, SECTIONS, sectionFor, totalCards, TOTALS_KEY, type Section,
} from "./admin-rules.ts";

const pill = (label: string, tone: string) => el("span", { className: `pill${tone === "neutral" ? "" : ` pill--${tone}`}`, text: label });

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

/** What a proof card's buttons do; the page supplies them so the card stays a drawing. */
interface ProofActions {
  approve(proof: AdminProof, button: HTMLButtonElement): void;
  reject(proof: AdminProof): void;
}

let shotCount = 0;

function proofCard(p: AdminProof, answer: AdminProofs, actions: ProofActions): HTMLLIElement {
  const t = proofReview(p, { now: new Date(answer.now), deadline: answer.proofDeadline });
  const headingId = `proof-${p.id}-name`;
  const panelId = `proof-shot-${++shotCount}`;
  const toggle = el("button", { className: "btn btn--secondary btn--sm proof-review__toggle", attrs: { type: "button", "aria-expanded": "false", "aria-controls": panelId } },
    "View larger", el("span", { className: "visually-hidden", text: ` screenshot from ${t.name}` }));
  const large = el("figure", { className: "proof-review__large", attrs: { id: panelId, hidden: "" } },
    el("img", { className: "proof-review__large-img", attrs: { src: p.imageUrl, alt: `${t.shotAlt}, larger`, loading: "lazy" } }));
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    large.hidden = !open;
    toggle.firstChild!.textContent = open ? "View smaller" : "View larger";
  });

  const card = el("li", { className: `card card--flat proof-review proof-review--${p.status}`, attrs: { "aria-labelledby": headingId } },
    el("div", { className: "proof-review__head" },
      renderAvatar(initials(p.person.firstName, p.person.lastName), { size: "sm" }),
      el("h3", { className: "proof-review__name", text: t.name, attrs: { id: headingId } }),
      pill(t.status.label, t.status.tone),
    ),
    el("p", { className: "proof-review__uploaded", text: t.uploaded }),
    el("div", { className: "proof-review__main" },
      el("img", { className: "proof-review__thumb", attrs: { src: p.imageUrl, alt: t.shotAlt, loading: "lazy" } }),
      el("div", { className: "proof-review__details" },
        el("dl", { className: "proof-review__figures" },
          el("div", {}, el("dt", { text: "Amount donated" }), el("dd", { className: "proof-review__amount", text: t.amount })),
          el("div", {}, el("dt", { text: "Donation total" }), el("dd", { className: "proof-review__amount", text: t.total })),
        ),
        ...t.notes.map((n) => el("p", { className: `proof-review__note proof-review__note--${n.tone}` }, icon(n.tone === "warning" ? "alert" : "info", { size: "sm" }), el("span", { text: n.text }))),
        ...(t.reviewed ? [el("p", { className: "proof-review__reviewed", text: t.reviewed })] : []),
        ...(t.reason ? [el("p", { className: "proof-review__reason", text: t.reason })] : []),
        toggle,
      ),
    ),
    large,
  );
  if (t.canReview) {
    const approve = el("button", { className: "btn", attrs: { type: "button" } }, "Approve", el("span", { className: "visually-hidden", text: ` ${t.name}'s proof` }));
    const reject = el("button", { className: "btn btn--secondary", attrs: { type: "button" } }, "Reject", el("span", { className: "visually-hidden", text: ` ${t.name}'s proof` }));
    approve.addEventListener("click", () => actions.approve(p, approve));
    reject.addEventListener("click", () => actions.reject(p));
    card.append(el("div", { className: "proof-review__actions" }, approve, reject));
  } else if (t.instead) {
    // Reverse a decision (owner, 6C review): secondary, since it overturns one already made.
    // Shown "Approve instead"; read "Approve Owen Achterberg's proof instead".
    const button = el("button", { className: "btn btn--secondary", attrs: { type: "button" } },
      t.instead === "approve" ? "Approve" : "Reject", el("span", { className: "visually-hidden", text: ` ${t.name}'s proof` }), " instead");
    button.addEventListener("click", () => (t.instead === "approve" ? actions.approve(p, button) : actions.reject(p)));
    card.append(el("div", { className: "proof-review__actions" }, button));
  }
  return card;
}

function proofs(answer: AdminProofs, actions: ProofActions): Node[] {
  const { waiting, reviewed } = groupProofs(answer.proofs);
  const group = (id: string, title: string, list: AdminProof[], empty: string) =>
    el("section", { className: "proof-queue", attrs: { "aria-labelledby": id } },
      el("h3", { className: "proof-queue__title", text: `${title} (${list.length})`, attrs: { id } }),
      list.length ? el("ul", { className: "proof-queue__list" }, ...list.map((p) => proofCard(p, answer, actions))) : el("p", { className: "admin-glance", text: empty }),
    );
  return [
    el("p", { className: "admin-glance", text: `${queueLine(answer.proofs)}. ${deadlineLine(answer.proofDeadline, new Date(answer.now))}` }),
    el("div", { className: "admin-alert", attrs: { "data-admin-alert": "" } }),
    group("queue-waiting", "Waiting for review", waiting, "Nothing is waiting for review."),
    group("queue-reviewed", "Reviewed", reviewed, answer.proofs.length ? "Nothing reviewed yet." : "No one has uploaded proof yet. Proofs show up here when people upload them."),
  ];
}

/** POST /api/admin; resolves with the answer, or throws an Error with the message to show. */
async function post(body: Record<string, unknown>): Promise<{ message: string; answer: unknown }> {
  let response: Response;
  try {
    response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  } catch {
    throw new Error("We couldn't reach the server. Check your connection and try again.");
  }
  const json = (await response.json().catch(() => ({}))) as { message?: string; error?: string; answer?: unknown };
  if (!response.ok) throw Object.assign(new Error(json.error ?? "Something went wrong. Please try again."), { status: response.status });
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
    const view = section.key === "totals" ? "summary" : section.key;  // people, proofs
    let status: number | null = null;
    let answer: unknown = null;
    try {
      const response = await fetch(`/api/admin?view=${view}`, { headers: { Accept: "application/json" }, credentials: "same-origin" });
      status = response.status;
      answer = response.ok ? await response.json() : (await response.text().catch(() => ""), null);
    } catch {
      status = null;
    }
    if (request !== latest) return;
    content.removeAttribute("aria-busy");
    if (status === 403) return showDenied();
    if (!answer) {
      content.replaceChildren();
      failed.hidden = false;
      return;
    }
    failed.hidden = true;
    content.replaceChildren(...(section.key === "totals" ? totals(answer as AdminSummary)
      : section.key === "people" ? people(answer as AdminPeople)
      : proofs(answer as AdminProofs, actions)));
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

  failed.querySelector("button")?.addEventListener("click", () => void load());
  document.addEventListener("kg:state", (event) => {
    const state = (event as CustomEvent<AppState>).detail;
    if (!state.viewer) return;
    if (state.viewer.role !== "admin") showDenied();
    else void load();
  });
}
