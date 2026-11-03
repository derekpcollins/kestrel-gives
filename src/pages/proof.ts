// Upload donation proof (/your-items/proof, a rewrite to /proof) (SPEC §7.6; DECISIONS #95, #103).
// - One combined proof per person: the amount donated and one screenshot. The amount starts at
//   the donation total; below it is allowed, with a warning, and an admin decides.
// - What happened to the last proof (rejected with its reason, waiting, approved, a changed
//   total) shows above the form. A new upload replaces a waiting or rejected one.
// - The screenshot is resized as it's picked and uploaded on submit. An upload that worked keeps
//   its id, so a retry after a failed submit doesn't upload it again.
// - Someone with nothing to prove, or whose proof is approved for their current total, sees why
//   instead of the form. It follows the demo bar like every page.
import type { AppState } from "../app-state.ts";
import { el } from "../components/dom.ts";
import { enhanceForm, showServerProblems } from "../components/forms.ts";
import { hydrateIcons, icon } from "../components/icons.ts";
import { PROOF_DEMO_NOTE } from "../components/proof-rules.ts";
import { flashToast } from "../components/toast.ts";
import { createUploader } from "../components/uploader.ts";
import type { MeAnswer } from "../me-api.ts";
import { amountCents, amountNote, proofNotes, startingAmount, totalLine } from "./proof-rules.ts";
import { requestFailure } from "./submit-rules.ts";

type Answer = { ok: boolean; status: number | null; body: Record<string, unknown> };

async function send(url: string, init: RequestInit): Promise<Answer> {
  try {
    const response = await fetch(url, { ...init, credentials: "same-origin" });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, body };
  } catch {
    return { ok: false, status: null, body: {} };
  }
}

const SUBMIT_LABEL = "Upload proof";

