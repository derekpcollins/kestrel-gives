// Loading (DESIGN-SYSTEM.md › Loading; DECISIONS #119). Each page's HTML has a visible
// `.loading` line where its content will go, so something shows at first paint, before any
// script or answer arrives (a cold database can take seconds). Pages hide it once they've
// drawn their content, an empty state or an error, and show it again for Try again. Reads
// give up after LOAD_TIMEOUT_MS, so a request that hangs ends in the page's error with Try
// again instead of an endless wait. Writes (bids, saves) aren't cut off: a write that may
// have happened shouldn't be reported as failed.

/** How long a read waits before the page says it couldn't load. */
export const LOAD_TIMEOUT_MS = 10_000;

export class LoadTimeout extends Error {
  constructor() {
    super("The server took too long to answer. Try again.");
    this.name = "LoadTimeout";
  }
}

/** fetch() for reads, rejected with LoadTimeout after `ms`. Network failures reject as fetch does. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms: number = LOAD_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new LoadTimeout();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Shows or hides the page's loading line(s). */
export function pageLoading(on: boolean): void {
  for (const node of document.querySelectorAll<HTMLElement>("[data-page-loading]")) node.hidden = !on;
}
