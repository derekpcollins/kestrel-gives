// Photo uploader (DESIGN-SYSTEM.md › Photo uploader; SPEC §7.2, §6). 1–5 JPEG, PNG or
// WebP photos; the first is the cover. Each thumbnail has move-left, move-right and remove
// buttons, so reordering never needs dragging; every change is announced. This handles
// picking, checking and ordering in the browser; the submit page sends the files.
// - `data-resize` (the submit page, DECISIONS #93): each picked picture is resized to JPEG as
//   it's added, so the size cap applies to the resized file and an unreadable picture is
//   reported at once. The gallery demo leaves it off.
// - The edit page starts with the item's current photos (setExisting), which keep their ids.
import { checkPhotos, PHOTO_MAX, photoPositionLabel } from "./form-rules.ts";
import { registerCheck } from "./forms.ts";
import { icon } from "./icons.ts";
import { resizeForUpload } from "./resize.ts";

/** A photo in the list: one the item already has, or a newly picked file. */
export type UploaderPhoto =
  | { kind: "existing"; photoId: string; url: string; name: string }
  | { kind: "new"; file: File; url: string; name: string; uploadId?: string };

type Photo = UploaderPhoto;

/** Before resizing, originals may be this large; phone photos are often 3–8 MB. */
const ORIGINAL_MAX_MB = 40;

export interface Uploader {
  /** The photos in order. New ones are the same objects each time, so the page can note an uploadId on them. */
  photos(): UploaderPhoto[];
  /** Shows the item's current photos (the edit page). */
  setExisting(photos: readonly { photoId: string; url: string }[]): void;
  /** Forgets upload ids, so the next save uploads again (an upload the server no longer accepts). */
  forgetUploads(): void;
  /** True while picked pictures are still being resized. */
  busy(): boolean;
}

