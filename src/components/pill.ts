// The status pill (DESIGN-SYSTEM.md › Badge / status pill): a short label in a tone. "neutral"
// is the plain pill; every other tone adds its modifier class.
import { el } from "./dom.ts";

export const pill = (label: string, tone: string): HTMLSpanElement =>
  el("span", { className: `pill${tone === "neutral" ? "" : ` pill--${tone}`}`, text: label });
