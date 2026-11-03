// Email template rules (SPEC §7.7). Shared by the admin editor and the server, so the inline
// errors and the save check can't disagree. No DOM. Nothing is sent: the preview fills a
// template with sample seed data only.

export const VARIABLES = ["first_name", "item_name", "amount", "donation_total", "proof_deadline", "rejection_reason"] as const;
export type Variable = (typeof VARIABLES)[number];

export const TEMPLATE_LIMITS = { subjectMax: 150, bodyMax: 5000 } as const;

/** Sample values for the live preview, from the seed (Jules won the Lakeside Cabin Weekend). */
export const SAMPLE_VALUES: Readonly<Record<Variable, string>> = {
  first_name: "Jules",
  item_name: "Lakeside Cabin Weekend",
  amount: "$245",
  donation_total: "$345",
  proof_deadline: "Wednesday, November 11",
  rejection_reason: "The screenshot doesn't show the amount donated.",
};

/** How a variable is written in a template. */
export const token = (name: Variable) => `{{${name}}}`;

const TOKEN = /\{\{([^{}]*)\}\}/g;

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const kept = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = kept;
    }
  }
  return row[b.length]!;
}

/**
 * What's wrong with the variables in one field, as sentences for an inline error. Empty when
 * every `{{…}}` is a variable this template offers and no braces are left unmatched.
 */
export function tokenProblems(text: string, allowed: readonly Variable[]): string[] {
  const problems = new Set<string>();
  for (const match of text.matchAll(TOKEN)) {
    const name = match[1]!;
    if ((allowed as readonly string[]).includes(name)) continue;
    if ((VARIABLES as readonly string[]).includes(name)) {
      problems.add(`${match[0]} can't be used in this template.`);
      continue;
    }
    const near = allowed.find((v) => distance(v, name.trim().toLowerCase()) <= 2);
    problems.add(near ? `${match[0]} isn't a variable. Did you mean ${token(near)}?` : `${match[0]} isn't a variable.`);
  }
  const leftover = text.replace(TOKEN, "");
  if (leftover.includes("{{") || leftover.includes("}}")) {
    problems.add("Check the braces: each variable is written like {{first_name}}.");
  }
  return [...problems];
}

export interface TemplateFields {
  subject: string;
  body: string;
}

export interface TemplateProblem {
  field: "subject" | "body";
  message: string;
}

/** Every reason the template can't be saved, by field (SPEC §7.7: unknown tokens block saving). */
export function templateProblems(fields: TemplateFields, allowed: readonly Variable[]): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  const subject = fields.subject.trim();
  if (!subject) problems.push({ field: "subject", message: "Enter a subject." });
  else if (subject.length > TEMPLATE_LIMITS.subjectMax) problems.push({ field: "subject", message: `Keep the subject to ${TEMPLATE_LIMITS.subjectMax} characters.` });
  else if (/[\r\n]/.test(fields.subject)) problems.push({ field: "subject", message: "Keep the subject on one line." });
  for (const message of tokenProblems(fields.subject, allowed)) problems.push({ field: "subject", message });
  const body = fields.body.trim();
  if (!body) problems.push({ field: "body", message: "Enter a body." });
  else if (body.length > TEMPLATE_LIMITS.bodyMax) problems.push({ field: "body", message: `Keep the body to ${TEMPLATE_LIMITS.bodyMax.toLocaleString("en-US")} characters.` });
  for (const message of tokenProblems(fields.body, allowed)) problems.push({ field: "body", message });
  return problems;
}

/** The preview: each known variable replaced by its sample value; anything else left as typed. */
export function fillTemplate(text: string, values: Readonly<Record<Variable, string>> = SAMPLE_VALUES): string {
  return text.replace(TOKEN, (whole, name: string) => ((VARIABLES as readonly string[]).includes(name) ? values[name as Variable] : whole));
}

/** Inserts a variable at the cursor (or over the selection); returns the new text and cursor. */
export function insertAt(text: string, start: number, end: number, name: Variable): { text: string; cursor: number } {
  const t = token(name);
  return { text: text.slice(0, start) + t + text.slice(end), cursor: start + t.length };
}
