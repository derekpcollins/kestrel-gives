// Submit an Item (/submit) and Edit item (/items/<id>/edit, a rewrite to the same page)
// (SPEC §7.3; DECISIONS #94, #98).
// - The sale type comes first; the rest stays disabled until one is chosen (SPEC §7.3).
// - Photos are resized as they're picked (#93) and uploaded when the form is saved. An upload
//   that worked keeps its id, so a retry after a failed save doesn't upload it again.
// - Problems the browser can find show under each field with a summary (DESIGN-SYSTEM.md ›
//   Form field). Problems the server finds come back by field and show the same way. Anything
//   else (a closed window, a cap, no connection) shows in a banner at the top of the form.
// - Editing: once an item has a bid or purchase, the sale type and money are shown but locked.
//   Delete is offered only while there's no activity, behind a confirmation.
// - Who may submit or edit follows the demo bar: switching person or jumping phase updates it.
import type { AppState } from "../app-state.ts";
import { confirmDialog } from "../components/dialog.ts";
import { enableWhenChosen, enhanceForm, showServerProblems } from "../components/forms.ts";
import { hydrateIcons, icon } from "../components/icons.ts";
import type { ItemField } from "../components/item-form-rules.ts";
import { LOCKED_NOTE } from "../components/item-form-rules.ts";
import { flashToast } from "../components/toast.ts";
import { createUploader, type Uploader } from "../components/uploader.ts";
import type { ItemAnswer } from "../items-api.ts";
import {
  DELETE_BODY, deleteDialogTitle, dollarsField, editIdFromPath, editState, FIELD_CONTROLS, ITEM_LINK, itemBody,
  pageCopy, requestFailure, startingBidHelp, submitPageBlock, type FormValues, type PhotoRefBody,
} from "./submit-rules.ts";

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

