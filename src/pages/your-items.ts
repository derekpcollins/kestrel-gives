// Your Items (SPEC §8, §7.6; DECISIONS #101): the viewer's bids, wins and purchases with the
// proof summary, donated items with Edit, and anything cancelled. Every row is an item tile
// with Your Items' own words. It redraws whenever the demo bar changes who's viewing or the
// phase, and only the newest answer is drawn.
import type { AppState } from "../app-state.ts";
import { el } from "../components/dom.ts";
import { hydrateIcons, icon } from "../components/icons.ts";
import { renderItemTile } from "../components/item-tile.ts";
import type { MeAnswer } from "../me-api.ts";
import { tileContext } from "./browse-rules.ts";
import { EDIT_LINK, ITEM_LINK } from "./submit-rules.ts";
import {
  bidText, cancelledText, donatedText, proofSummary, SECTIONS, totalChangedBanner, winText, type MineText,
} from "./your-items-rules.ts";

const pill = (label: string, tone: string) => el("span", { className: `pill${tone === "neutral" ? "" : ` pill--${tone}`}`, text: label });

function tile(itemId: string, title: string, photo: string, text: MineText, state: AppState): HTMLLIElement {
  return renderItemTile({ type: "auction", title, href: ITEM_LINK(itemId), ...(photo ? { photo } : {}) }, tileContext(state), text);
}

function section(id: string, title: string, ...content: Node[]): HTMLElement {
  return el("section", { className: "your-items__section", attrs: { "aria-labelledby": id } },
    el("h2", { className: "your-items__title", text: title, attrs: { id } }),
    ...content,
  );
}

function grid(items: HTMLLIElement[], empty: string): HTMLElement {
  return items.length
    ? el("ul", { className: "item-grid" }, ...items)
    : el("p", { className: "your-items__empty", text: empty });
}

function proofCard(answer: MeAnswer): HTMLElement {
  const s = proofSummary(answer.proof, new Date(answer.now));
  const status = s.status || s.due
    ? el("p", { className: "proof-summary__status" }, ...(s.status ? [pill(s.status.label, s.status.tone)] : []), ...(s.due ? [el("span", { className: "proof-summary__due", text: s.due })] : []))
    : null;
  const actions: HTMLElement[] = [];
  if (s.action) actions.push(el("a", { className: "btn btn--sm", text: s.action.label, attrs: { href: s.action.href } }));
  if (s.action && answer.givingPlatformUrl && !answer.proof.latest) {
    actions.push(el("a", { className: "link", text: "Go to the giving page", attrs: { href: answer.givingPlatformUrl } }));
  }
  return el("div", { className: "card card--flat proof-summary", attrs: { role: "group", "aria-labelledby": "proof-summary-label" } },
    el("div", { className: "proof-summary__total" },
      el("p", { className: "proof-summary__label", text: "Your donation total", attrs: { id: "proof-summary-label" } }),
      el("p", { className: "proof-summary__amount", text: s.total }),
    ),
    el("div", { className: "proof-summary__body" },
      ...(status ? [status] : []),
      el("p", { className: "proof-summary__note", text: s.note }),
      ...(actions.length ? [el("div", { className: "proof-summary__actions" }, ...actions)] : []),
    ),
  );
}

function changedBanner(answer: MeAnswer): HTMLElement | null {
  const words = totalChangedBanner(answer.proof);
  if (!words) return null;
  return el("div", { className: "banner banner--warning", attrs: { role: "status" } },
    icon("alert"),
    el("div", { className: "banner__body" },
      el("p", { className: "banner__title", text: words.title }),
      el("p", { className: "banner__text", text: words.text }),
    ),
  );
}

function render(answer: MeAnswer, state: AppState): Node[] {
  const zone = state.event?.timeZone ?? "UTC";
  const ctx = tileContext(state);
  const bids = answer.bids.map((b) => tile(b.itemId, b.title, b.coverUrl, bidText(b), state));
  const wins = answer.wins.map((w) => tile(w.itemId, w.title, w.coverUrl, winText(w, zone), state));
  const donated = answer.donated.map((d) => {
    const li = renderItemTile({ type: d.type, title: d.title, href: ITEM_LINK(d.itemId), ...(d.coverUrl ? { photo: d.coverUrl } : {}) }, ctx, donatedText(d, ctx));
    // Outside the card: a linked card can't hold another control (DESIGN-SYSTEM.md › Card).
    const edit = el("a", { className: "btn btn--secondary btn--sm your-items__edit", attrs: { href: EDIT_LINK(d.itemId) } }, "Edit", el("span", { className: "visually-hidden", text: ` ${d.title}` }));
    li.append(edit);
    return li;
  });
  const nodes: Node[] = [];
  const banner = changedBanner(answer);
  if (banner) nodes.push(banner);
  nodes.push(
    section("my-bids", SECTIONS.bids.title, grid(bids, SECTIONS.bids.empty)),
    section("my-wins", SECTIONS.wins.title, proofCard(answer), grid(wins, SECTIONS.wins.empty)),
    section("my-donated", SECTIONS.donated.title, grid(donated, SECTIONS.donated.empty)),
  );
  if (answer.cancelled.length) {
    nodes.push(section("my-cancelled", SECTIONS.cancelled.title,
      grid(answer.cancelled.map((c) => tile(c.itemId, c.title, c.coverUrl, cancelledText(c), state)), "")));
  }
  return nodes;
}

export function startYourItemsPage(): void {
  const root = document.querySelector<HTMLElement>("[data-your-items]");
  const failed = document.querySelector<HTMLElement>("[data-your-items-error]");
  if (!root || !failed) return;
  let state: AppState | null = null;
  let latest = 0;

  const load = async () => {
    if (!state) return;
    const request = ++latest;
    root.setAttribute("aria-busy", "true");
    let answer: MeAnswer;
    try {
      const response = await fetch("/api/me", { headers: { Accept: "application/json" }, credentials: "same-origin" });
      if (!response.ok) {
        await response.text().catch(() => "");
        throw new Error(String(response.status));
      }
      answer = (await response.json()) as MeAnswer;
    } catch {
      if (request !== latest) return;
      root.removeAttribute("aria-busy");
      root.replaceChildren();
      failed.hidden = false;
      return;
    }
    if (request !== latest || !state) return;
    root.replaceChildren(...render(answer, state));
    root.removeAttribute("aria-busy");
    failed.hidden = true;
    hydrateIcons(root);
  };

  failed.querySelector("button")?.addEventListener("click", () => void load());
  document.addEventListener("kg:state", (event) => {
    state = (event as CustomEvent<AppState>).detail;
    void load();
  });
}
