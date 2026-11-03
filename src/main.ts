// Entry point for every app page: the shell (demo bar, header, phase banner), then the
// page's own content once the state arrives.
import type { AppState } from "./app-state.ts";
import { hydrateIcons } from "./components/icons.ts";
import { startBrowse } from "./pages/browse.ts";
import { showHome } from "./pages/home.ts";
import { startItemPage } from "./pages/item.ts";
import { startShell } from "./shell.ts";

hydrateIcons();

// Blocks meant for one role (the Admin Dashboard's note to employees) follow the viewer.
document.addEventListener("kg:state", (event) => {
  const role = (event as CustomEvent<AppState>).detail.viewer?.role;
  for (const block of document.querySelectorAll<HTMLElement>("[data-for-role]")) block.hidden = block.dataset.forRole !== role;
});

if (document.body.dataset.page === "home") {
  document.addEventListener("kg:state", (event) => showHome((event as CustomEvent<AppState>).detail));
}

const browseType = document.querySelector<HTMLElement>("[data-browse-type]")?.dataset.browseType;
if (browseType === "auction" || browseType === "instant") startBrowse(browseType);
if (document.body.dataset.page === "item") startItemPage();

await startShell();
