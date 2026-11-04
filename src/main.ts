// Entry point for every app page: the shell (demo bar, header, phase banner), then the
// page's own content once the state arrives.
import type { AppState } from "./app-state.ts";
import { startAdminPage } from "./pages/admin.ts";
import { hydrateIcons } from "./components/icons.ts";
import { startBrowse } from "./pages/browse.ts";
import { showHome } from "./pages/home.ts";
import { startGivingPage } from "./pages/giving.ts";
import { startGuidePage } from "./pages/guide.ts";
import { startItemPage } from "./pages/item.ts";
import { startProofPage } from "./pages/proof.ts";
import { startShell } from "./shell.ts";
import { showFlash } from "./components/toast.ts";
import { startSubmitPage } from "./pages/submit.ts";
import { startYourItemsPage } from "./pages/your-items.ts";

hydrateIcons();
// Demo-only links (Home's "New here?" line) go with the demo bar for clean screenshots (SPEC §3.1).
if (new URLSearchParams(location.search).get("demo") === "off") for (const node of document.querySelectorAll("[data-demo-only]")) node.remove();

if (document.body.dataset.page === "home") {
  document.addEventListener("kg:state", (event) => showHome((event as CustomEvent<AppState>).detail));
}

const browseType = document.querySelector<HTMLElement>("[data-browse-type]")?.dataset.browseType;
if (browseType === "auction" || browseType === "instant") startBrowse(browseType);
if (document.body.dataset.page === "item") startItemPage();
if (document.body.dataset.page === "submit") startSubmitPage();
if (document.body.dataset.page === "your-items") startYourItemsPage();
if (document.body.dataset.page === "proof") startProofPage();
if (document.body.dataset.page === "giving") startGivingPage();
if (document.body.dataset.page === "admin") startAdminPage();
if (document.body.dataset.page === "guide") startGuidePage();
showFlash();

await startShell();
