// The Kestrel icon set (DESIGN-SYSTEM.md › Icon). Original line icons drawn on a 24px
// grid with one stroke width (2), round caps and joins, no fills, in currentColor.
// This file is the only place the drawings live: the app and the gallery render from it.

const SVG_NS = "http://www.w3.org/2000/svg";

// Each icon is a list of SVG path `d` strings and circles ([cx, cy, r]).
type Drawing = readonly (string | readonly [number, number, number])[];

export const ICONS = {
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  "chevron-down": ["M6 9l6 6 6-6"],
  "chevron-left": ["M15 6l-6 6 6 6"],
  "chevron-right": ["M9 6l6 6-6 6"],
  "arrow-up": ["M12 19V5", "M6 11l6-6 6 6"],
  "arrow-down": ["M12 5v14", "M6 13l6 6 6-6"],
  upload: ["M12 15V4", "M7.5 8.5L12 4l4.5 4.5", "M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  alert: ["M10.3 4.9L2.9 17.8A2 2 0 0 0 4.6 20.8h14.8a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0z", "M12 10v4", "M12 17.2v.1"],
  info: [[12, 12, 9], "M12 11v5", "M12 7.8v.1"],
  clock: [[12, 12, 9], "M12 7v5l3.2 2"],
  external: ["M14 4h6v6", "M20 4l-9 9", "M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"],
  trash: ["M4 7h16", "M9.5 7V4.5h5V7", "M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5L18 7", "M10 11v6", "M14 11v6"],
} as const satisfies Record<string, Drawing>;

export type IconName = keyof typeof ICONS;

export interface IconOptions {
  /** Accessible name for a standalone icon that means something on its own. Omit when
      the icon sits next to text that already says it (the icon is then hidden). */
  label?: string;
  size?: "sm" | "md" | "lg";
}

export function isIconName(name: string): name is IconName {
  return Object.hasOwn(ICONS, name);
}

export function icon(name: IconName, { label, size = "md" }: IconOptions = {}): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", `icon icon--${size}`);
  svg.setAttribute("focusable", "false");
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  for (const part of ICONS[name] as Drawing) {
    const el = typeof part === "string" ? document.createElementNS(SVG_NS, "path") : document.createElementNS(SVG_NS, "circle");
    if (typeof part === "string") el.setAttribute("d", part);
    else [["cx", part[0]], ["cy", part[1]], ["r", part[2]]].forEach(([k, v]) => el.setAttribute(String(k), String(v)));
    svg.append(el);
  }
  return svg;
}

/** Replaces every `<span data-icon="name" [data-icon-label="…"] [data-icon-size="…"]>`
    inside `root` with the drawing. Lets static HTML use the one icon source. */
export function hydrateIcons(root: ParentNode = document): void {
  for (const slot of root.querySelectorAll<HTMLElement>("[data-icon]")) {
    const name = slot.dataset.icon ?? "";
    if (!isIconName(name)) {
      console.warn(`Unknown icon: ${name}`);
      continue;
    }
    const size = slot.dataset.iconSize;
    const svg = icon(name, { label: slot.dataset.iconLabel, size: size === "sm" || size === "lg" ? size : "md" });
    if (slot.className) svg.classList.add(...slot.classList);
    slot.replaceWith(svg);
  }
}
