// Toast (DESIGN-SYSTEM.md › Toast): a short message that confirms something just happened.
// Toasts appear at the bottom of the screen in a polite live region, so screen readers
// announce them without interrupting. A page that announces the same words through its own
// live region (the item page's bid and buy results, DECISIONS #88) passes `announce: false`,
// which puts the toast in a quiet stack beside it so the words are read once. Toasts stay
// while hovered or focused and can always be dismissed; anything that needs action belongs in
// a banner or dialog instead.
import { icon, type IconName } from "./icons.ts";

export type ToastTone = "neutral" | "success" | "danger";

export interface ToastOptions {
  tone?: ToastTone;
  /** Milliseconds before it leaves on its own; paused while hovered or focused. */
  duration?: number;
  /** False when the page announces the same words itself, so they aren't read twice. */
  announce?: boolean;
}

const TONE_ICON: Record<ToastTone, IconName> = { neutral: "info", success: "check", danger: "alert" };

/** The fixed stack at the bottom: a live part, then a quiet part. */
function region(announce: boolean): HTMLElement {
  let el = document.querySelector<HTMLElement>(".toast-region");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast-region";
    const live = document.createElement("div");
    live.className = "toast-region__stack toast-region__stack--live";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    const quiet = document.createElement("div");
    quiet.className = "toast-region__stack toast-region__stack--quiet";
    el.append(live, quiet);
    document.body.append(el);
  }
  return el.querySelector<HTMLElement>(announce ? ".toast-region__stack--live" : ".toast-region__stack--quiet")!;
}

export function showToast(message: string, { tone = "neutral", duration = 6000, announce = true }: ToastOptions = {}): HTMLElement {
  const toast = document.createElement("div");
  toast.className = `toast toast--${tone}`;
  const text = document.createElement("p");
  text.className = "toast__message";
  text.textContent = message;
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "btn btn--quiet btn--icon btn--sm toast__dismiss";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.append(icon("close", { size: "sm" }));
  toast.append(icon(TONE_ICON[tone]), text, dismiss);

  let timer: number | undefined;
  const remove = () => toast.remove();
  const start = () => { timer = window.setTimeout(remove, duration); };
  const pause = () => window.clearTimeout(timer);
  dismiss.addEventListener("click", remove);
  toast.addEventListener("pointerenter", pause);
  toast.addEventListener("pointerleave", start);
  toast.addEventListener("focusin", pause);
  toast.addEventListener("focusout", start);

  region(announce).append(toast);
  start();
  return toast;
}

const FLASH_KEY = "kg:flash";

/** Shows a toast on the next page this tab opens (after saving and moving on, DECISIONS #98). */
export function flashToast(message: string, tone: ToastTone = "success"): void {
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, tone }));
  } catch {
    // Storage blocked: the next page simply shows no toast.
  }
}

/** Shows (once) a toast left by the previous page. */
export function showFlash(): void {
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem(FLASH_KEY);
    sessionStorage.removeItem(FLASH_KEY);
  } catch {
    return;
  }
  if (!saved) return;
  try {
    const { message, tone } = JSON.parse(saved) as { message: unknown; tone: unknown };
    if (typeof message === "string" && (tone === "success" || tone === "neutral" || tone === "danger")) showToast(message, { tone });
  } catch {
    // Ignore anything malformed.
  }
}
