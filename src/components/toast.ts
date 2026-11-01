// Toast (DESIGN-SYSTEM.md › Toast): a short message that confirms something just happened.
// Toasts appear in one polite live region at the bottom of the screen, so screen readers
// announce them without interrupting. They stay while hovered or focused and can always be
// dismissed; anything that needs action belongs in a banner or dialog instead.
import { icon, type IconName } from "./icons.ts";

export type ToastTone = "neutral" | "success" | "danger";

export interface ToastOptions {
  tone?: ToastTone;
  /** Milliseconds before it leaves on its own; paused while hovered or focused. */
  duration?: number;
}

const TONE_ICON: Record<ToastTone, IconName> = { neutral: "info", success: "check", danger: "alert" };

function region(): HTMLElement {
  let el = document.querySelector<HTMLElement>(".toast-region");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast-region";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.append(el);
  }
  return el;
}

export function showToast(message: string, { tone = "neutral", duration = 6000 }: ToastOptions = {}): HTMLElement {
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

  region().append(toast);
  start();
  return toast;
}
