// The Admin Dashboard's proof review queue (SPEC §7.6, §8; DECISIONS #109): each proof as a card
// with Approve and Reject. A drawing only: src/pages/admin.ts supplies what the buttons do.
import type { AdminProof, AdminProofs } from "../admin-api.ts";
import { renderAvatar } from "../components/avatar.ts";
import { el } from "../components/dom.ts";
import { pill } from "../components/pill.ts";
import { icon } from "../components/icons.ts";
import { deadlineLine, groupProofs, proofReview, queueLine, initials } from "./admin-rules.ts";

/** What a proof card's buttons do; the page supplies them so the card stays a drawing. */
export interface ProofActions {
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
    // Shown "Approve instead"; read "Approve instead (Owen Achterberg's proof)" (the visible words first, WCAG 2.5.3).
    const button = el("button", { className: "btn btn--secondary", attrs: { type: "button" } },
      t.instead === "approve" ? "Approve instead" : "Reject instead", el("span", { className: "visually-hidden", text: ` (${t.name}'s proof)` }));
    button.addEventListener("click", () => (t.instead === "approve" ? actions.approve(p, button) : actions.reject(p)));
    card.append(el("div", { className: "proof-review__actions" }, button));
  }
  return card;
}

export function proofs(answer: AdminProofs, actions: ProofActions): Node[] {
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
