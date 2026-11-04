// The giving stub (/giving; SPEC §3; DECISIONS #103, #104). The charities come from the app
// state; the viewer's total and whether they owe anything come from /api/me, and follow the
// demo bar. Only the newest answer is drawn. A loading line shows until it answers (DECISIONS
// #119). If it can't load, the page still explains giving and keeps the Upload proof link (the
// proof page has its own error state), and says the total didn't load, with Try again.
import type { AppState } from "../app-state.ts";
import type { MeAnswer } from "../me-api.ts";
import { fetchWithTimeout } from "../components/loading.ts";
import { showCharities } from "./home.ts";
import { givingView, OWES_NOTHING } from "./proof-rules.ts";

export function startGivingPage(): void {
  const main = document.querySelector<HTMLElement>("[data-giving-page]");
  if (!main) return;
  const total = main.querySelector<HTMLElement>("[data-giving-total]")!;
  const none = main.querySelector<HTMLElement>("[data-giving-none]")!;
  const upload = main.querySelector<HTMLElement>("[data-giving-upload]")!;
  const you = main.querySelector<HTMLElement>("[data-giving-you]")!;
  const failed = main.querySelector<HTMLElement>("[data-giving-error]")!;
  const loading = you.previousElementSibling as HTMLElement; // its loading line
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
      const response = await fetchWithTimeout("/api/me", { headers: { Accept: "application/json" }, credentials: "same-origin" });
      if (response.ok) proof = ((await response.json()) as MeAnswer).proof;
      else await response.text().catch(() => "");
    } catch {
      proof = null;
    }
    if (request !== latest) return;
    you.removeAttribute("aria-busy");
    loading.hidden = true;
    // Still explains giving and keeps Upload proof; says the total didn't load, with Try again.
    failed.hidden = proof !== null;
    draw(proof);
  };

  failed.querySelector("button")?.addEventListener("click", () => {
    failed.hidden = true;
    loading.hidden = false;
    void load();
  });
  document.addEventListener("kg:state", (event) => {
    showCharities((event as CustomEvent<AppState>).detail);
    void load();
  });
}
