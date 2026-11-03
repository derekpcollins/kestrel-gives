// Silent Auction and Instant Sale (SPEC §8): a grid of item tiles with a sort. The sort lives
// in `?sort=` so a sorted page can be bookmarked. The tiles redraw whenever the app state
// changes (view as someone else, jump to another phase) without announcing anything; a sort
// the visitor picks is announced once the new order is drawn.
import type { AppState } from "../app-state.ts";
import { el } from "../components/dom.ts";
import { renderItemTile } from "../components/item-tile.ts";
import { hydrateIcons } from "../components/icons.ts";
import type { BrowseAnswer, BrowseSort, ItemType } from "../items-api.ts";
import { SORT_LABELS, countWords, emptyWords, searchForSort, sortFromSearch, sortedMessage, sortsFor, tileContext, tileView } from "./browse-rules.ts";

export function startBrowse(type: ItemType): void {
  const grid = document.querySelector<HTMLUListElement>("[data-browse-grid]");
  const select = document.querySelector<HTMLSelectElement>("[data-browse-sort]");
  const count = document.querySelector<HTMLElement>("[data-browse-count]");
  const status = document.querySelector<HTMLElement>("[data-browse-status]");
  const empty = document.querySelector<HTMLElement>("[data-browse-empty]");
  const failed = document.querySelector<HTMLElement>("[data-browse-error]");
  if (!grid || !select || !count || !status || !empty || !failed) return;

  let sort: BrowseSort = sortFromSearch(location.search, type);
  let state: AppState | null = null;
  let latest = 0;

  select.replaceChildren(...sortsFor(type).map((s) => el("option", { text: SORT_LABELS[s], attrs: { value: s } })));
  select.value = sort;

  const words = emptyWords(type);
  empty.querySelector("[data-empty-title]")!.textContent = words.title;
  empty.querySelector("[data-empty-text]")!.textContent = words.text;

  const load = async (announce: boolean) => {
    if (!state) return;
    const request = ++latest;
    grid.setAttribute("aria-busy", "true");
    let answer: BrowseAnswer;
    try {
      const response = await fetch(`/api/items?type=${type}&sort=${sort}`, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        await response.text().catch(() => ""); // an unread body keeps the response open
        throw new Error(String(response.status));
      }
      answer = (await response.json()) as BrowseAnswer;
    } catch {
      if (request !== latest) return;
      grid.removeAttribute("aria-busy");
      grid.replaceChildren();
      count.textContent = "";
      empty.hidden = true;
      failed.hidden = false;
      return;
    }
    // A newer request (another sort, another state) has started; its answer wins.
    if (request !== latest) return;
    const ctx = tileContext(state);
    grid.replaceChildren(...answer.items.map((item) => renderItemTile(tileView(item), ctx)));
    grid.removeAttribute("aria-busy");
    count.textContent = answer.items.length ? countWords(answer.items.length) : "";
    empty.hidden = answer.items.length > 0;
    failed.hidden = true;
    if (announce) status.textContent = sortedMessage(sort, answer.items.length);
  };

  select.addEventListener("change", () => {
    sort = sortsFor(type).find((s) => s === select.value) ?? "newest";
    history.replaceState(null, "", `${location.pathname}${searchForSort(location.search, sort)}`);
    void load(true);
  });
  failed.querySelector("button")?.addEventListener("click", () => void load(false));
  document.addEventListener("kg:state", (event) => {
    state = (event as CustomEvent<AppState>).detail;
    void load(false);
  });
  hydrateIcons();
}
