// Demo bar (DESIGN-SYSTEM.md › Demo bar; SPEC §3.1). Remembers whether it's collapsed,
// announces who you're viewing as, and removes itself for ?demo=off. Changing the user or
// the phase talks to the API once there is data (Milestone 3); for now it raises
// demo:viewing-as, demo:jump and demo:restore events on the bar.

const COLLAPSED_KEY = "kestrel-demo-bar-collapsed";

export function enhanceDemoBar(bar: HTMLElement): void {
  // The page's real bar hides for clean screenshots; gallery specimens never do.
  if (bar.dataset.demoBar === "page" && new URLSearchParams(location.search).get("demo") === "off") {
    bar.remove();
    return;
  }

  const details = bar.querySelector<HTMLDetailsElement>(".demo-bar__details");
  const status = bar.querySelector<HTMLElement>(".demo-bar__status");
  const who = bar.querySelector<HTMLElement>(".demo-bar__who");
  const select = bar.querySelector<HTMLSelectElement>(".demo-bar__viewing select");

  if (details && bar.dataset.demoBar === "page") {
    if (localStorage.getItem(COLLAPSED_KEY) === "true") details.open = false;
    details.addEventListener("toggle", () => localStorage.setItem(COLLAPSED_KEY, String(!details.open)));
  }

  select?.addEventListener("change", () => {
    const label = select.selectedOptions[0]?.textContent?.trim() ?? "";
    if (who) who.textContent = `Viewing as ${label}`;
    announce(status, `Now viewing as ${label}`);
    bar.dispatchEvent(new CustomEvent("demo:viewing-as", { bubbles: true, detail: { userId: select.value, label } }));
  });

  for (const button of bar.querySelectorAll<HTMLButtonElement>(".demo-bar__jump-buttons .btn")) {
    button.addEventListener("click", () => {
      for (const other of bar.querySelectorAll(".demo-bar__jump-buttons .btn")) other.setAttribute("aria-pressed", String(other === button));
      announce(status, `Event moved to: ${button.textContent?.trim()}`);
      bar.dispatchEvent(new CustomEvent("demo:jump", { bubbles: true, detail: { phase: button.value } }));
    });
  }

  bar.querySelector<HTMLButtonElement>("[data-demo-restore]")?.addEventListener("click", () => {
    bar.dispatchEvent(new CustomEvent("demo:restore", { bubbles: true, detail: {} }));
  });
}

function announce(status: HTMLElement | null, text: string): void {
  if (!status) return;
  status.textContent = "";
  requestAnimationFrame(() => { status.textContent = text; });
}
