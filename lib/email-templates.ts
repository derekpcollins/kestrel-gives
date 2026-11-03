// The six email templates' defaults (SPEC §7.7). The seed, Restore default and the yearly
// reset all read these. Nothing is sent; statuses show in the app instead (SPEC §7.6).
// Copy rules (DESIGN-SYSTEM.md › Content guidance): donate, donation and proof, never
// payment words; anything that asks for proof uses the person's donation total, never an
// item name (SPEC §7.7, DECISIONS #69).

export const TEMPLATE_KEYS = ["bid_receipt", "outbid", "winner", "purchase_receipt", "proof_rejected", "item_cancelled"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

import type { Variable } from "../src/components/template-rules.ts";

export { VARIABLES, type Variable } from "../src/components/template-rules.ts";

export function isTemplateKey(value: unknown): value is TemplateKey {
  return typeof value === "string" && (TEMPLATE_KEYS as readonly string[]).includes(value);
}

export interface TemplateDefault {
  /** Shown in the admin editor. */
  label: string;
  subject: string;
  body: string;
  /** The only variables this template may use (its Insert variable menu). */
  variables: readonly Variable[];
}

export const TEMPLATE_DEFAULTS: Readonly<Record<TemplateKey, TemplateDefault>> = {
  bid_receipt: {
    label: "Bid receipt",
    subject: "Your {{amount}} bid on {{item_name}}",
    body: "Hi {{first_name}},\n\nYou bid {{amount}} on {{item_name}}. We'll let you know if someone outbids you.\n\nThanks for taking part in Kestrel Gives.",
    variables: ["first_name", "item_name", "amount"],
  },
  outbid: {
    label: "Outbid",
    subject: "You've been outbid on {{item_name}}",
    body: "Hi {{first_name}},\n\nSomeone bid {{amount}} on {{item_name}}. If you'd still like it, you can bid again until bidding closes.",
    variables: ["first_name", "item_name", "amount"],
  },
  winner: {
    label: "Winner",
    subject: "You won {{item_name}}",
    body: "Hi {{first_name}},\n\nYour {{amount}} bid won {{item_name}}. Your donation total is now {{donation_total}}.\n\nPlease donate on the giving page and upload proof of your {{donation_total}} donation by {{proof_deadline}}.",
    variables: ["first_name", "item_name", "amount", "donation_total", "proof_deadline"],
  },
  purchase_receipt: {
    label: "Purchase receipt",
    subject: "You claimed {{item_name}}",
    body: "Hi {{first_name}},\n\nYou claimed {{item_name}} for {{amount}}. Your donation total is now {{donation_total}}.\n\nPlease donate on the giving page and upload proof of your {{donation_total}} donation by {{proof_deadline}}.",
    variables: ["first_name", "item_name", "amount", "donation_total", "proof_deadline"],
  },
  proof_rejected: {
    label: "Proof rejected",
    subject: "Please upload your proof again",
    body: "Hi {{first_name}},\n\nWe couldn't approve your proof: {{rejection_reason}}\n\nPlease upload proof of your {{donation_total}} donation by {{proof_deadline}}.",
    variables: ["first_name", "donation_total", "proof_deadline", "rejection_reason"],
  },
  item_cancelled: {
    label: "Item cancelled",
    subject: "{{item_name}} was cancelled",
    body: "Hi {{first_name}},\n\n{{item_name}} was cancelled, so it no longer counts toward your donation. Your donation total is now {{donation_total}}.",
    variables: ["first_name", "item_name", "donation_total"],
  },
};
