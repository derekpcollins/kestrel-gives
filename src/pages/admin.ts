// The Admin Dashboard (SPEC §8; DECISIONS #112). One page for every section: `/admin` (Totals),
// `/admin/people`, …, rewritten to admin.html, which reads its section from the path. The
// section nav is plain links with aria-current (DECISIONS entry 59). Employees see why they
// can't use it, both from the app state and from the API's 403. Redraws when the demo bar
// changes who's viewing or the phase; only the newest answer is drawn.
import type { AdminPeople, AdminSummary } from "../admin-api.ts";
import type { AppState } from "../app-state.ts";
import { renderAvatar } from "../components/avatar.ts";
import { el } from "../components/dom.ts";
import { hydrateIcons, icon } from "../components/icons.ts";
import { enhanceTableScroll } from "../components/table.ts";
import {
  GENERAL_DESCRIPTION, gapText, glanceLine, initials, leadingBids, money, NOT_ADMIN, pageTitle, proofCell, SECTIONS, sectionFor, totalCards, TOTALS_KEY, type Section,
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
        el("div", { className: "total-card__figure" }, el("dt", { text: "Pledged" }), el("dd", { className: "total-card__amount", text: c.pledged })),
        el("div", { className: "total-card__figure" }, el("dt", { text: "Confirmed" }), el("dd", { className: "total-card__amount total-card__amount--confirmed", text: c.confirmed })),
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
    const cell = proofCell(p);
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
    const view = section.key === "totals" ? "summary" : section.key;
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
    content.replaceChildren(...(section.key === "totals" ? totals(answer as AdminSummary) : people(answer as AdminPeople)));
    hydrateIcons(content);
  };

  failed.querySelector("button")?.addEventListener("click", () => void load());
  document.addEventListener("kg:state", (event) => {
    const state = (event as CustomEvent<AppState>).detail;
    if (!state.viewer) return;
    if (state.viewer.role !== "admin") showDenied();
    else void load();
  });
}
