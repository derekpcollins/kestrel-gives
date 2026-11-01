// Photo carousel (DESIGN-SYSTEM.md › Photo carousel; SPEC §7.3): one photo at a time with
// previous and next buttons and clickable thumbnails beneath. No autoplay and no swipe-only
// control. Thumbnails are buttons named "Photo 2 of 5"; the current one has aria-current.
// Changes are announced politely.

export function enhanceCarousel(root: HTMLElement): void {
  const slides = Array.from(root.querySelectorAll<HTMLElement>(".carousel__slide"));
  const thumbs = Array.from(root.querySelectorAll<HTMLButtonElement>(".carousel__thumb"));
  const prev = root.querySelector<HTMLButtonElement>("[data-carousel-prev]");
  const next = root.querySelector<HTMLButtonElement>("[data-carousel-next]");
  const count = root.querySelector<HTMLElement>(".carousel__count");
  const total = slides.length;
  let current = Math.max(0, thumbs.findIndex((t) => t.getAttribute("aria-current") === "true"));

  const show = (index: number, announce: boolean) => {
    current = Math.min(Math.max(index, 0), total - 1);
    slides.forEach((slide, i) => { slide.hidden = i !== current; });
    thumbs.forEach((thumb, i) => {
      if (i === current) thumb.setAttribute("aria-current", "true");
      else thumb.removeAttribute("aria-current");
    });
    // Ends: aria-disabled keeps the button focusable, so focus never drops.
    prev?.setAttribute("aria-disabled", String(current === 0));
    next?.setAttribute("aria-disabled", String(current === total - 1));
    if (count) {
      if (!announce) count.setAttribute("aria-live", "off");
      count.textContent = `Photo ${current + 1} of ${total}`;
      if (!announce) requestAnimationFrame(() => count.setAttribute("aria-live", "polite"));
    }
  };

  prev?.addEventListener("click", () => { if (current > 0) show(current - 1, true); });
  next?.addEventListener("click", () => { if (current < total - 1) show(current + 1, true); });
  thumbs.forEach((thumb, i) => thumb.addEventListener("click", () => show(i, true)));
  show(current, false);
  if (total <= 1) root.classList.add("carousel--single");
}