export function startProofPage(): void {
  const main = document.querySelector<HTMLElement>("[data-proof-page]");
  if (!main) return;
  const $ = <T extends HTMLElement>(selector: string) => main.querySelector<T>(selector)!;
  const body = $<HTMLElement>("[data-proof-body]");
  const blocked = $<HTMLElement>("[data-proof-blocked]");
  const failed = $<HTMLElement>("[data-proof-error]");
  const form = $<HTMLFormElement>("[data-proof-form]");
  const amount = $<HTMLInputElement>("#proof-amount");
  const note = $<HTMLElement>("[data-proof-amount-note]");
  const submitButton = $<HTMLButtonElement>("[data-proof-submit]");
  const shotInput = $<HTMLInputElement>("#proof-shot");
  const uploader = createUploader($<HTMLElement>("[data-uploader]"));
  $<HTMLElement>("[data-proof-demo-note]").textContent = PROOF_DEMO_NOTE;

  let proof: MeAnswer["proof"] | null = null;
  let filledFor: string | null = null;
  let latest = 0;
  let saving = false;

  const showNote = () => {
    const words = proof ? amountNote(amount.value, proof.totalCents) : null;
    note.textContent = words ?? "";
    note.hidden = !words;
  };
  amount.addEventListener("input", showNote);

  const notesFor = (view: MeAnswer["proof"]) => proofNotes(view).map((n) =>
    el("div", { className: `banner banner--${n.tone}` },
      icon(n.tone === "info" ? "info" : "alert"),
      el("div", { className: "banner__body" },
        el("p", { className: "banner__title", text: n.title }),
        el("p", { className: "banner__text", text: n.text }),
      ),
    ));

  const draw = (answer: MeAnswer) => {
    proof = answer.proof;
    failed.hidden = true;
    const why = answer.proof.blocked;
    blocked.hidden = !why;
    body.hidden = !!why;
    $<HTMLElement>("[data-proof-blocked-text]").textContent = why?.message ?? "";
    if (why) return;
    $<HTMLElement>("[data-proof-notes]").replaceChildren(...notesFor(answer.proof));
    $<HTMLElement>("[data-proof-total]").textContent = totalLine(answer.proof, new Date(answer.now));
    const giving = $<HTMLAnchorElement>("[data-proof-giving]");
    giving.hidden = !answer.givingPlatformUrl;
    if (answer.givingPlatformUrl) giving.href = answer.givingPlatformUrl;
    // Prefill once per person, so switching viewers resets it but a redraw doesn't undo typing.
    if (filledFor !== answer.viewer.id) {
      amount.value = startingAmount(answer.proof);
      filledFor = answer.viewer.id;
    }
    showNote();
    hydrateIcons(main);
  };

  const load = async () => {
    const request = ++latest;
    body.setAttribute("aria-busy", "true");
    const answer = await send("/api/me", { headers: { Accept: "application/json" } });
    if (request !== latest) return;
    body.removeAttribute("aria-busy");
    if (!answer.ok) {
      body.hidden = true;
      blocked.hidden = true;
      failed.hidden = false;
      return;
    }
    draw(answer.body as unknown as MeAnswer);
  };
  failed.querySelector("button")?.addEventListener("click", () => void load());

  /** A message about the whole form, at its top; focused so it's read. */
  const showFormAlert = (message: string | null) => {
    form.querySelector(".item-form__alert")?.remove();
    form.querySelector(".error-summary")?.remove();
    if (!message) return;
    const alert = el("div", { className: "banner banner--danger item-form__alert", attrs: { role: "alert", tabindex: "-1" } },
      icon("alert"),
      el("div", { className: "banner__body" }, el("p", { className: "banner__text", text: message })),
    );
    form.prepend(alert);
    alert.focus();
  };

  const setBusy = (busy: boolean, label = SUBMIT_LABEL) => {
    saving = busy;
    submitButton.toggleAttribute("aria-busy", busy);
    if (busy) submitButton.setAttribute("aria-disabled", "true");
    else submitButton.removeAttribute("aria-disabled");
    submitButton.textContent = label;
  };

  const save = async () => {
    if (saving) return;
    if (uploader.busy()) {
      showFormAlert("Your screenshot is still being prepared. Try again in a moment.");
      return;
    }
    const cents = amountCents(amount.value);
    const shot = uploader.photos().find((p) => p.kind === "new");
    if (cents === null || !shot || shot.kind !== "new") return; // the browser checks have said why
    showFormAlert(null);
    setBusy(true, "Uploading screenshot…");
    try {
      if (!shot.uploadId) {
        const up = await send("/api/uploads?purpose=proof", { method: "POST", body: shot.file, headers: { "Content-Type": shot.file.type } });
        if (!up.ok || typeof up.body["id"] !== "string") {
          showFormAlert(requestFailure(up.status, up.body["error"] as string | undefined));
          return;
        }
        shot.uploadId = up.body["id"];
      }
      submitButton.textContent = "Sending proof…";
      const answer = await send("/api/proofs", {
        method: "POST",
        body: JSON.stringify({ amountCents: cents, uploadId: shot.uploadId }),
        headers: { "Content-Type": "application/json" },
      });
      if (answer.ok) {
        flashToast(String(answer.body["message"] ?? "Your proof is in."));
        location.assign("/your-items");
        return;
      }
      const code = answer.body["code"];
      const error = answer.body["error"] as string | undefined;
      if (answer.status === 422 && code === "bad-amount" && error) {
        showServerProblems(form, [{ control: amount, message: error }]);
        return;
      }
      if (answer.status === 422 && code === "bad-image" && error) {
        // The server won't take that upload any more; the next try uploads it again.
        uploader.forgetUploads();
        showServerProblems(form, [{ control: shotInput, message: error }]);
        return;
      }
      showFormAlert(requestFailure(answer.status, error));
      // Nothing owed or already approved: the page now says so.
      if (answer.status === 409) void load();
    } finally {
      if (saving) setBusy(false);
    }
  };

  enhanceForm(form, { onValid: () => void save() });

  document.addEventListener("kg:state", (event) => {
    const state = (event as CustomEvent<AppState>).detail;
    if (!state.viewer) return;
    void load();
  });
}
