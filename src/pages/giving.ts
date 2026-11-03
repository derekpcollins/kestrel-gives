// The giving stub (/giving; SPEC §3; DECISIONS #103, #104). The charities come from the app
// state; the viewer's total and whether they owe anything come from /api/me, and follow the
// demo bar. Only the newest answer is drawn. If it can't load, the page still explains giving
// and keeps the Upload proof link (the proof page has its own error state).
import type { AppState } from "../app-state.ts";
import type { MeAnswer } from "../me-api.ts";
import { showCharities } from "./home.ts";
import { givingView, OWES_NOTHING } from "./proof-rules.ts";

export function startGivingPage(): void {
  const main = document.querySelector<HTMLElement>("[data-giving-page]");
  if (!main) return;
  const total = main.querySelector<HTMLElement>("[data-giving-total]")!;
  const none = main.querySelector<HTMLElement>("[data-giving-none]")!;
  const upload = main.querySelector<HTMLElement>("[data-giving-upload]")!;
  const you = main.querySelector<HTMLElement>("[data-giving-you]")!;
  let latest = 0;

  const draw = (proof: MeAnswer["proof"] | null) => {
    const view = givingView(proof);
    total.textContent = view.total ?? "";
    total.hidden = view.total === null;
    none.textContent = view.owesNothing ? OWES_NOTHING : "";
    none.hidden = !view.owesNothing;
    upload.hidden = view.owesNothing;
  };

  const load = async () => {
    const request = ++latest;
    you.setAttribute("aria-busy", "true");
    let proof: MeAnswer["proof"] | null = null;
    try {
      const response = await fetch("/api/me", { headers: { Accept: "application/json" }, credentials: "same-origin" });
      if (response.ok) proof = ((await response.json()) as MeAnswer).proof;
      else await response.text().catch(() => "");
    } catch {
      proof = null;
    }
    if (request !== latest) return;
    you.removeAttribute("aria-busy");
    draw(proof);
  };

  document.addEventListener("kg:state", (event) => {
    showCharities((event as CustomEvent<AppState>).detail);
    void load();
  });
}
