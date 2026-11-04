// What the Admin Dashboard's form sections (Event settings, Email templates, Reset) share: what
// src/pages/admin.ts lends them, reading a failed request, and a busy button.

/** What admin.ts lends these sections. */
export interface SectionHost {
  post(body: Record<string, unknown>): Promise<{ message: string; answer: unknown }>;
  /** Reloads the section and shows the message in its alert (a stale or missing record). */
  reloadWith(message: string): Promise<void>;
  alert(message: string): void;
  denied(): void;
  redraw(nodes: Node[]): void;
  /**
   * Asks the shell to fetch the app state again (the header, banner and phase follow the dates).
   * The section then reloads; focus goes to `focus` (a selector) in it.
   */
  refreshApp(focus: string): void;
}

export const statusOf = (error: unknown) => (error as { status?: number }).status;
export const problemsOf = (error: unknown) => (error as { problems?: { field: string; message: string }[] }).problems;
export const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong. Please try again.");

export function setBusy(button: HTMLButtonElement, busy: boolean, label: string): void {
  button.toggleAttribute("aria-busy", busy);
  if (busy) button.setAttribute("aria-disabled", "true"); else button.removeAttribute("aria-disabled");
  button.textContent = label;
}
