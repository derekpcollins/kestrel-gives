// What counts as a raw design value outside public/styles/tokens.css (SPEC §5): hex
// colors, color functions, and non-zero lengths in px, rem, or em. Kept separate from
// the check script so the rules can be unit tested.

export interface RawValue {
  line: number;
  value: string;
}

const PATTERNS = [
  /#[0-9a-f]{3,8}\b/gi,
  /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi,
  /(?<![\w.-])(?:\d*\.)?\d+(?:px|rem|em)\b/gi,
];

// Breakpoint values (from tokens.css --breakpoint-*) are allowed only inside an @media or
// @container condition, which may span lines up to its opening brace. Everything else
// still counts as a raw value.
export function findRawValues(text: string, breakpoints: ReadonlySet<string> = new Set()): RawValue[] {
  const found: RawValue[] = [];
  let inCondition = false;
  text.split("\n").forEach((content, index) => {
    // CSS and TS comments, and HTML comments on one line, don't style anything.
    const code = content.replace(/\/\*.*?\*\/|<!--.*?-->|\/\/.*$/g, "");
    // Split the line into the part inside a condition and the part outside it.
    let condition = "";
    let rest = code;
    const at = code.search(/@(?:media|container)\b/);
    if (inCondition || at >= 0) {
      const from = inCondition ? 0 : at;
      const brace = code.indexOf("{", from);
      condition = brace >= 0 ? code.slice(from, brace) : code.slice(from);
      rest = code.slice(0, from) + (brace >= 0 ? code.slice(brace) : "");
      inCondition = brace < 0;
    }
    for (const [part, allowBreakpoints] of [[condition, true], [rest, false]] as const) {
      for (const pattern of PATTERNS) {
        for (const match of part.matchAll(pattern)) {
          const value = match[0];
          if (/^(?:0*\.?0+)(?:px|rem|em)$/i.test(value)) continue;
          if (allowBreakpoints && breakpoints.has(value.toLowerCase())) continue;
          found.push({ line: index + 1, value });
        }
      }
    }
  });
  return found.sort((a, b) => a.line - b.line);
}

// The allowed breakpoint values, read from tokens.css (--breakpoint-*: <length>;).
export function readBreakpoints(tokensCss: string): Set<string> {
  const code = tokensCss.replace(/\/\*[\s\S]*?\*\//g, "");
  return new Set([...code.matchAll(/--breakpoint-[\w-]+\s*:\s*([^;]+);/g)].map((m) => m[1]!.trim().toLowerCase()));
}

// SPEC §5: components set type with the --type-* roles, not the --text-* scale steps.
export function findScaleUse(text: string): RawValue[] {
  const found: RawValue[] = [];
  text.split("\n").forEach((content, index) => {
    const code = content.replace(/\/\*.*?\*\/|<!--.*?-->|\/\/.*$/g, "");
    for (const match of code.matchAll(/var\(--text-[\w-]+\)/g)) found.push({ line: index + 1, value: match[0] });
  });
  return found;
}

// SPEC §5: every color token has a light and a dark value. In tokens.css each --color-*
// declaration must be light-dark(<light>, <dark>), or a var() alias of another color token.
export function findUnpairedColors(css: string): string[] {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const unpaired: string[] = [];
  for (const [, name, value] of code.matchAll(/(--color-[\w-]+)\s*:\s*([^;]+);/g)) {
    const v = value!.trim();
    const alias = /^var\(--color-[\w-]+\)$/.test(v);
    if (!alias && !(v.startsWith("light-dark(") && v.endsWith(")") && hasTopLevelComma(v.slice(11, -1)))) unpaired.push(name!);
  }
  return unpaired;
}

function hasTopLevelComma(s: string): boolean {
  let depth = 0;
  for (const c of s) {
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) return true;
  }
  return false;
}
