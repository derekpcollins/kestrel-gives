// WCAG 2.2 reflow (1.4.10), SPEC §8 and §12: at 320px nothing may scroll or be cut off
// sideways. Runs inside the page (page.evaluate), so it must be self-contained.
// Returns one line per problem; an empty list passes.
//
// The server/test tsconfig has no DOM types (DECISIONS #26), so the few browser shapes this
// uses are declared here instead of pulling DOM types into the whole program.
interface Box {
  tagName: string;
  id: string;
  classList: ArrayLike<string> & Iterable<string>;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
}
interface Page {
  document: { documentElement: Box; body: { querySelectorAll(selector: string): Iterable<Box> } };
  getComputedStyle(el: Box): { overflowX: string; textOverflow: string };
}

export function findReflowProblems(): string[] {
  const { document, getComputedStyle } = globalThis as unknown as Page;
  const problems: string[] = [];
  const root = document.documentElement;
  if (root.scrollWidth > root.clientWidth) {
    problems.push(`page scrolls sideways: content is ${root.scrollWidth}px wide in a ${root.clientWidth}px viewport`);
  }
  const describe = (el: Box) =>
    el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (el.classList.length ? `.${[...el.classList].join(".")}` : "");
  for (const el of document.body.querySelectorAll("*")) {
    if (el.clientWidth === 0 || el.scrollWidth <= el.clientWidth + 1) continue;
    const style = getComputedStyle(el);
    // Allowed: regions meant to scroll sideways (WCAG's 2D-content exception, e.g. wide
    // tables) and text deliberately truncated with an ellipsis.
    if (style.overflowX === "auto" || style.overflowX === "scroll") continue;
    if (style.textOverflow === "ellipsis") continue;
    // Text fields scroll their own value sideways by design; that's not page reflow.
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") continue;
    // Screen-reader-only text (the visually-hidden pattern) is clipped to 1px on purpose.
    if (el.clientWidth <= 1 && el.clientHeight <= 1) continue;
    if (style.overflowX === "hidden" || style.overflowX === "clip") {
      problems.push(`${describe(el)} cuts off ${el.scrollWidth - el.clientWidth}px of content sideways`);
    }
  }
  return problems;
}