export function startSubmitPage(): void {
  const main = document.querySelector<HTMLElement>("[data-submit-page]");
  if (!main) return;
  const editId = editIdFromPath(location.pathname);
  const mode = editId ? "edit" : "submit";
  const copy = pageCopy(mode);
  const $ = <T extends HTMLElement>(selector: string) => main.querySelector<T>(selector)!;

  const form = $<HTMLFormElement>("[data-submit-form]");
  const blocked = $<HTMLElement>("[data-submit-blocked]");
  const blockedText = $<HTMLElement>("[data-submit-blocked-text]");
  const submitButton = $<HTMLButtonElement>("[data-submit-button]");
  const rest = $<HTMLFieldSetElement>("#item-rest");
  const auction = $<HTMLFieldSetElement>("#item-auction");
  const instant = $<HTMLFieldSetElement>("#item-instant");
  const typeGroup = $<HTMLFieldSetElement>("#item-type-group");
  const start = $<HTMLInputElement>("#item-start");
  const deleteSection = $<HTMLElement>("[data-delete-section]");
  const uploader: Uploader = createUploader($<HTMLElement>("[data-uploader]"));

  document.title = `${copy.title} · Kestrel Gives`;
  $<HTMLElement>("[data-submit-title]").textContent = copy.title;
  $<HTMLElement>("[data-submit-description]").textContent = copy.description;
  submitButton.textContent = copy.submitLabel;
  // "Choose one to fill in the rest" only means something while nothing is chosen yet.
  if (mode === "edit") {
    $<HTMLElement>("[data-type-help]").hidden = true;
    typeGroup.removeAttribute("aria-describedby");
  }

  let state: AppState | null = null;
  let item: ItemAnswer["item"] | null = null;
  let filled = false;
  let saving = false;

  const showType = () => {
    const type = form.querySelector<HTMLInputElement>('input[name="type"]:checked')?.value;
    auction.hidden = auction.disabled = type !== "auction";
    instant.hidden = instant.disabled = type !== "instant";
  };
  enableWhenChosen(form, "type", rest);
  form.addEventListener("change", showType);

  const showBlocked = (message: string | null) => {
    blocked.hidden = message === null;
    blockedText.textContent = message ?? "";
    form.hidden = message !== null;
    if (message !== null) deleteSection.hidden = true;
  };

  /** A message about the whole form, at its top; focused so it's read. */
  const showFormAlert = (message: string | null) => {
    form.querySelector(".item-form__alert")?.remove();
    form.querySelector(".error-summary")?.remove();
    if (!message) return;
    const alert = document.createElement("div");
    alert.className = "banner banner--danger item-form__alert";
    alert.tabIndex = -1;
    alert.setAttribute("role", "alert");
    const body = document.createElement("div");
    body.className = "banner__body";
    const text = document.createElement("p");
    text.className = "banner__text";
    text.textContent = message;
    body.append(text);
    alert.append(icon("alert"), body);
    form.prepend(alert);
    alert.focus();
  };

  const setBusy = (busy: boolean) => {
    saving = busy;
    submitButton.toggleAttribute("aria-busy", busy);
    if (busy) submitButton.setAttribute("aria-disabled", "true");
    else submitButton.removeAttribute("aria-disabled");
    submitButton.textContent = busy ? copy.busyLabel : copy.submitLabel;
  };

  // ---------- Edit mode: load the item and fill the form ----------
  const fill = (answer: ItemAnswer["item"]) => {
    const radio = form.querySelector<HTMLInputElement>(`input[name="type"][value="${answer.type}"]`)!;
    radio.checked = true;
    (form.elements.namedItem("title") as HTMLInputElement).value = answer.title;
    (form.elements.namedItem("description") as HTMLTextAreaElement).value = answer.description;
    start.value = dollarsField(answer.startingBidCents);
    (form.elements.namedItem("price") as HTMLInputElement).value = dollarsField(answer.priceCents);
    (form.elements.namedItem("quantity") as HTMLInputElement).value = answer.quantity === null ? "1" : String(answer.quantity);
    uploader.setExisting(answer.photos.map((p) => ({ photoId: p.id, url: p.url })));
    form.dispatchEvent(new Event("change"));
    const back = $<HTMLAnchorElement>("[data-submit-back]");
    back.href = ITEM_LINK(answer.id);
    back.hidden = false;
    const cancel = $<HTMLAnchorElement>("[data-submit-cancel]");
    cancel.href = ITEM_LINK(answer.id);
    cancel.hidden = false;
    $<HTMLElement>("[data-submit-form-title]").textContent = `Details for ${answer.title}`;
  };

  const applyLocks = (locked: boolean) => {
    const note = $<HTMLElement>("[data-locked-note]");
    note.hidden = !locked;
    $<HTMLElement>("#locked-note").textContent = locked ? LOCKED_NOTE : "";
    // The chosen sale type stays enabled so it keeps its check mark and border (a disabled
    // radio greys out); only the other one is disabled, and arrow keys skip disabled radios,
    // so the choice still can't change. The server ignores locked fields either way.
    for (const control of [...typeGroup.querySelectorAll<HTMLInputElement>("input"), start, form.elements.namedItem("price") as HTMLInputElement, form.elements.namedItem("quantity") as HTMLInputElement]) {
      control.disabled = locked && !(control.type === "radio" && control.checked);
      if (locked && !control.getAttribute("aria-describedby")?.includes("locked-note")) control.setAttribute("aria-describedby", [control.getAttribute("aria-describedby"), "locked-note"].filter(Boolean).join(" "));
    }
  };

  const update = () => {
    if (!state) return;
    if (mode === "submit") {
      showBlocked(submitPageBlock(state.viewer, state.event?.phase ?? null));
      if (!filled && state.event) {
        start.value = String(state.event.minStartingBidCents / 100);
        filled = true;
      }
    } else {
      if (!item) return;
      const viewer = state.viewer;
      const can = viewer ? editState(viewer, item) : null;
      showBlocked(!can ? "The demo isn't ready yet." : can.blocked?.message ?? null);
      if (can && !can.blocked) {
        if (!filled) {
          fill(item);
          filled = true;
        }
        applyLocks(can.locked.length > 0);
        deleteSection.hidden = !can.canDelete;
      }
    }
    if (state.event) {
      start.dataset.min = String(state.event.minStartingBidCents / 100);
      $<HTMLElement>("#item-start-help").textContent = startingBidHelp(state.event.minStartingBidCents);
    }
    hydrateIcons(main);
  };

  document.addEventListener("kg:state", (event) => {
    state = (event as CustomEvent<AppState>).detail;
    update();
  });

  if (editId) {
    void (async () => {
      const answer = await send(`/api/items?id=${editId}`, {});
      if (!answer.ok) {
        showBlocked(answer.status === 404 ? "That item doesn't exist." : requestFailure(answer.status, answer.body["error"] as string | undefined));
        return;
      }
      item = (answer.body as unknown as ItemAnswer).item;
      update();
    })();
  }

  // ---------- Saving ----------
  const values = (): FormValues => {
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? "";
    const type = (form.querySelector<HTMLInputElement>('input[name="type"]:checked')?.value ?? "auction") as FormValues["type"];
    return { type, title: field("title"), description: field("description"), startingBid: field("startingBid"), price: field("price"), quantity: field("quantity") };
  };

  /** Uploads each new photo that hasn't been uploaded yet. Returns null (and shows why) if one fails. */
  const uploadPhotos = async (): Promise<PhotoRefBody[] | null> => {
    const photos = uploader.photos();
    const pending = photos.filter((p) => p.kind === "new" && !p.uploadId).length;
    let done = 0;
    for (const photo of photos) {
      if (photo.kind !== "new" || photo.uploadId) continue;
      done += 1;
      submitButton.textContent = pending > 1 ? `Uploading photo ${done} of ${pending}…` : "Uploading photo…";
      const answer = await send("/api/uploads?purpose=photo", { method: "POST", body: photo.file, headers: { "Content-Type": photo.file.type } });
      if (!answer.ok || typeof answer.body["id"] !== "string") {
        showFormAlert(requestFailure(answer.status, answer.body["error"] as string | undefined));
        return null;
      }
      photo.uploadId = answer.body["id"];
    }
    return photos.map((p) => (p.kind === "existing" ? { photoId: p.photoId } : { uploadId: p.uploadId! }));
  };

  const save = async () => {
    if (saving) return;
    if (uploader.busy()) {
      showFormAlert("Your photos are still being prepared. Try again in a moment.");
      return;
    }
    showFormAlert(null);
    setBusy(true);
    try {
      const photos = await uploadPhotos();
      if (!photos) return;
      submitButton.textContent = copy.busyLabel;
      const body = JSON.stringify(itemBody(values(), photos));
      const answer = editId
        ? await send(`/api/items?id=${editId}`, { method: "PATCH", body, headers: { "Content-Type": "application/json" } })
        : await send("/api/items", { method: "POST", body, headers: { "Content-Type": "application/json" } });
      if (answer.ok) {
        flashToast(String(answer.body["message"] ?? "Saved."));
        location.assign(ITEM_LINK(String(answer.body["id"])));
        return;
      }
      const problems = answer.body["problems"] as Partial<Record<ItemField, string>> | undefined;
      if (answer.status === 422 && problems) {
        // A photo the server won't take any more is uploaded again on the next try.
        if (problems.photos) uploader.forgetUploads();
        const list = Object.entries(problems).flatMap(([field, message]) => {
          const control = document.getElementById(FIELD_CONTROLS[field as ItemField]) as HTMLInputElement | null;
          return control && message ? [{ control, message }] : [];
        });
        showServerProblems(form, list);
        return;
      }
      showFormAlert(requestFailure(answer.status, answer.body["error"] as string | undefined));
    } finally {
      if (saving) setBusy(false);
    }
  };

  enhanceForm(form, { onValid: () => void save() });

  // ---------- Delete ----------
  $<HTMLButtonElement>("[data-delete-button]").addEventListener("click", async () => {
    if (!item || !editId) return;
    const done = await confirmDialog({
      variant: "danger",
      title: deleteDialogTitle(item.title),
      body: DELETE_BODY,
      confirmLabel: "Delete item",
      cancelLabel: "Keep item",
      busyLabel: "Deleting…",
      onConfirm: async () => {
        const answer = await send(`/api/items?id=${editId}`, { method: "DELETE" });
        if (!answer.ok) throw new Error(requestFailure(answer.status, answer.body["error"] as string | undefined));
        flashToast(String(answer.body["message"] ?? "Your item is deleted."));
      },
    });
    if (done) location.assign("/your-items");
  });
}
