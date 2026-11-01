// Table (DESIGN-SYSTEM.md › Table). On narrow screens a wide table scrolls inside its
// .table-wrap region (WCAG's exception for two-dimensional content). The region joins the
// tab order only while it actually scrolls, so keyboard users can scroll it with arrows.

export function enhanceTableScroll(wrap: HTMLElement): void {
  const update = () => {
    if (wrap.scrollWidth > wrap.clientWidth + 1) wrap.tabIndex = 0;
    else wrap.removeAttribute("tabindex");
  };
  new ResizeObserver(update).observe(wrap);
  update();
}
