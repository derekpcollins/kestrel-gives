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

export function findRawValues(text: string): RawValue[] {
  const found: RawValue[] = [];
  text.split("\n").forEach((content, index) => {
    // CSS and TS comments, and HTML comments on one line, don't style anything.
    const code = content.replace(/\/\*.*?\*\/|<!--.*?-->|\/\/.*$/g, "");
    for (const pattern of PATTERNS) {
      for (const match of code.matchAll(pattern)) {
        if (!/^(?:0*\.?0+)(?:px|rem|em)$/i.test(match[0])) found.push({ line: index + 1, value: match[0] });
      }
    }
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
