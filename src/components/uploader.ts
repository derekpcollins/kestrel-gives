// Photo uploader (DESIGN-SYSTEM.md › Photo uploader; SPEC §7.2, §6). 1–5 JPEG, PNG or
// WebP photos; the first is the cover. Each thumbnail has move-left, move-right and remove
// buttons, so reordering never needs dragging; every change is announced. This handles
// picking, checking and ordering in the browser; sending files to storage comes with the
// submit flow (Milestone 5).
import { checkPhotos, PHOTO_MAX, photoPositionLabel } from "./form-rules.ts";
import { registerCheck } from "./forms.ts";
import { icon } from "./icons.ts";

interface Photo { file: File; url: string }

export interface Uploader {
  photos(): File[];
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
  let photos: Photo[] = [];

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

  input.addEventListener("change", () => {
    const picked = Array.from(input.files ?? []);
    input.value = ""; // so picking the same file again still fires change
    const { accepted: files, problems } = checkPhotos(photos.length, picked, maxMb, max);
    photos = [...photos, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))];
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
      if (gone) URL.revokeObjectURL(gone.url);
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
  return { photos: () => photos.map((p) => p.file) };
}

function item(photo: Photo, index: number, total: number): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "uploader__item";
  li.dataset.index = String(index);
  const img = document.createElement("img");
  img.className = "uploader__thumb";
  img.src = photo.url;
  img.alt = `${photoPositionLabel(index, total)}: ${photo.file.name}`;
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
  b.className = "btn btn--secondary btn--icon btn--sm";
  b.dataset.action = action;
  b.setAttribute("aria-label", label);
  if (disabled) b.setAttribute("aria-disabled", "true");
  b.append(icon(name, { size: "sm" }));
  return b;
}
