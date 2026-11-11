// Waits for the page's first data load: the regions in PAGE_DATA_REGIONS (shell-rules.ts)
// lose aria-busy once their API has answered, success or failure (DECISIONS entry 137). The
// welcome dialog opens only after that (entry 138).
import { PAGE_DATA_REGIONS } from "./shell-rules.ts";

/** Resolves once no data region on the page is still loading (at once if there are none). */
export function pageDataLoaded(): Promise<void> {
  const loading = () => [...document.querySelectorAll(PAGE_DATA_REGIONS)].some((region) => region.hasAttribute("aria-busy"));
  if (!loading()) return Promise.resolve();
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (loading()) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-busy"] });
  });
}
