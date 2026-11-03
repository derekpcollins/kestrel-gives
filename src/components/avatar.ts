// Avatar (DESIGN-SYSTEM.md › Avatar): initials on a circle; the current high bidder wears the
// crown (SPEC §5, DECISIONS #12). Always aria-hidden: the person's name sits beside it, and the
// name carries "(top bidder)" as visually hidden text.
const SVG = "http://www.w3.org/2000/svg";

function crown(): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "avatar__crown");
  svg.setAttribute("viewBox", "0 0 32 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const shapes: Array<[string, Record<string, string>]> = [
    ["path", { class: "avatar__crown-shape", "stroke-width": "1.6", d: "M6 19.5C5.2 15.5 4.4 11.5 3.6 7.6C6 9.6 8.2 11.4 10.4 13.2C12.3 10 14.4 6.8 16.4 3.8C18.4 7 20.2 10 22 13C24.2 11 26.3 8.8 28.6 6.8C28.2 11 27.6 15.2 27 19.4C20 20.8 12.8 20.9 6 19.5Z" }],
    ["path", { class: "avatar__crown-band", "stroke-width": "1.3", d: "M6.7 16.5C13 17.6 20 17.5 26.5 16.3" }],
    ["circle", { class: "avatar__crown-shape", "stroke-width": "1.4", cx: "3.6", cy: "6.4", r: "1.8" }],
    ["circle", { class: "avatar__crown-shape", "stroke-width": "1.4", cx: "16.4", cy: "2.7", r: "1.8" }],
    ["circle", { class: "avatar__crown-shape", "stroke-width": "1.4", cx: "28.6", cy: "5.7", r: "1.8" }],
  ];
  for (const [tag, attrs] of shapes) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.append(node);
  }
  return svg;
}

export function renderAvatar(initials: string, { size = "md", crowned = false }: { size?: "sm" | "md" | "lg"; crowned?: boolean } = {}): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `avatar${size === "md" ? "" : ` avatar--${size}`}`;
  span.setAttribute("aria-hidden", "true");
  span.textContent = initials;
  if (crowned) span.append(crown());
  return span;
}