export function createUploader(root: HTMLElement): Uploader {
  const input = root.querySelector<HTMLInputElement>(".uploader__input")!;
  const list = root.querySelector<HTMLOListElement>(".uploader__list")!;
  const count = root.querySelector<HTMLElement>(".uploader__count");
  const problemsEl = root.querySelector<HTMLUListElement>(".uploader__problems")!;
  const status = root.querySelector<HTMLElement>(".uploader__status")!;
  const maxMb = Number(root.dataset.maxMb ?? "4");
  const max = Number(root.dataset.max ?? PHOTO_MAX);
  const required = "required" in root.dataset;
  const resize = "resize" in root.dataset;
  let photos: Photo[] = [];
  let working = 0;

  const announce = (text: string) => {
    // Clear first so the same words are announced again.
    status.textContent = "";
    requestAnimationFrame(() => { status.textContent = text; });
  };

  registerCheck(input, () => (required && photos.length === 0 ? "Add at least one photo." : ""));

  input.addEventListener("click", (event) => {
    if (photos.length >= max) {
      event.preventDefault();
      announce(`You've added ${max} photos, the most allowed. Remove one to add another.`);
    }
  });

  input.addEventListener("change", async () => {
    const picked = Array.from(input.files ?? []);
    input.value = ""; // so picking the same file again still fires change
    // With resizing, originals may be large; the cap applies to the resized file below.
    const { accepted, problems } = checkPhotos(photos.length + working, picked, resize ? ORIGINAL_MAX_MB : maxMb, max);
    let files = accepted.map((file) => ({ file, name: file.name }));
    if (resize && accepted.length) {
      working += accepted.length;
      root.setAttribute("aria-busy", "true");
      announce(accepted.length === 1 ? "Preparing 1 photo…" : `Preparing ${accepted.length} photos…`);
      const results = await Promise.all(accepted.map(async (file) => {
        try {
          return { file, resized: await resizeForUpload(file) };
        } catch (error) {
          return { file, error: error instanceof Error ? error.message : String(error) };
        }
      }));
      working -= accepted.length;
      if (working === 0) root.removeAttribute("aria-busy");
      files = [];
      for (const r of results) {
        if ("error" in r) problems.push(`“${r.file.name}”: ${r.error}`);
        else if (r.resized.size > maxMb * 1024 * 1024) problems.push(`“${r.file.name}” is larger than ${maxMb} MB.`);
        else files.push({ file: r.resized, name: r.file.name });
      }
    }
    photos = [...photos, ...files.map(({ file, name }): Photo => ({ kind: "new", file, name, url: URL.createObjectURL(file) }))];
    problemsEl.replaceChildren(...problems.map((p) => {
      const li = document.createElement("li");
      li.className = "field__message field__message--error";
      li.append(icon("alert", { size: "sm" }), document.createTextNode(p));
      return li;
    }));
    render();
    const added = files.length ? `${files.length === 1 ? "1 photo" : `${files.length} photos`} added. ${photos.length} of ${max}.` : "";
    announce([added, ...problems].filter(Boolean).join(" "));
    input.dispatchEvent(new Event("focusout", { bubbles: true })); // let the form re-check
  });

  list.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button[data-action]");
    if (!button || button.getAttribute("aria-disabled") === "true") return;
    const index = Number(button.closest<HTMLElement>(".uploader__item")!.dataset.index);
    const action = button.dataset.action;
    if (action === "left" || action === "right") {
      const to = index + (action === "left" ? -1 : 1);
      [photos[index], photos[to]] = [photos[to]!, photos[index]!];
      render();
      // Keep focus on the same control of the photo that moved; at an end, the other one.
      const moved = list.children[to] as HTMLElement;
      const same = moved.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
      const other = moved.querySelector<HTMLButtonElement>(`[data-action="${action === "left" ? "right" : "left"}"]`)!;
      (same.getAttribute("aria-disabled") === "true" ? other : same).focus();
      announce(`Moved to ${photoPositionLabel(to, photos.length).toLowerCase()}.`);
    } else if (action === "remove") {
      const [gone] = photos.splice(index, 1);
      if (gone?.kind === "new") URL.revokeObjectURL(gone.url);
      render();
      const next = list.children[Math.min(index, photos.length - 1)]?.querySelector<HTMLButtonElement>('[data-action="remove"]');
      (next ?? input).focus();
      announce(`Photo removed. ${photos.length} of ${max}.`);
      input.dispatchEvent(new Event("focusout", { bubbles: true }));
    }
  });

  function render(): void {
    root.classList.toggle("uploader--full", photos.length >= max);
    if (count) count.textContent = photos.length >= max ? `${max} of ${max} photos. Remove one to add another.` : `${photos.length} of ${max} photos`;
    list.hidden = photos.length === 0;
    list.replaceChildren(...photos.map((photo, i) => item(photo, i, photos.length)));
  }

  render();
  return {
    photos: () => [...photos],
    setExisting(list) {
      photos = list.map((p): Photo => ({ kind: "existing", photoId: p.photoId, url: p.url, name: "current photo" }));
      render();
    },
    forgetUploads() {
      for (const p of photos) if (p.kind === "new") delete p.uploadId;
    },
    busy: () => working > 0,
  };
}

function item(photo: Photo, index: number, total: number): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "uploader__item";
  li.dataset.index = String(index);
  const img = document.createElement("img");
  img.className = "uploader__thumb";
  img.src = photo.url;
  img.alt = `${photoPositionLabel(index, total)}: ${photo.name}`;
  li.append(img);
  if (index === 0) {
    const cover = document.createElement("span");
    cover.className = "pill uploader__cover";
    cover.textContent = "Cover";
    cover.setAttribute("aria-hidden", "true"); // the image's alt already says "(cover)"
    li.append(cover);
  }
  const actions = document.createElement("div");
  actions.className = "uploader__actions";
  const n = index + 1;
  actions.append(
    button("left", "chevron-left", `Move photo ${n} left`, index === 0),
    button("right", "chevron-right", `Move photo ${n} right`, index === total - 1),
    button("remove", "trash", `Remove photo ${n}`, false),
  );
  li.append(actions);
  return li;
}

function button(action: string, name: "chevron-left" | "chevron-right" | "trash", label: string, disabled: boolean): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn--secondary btn--icon"; // full 44px target
  b.dataset.action = action;
  b.setAttribute("aria-label", label);
  if (disabled) b.setAttribute("aria-disabled", "true");
  b.append(icon(name));
  return b;
}
