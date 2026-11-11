// The welcome dialog (SPEC v1.24 §3.1; DECISIONS entries 138 and 139): opens once per visitor,
// after the page's data has loaded, and again from the demo bar's About this demo. When it
// shows is decided in welcome-rules.ts; this file reads the page and draws it.
import { infoDialog } from "./dialog.ts";
import { el } from "./dom.ts";
import { readItem, storageWorks, writeItem } from "./local-store.ts";
import { pageDataLoaded } from "./page-data.ts";
import type { PageKey } from "./shell-rules.ts";
import { WELCOME, WELCOME_KEY, welcomeDecision } from "./welcome-rules.ts";

// Without storage it can't be remembered, so this keeps it to once per page load.
let shownThisLoad = false;

/** Opens the welcome (About this demo, or a first visit). Resolves when it closes. */
export function openWelcome(): Promise<void> {
  shownThisLoad = true;
  return infoDialog({
    title: WELCOME.title,
    lead: WELCOME.body,
    more: [
      el("p", { text: WELCOME.stepsIntro }),
      el("ol", { className: "dialog__steps" }, ...WELCOME.steps.map((step) => el("li", { text: step }))),
      el("p", { text: WELCOME.closing }),
    ],
    dismissLabel: WELCOME.dismiss,
    link: WELCOME.tour,
  });
}

/** On a first visit, once the page's data has loaded, opens the welcome (or just remembers it). */
export async function maybeShowWelcome(page: PageKey): Promise<void> {
  const demoOff = new URLSearchParams(location.search).get("demo") === "off";
  if (demoOff) return;
  await pageDataLoaded();
  const decision = welcomeDecision({
    page,
    demoOff,
    seen: readItem(WELCOME_KEY) === "true",
    storageWorks: storageWorks(),
    shownThisLoad,
    dialogOpen: document.querySelector("dialog[open]") !== null,
  });
  if (decision === "skip") return;
  // Remembered when it opens, so leaving without dismissing it still counts as seen.
  writeItem(WELCOME_KEY, "true");
  if (decision === "show") void openWelcome();
}
