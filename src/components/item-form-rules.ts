// Submitting, editing and deleting items (SPEC §7.1, §7.3; DECISIONS #94). Shared by the API
// and the form, so both say the same thing. No DOM. Money is cents here, as stored.
import { formatDollars } from "./form-rules.ts";
import type { Phase } from "./item-tile-rules.ts";

export type Role = "admin" | "employee";
export type SaleType = "auction" | "instant";

export const ITEM_LIMITS = {
  titleMax: 80,
  descriptionMax: 2000,
  photosMin: 1,
  photosMax: 5,
  quantityMax: 100,
  /** The highest starting bid or price, so a typo can't list a $1,000,000 item. */
  amountMaxCents: 1_000_000,
} as const;

export interface Refusal {
  code: "submissions-closed" | "not-yours" | "cancelled" | "has-activity";
  message: string;
}

/** Employees submit during the submission window; admins any time (SPEC §7.1, §7.3). */
export function submitBlock(role: Role, phase: Phase): Refusal | null {
  if (role === "admin" || phase === "submission") return null;
  return { code: "submissions-closed", message: "Submissions are closed. Only admins can add items now." };
}

export interface ItemFacts {
  submitterId: string;
  cancelled: boolean;
  /** Any bid or purchase, ever (removed and cancelled ones count: they still point at the item). */
  hasActivity: boolean;
}

/** The submitter and admins edit; a cancelled item stays as it was (#94). */
export function editBlock(viewer: { id: string; role: Role }, item: ItemFacts): Refusal | null {
  if (viewer.role !== "admin" && viewer.id !== item.submitterId) return { code: "not-yours", message: "Only the person who donated this item, or an admin, can change it." };
  if (item.cancelled) return { code: "cancelled", message: "This item has been cancelled, so it can't be changed." };
  return null;
}

/** Delete: as edit, and only while there are no bids or purchases (SPEC §7.3). */
export function deleteBlock(viewer: { id: string; role: Role }, item: ItemFacts): Refusal | null {
  const blocked = editBlock(viewer, item);
  if (blocked) return blocked;
  if (item.hasActivity) return { code: "has-activity", message: "This item has bids or purchases, so it can't be deleted." };
  return null;
}

/** The fields that lock once an item has a bid or purchase (SPEC §7.3). */
export type LockableField = "type" | "startingBid" | "price" | "quantity";

export function lockedFields(hasActivity: boolean): LockableField[] {
  return hasActivity ? ["type", "startingBid", "price", "quantity"] : [];
}

/** Shown beside locked fields on the edit form. */
export const LOCKED_NOTE = "Locked: this item has bids or purchases. You can still change the title, description and photos.";

export interface ItemInput {
  type: SaleType;
  title: string;
  description: string;
  startingBidCents?: number | null;
  priceCents?: number | null;
  quantity?: number | null;
  photoCount: number;
}

export type ItemField = "type" | "title" | "description" | "startingBid" | "price" | "quantity" | "photos";
export type FieldProblems = Partial<Record<ItemField, string>>;

const wholeDollars = (cents: unknown): cents is number => typeof cents === "number" && Number.isSafeInteger(cents) && cents > 0 && cents % 100 === 0;

/** What's wrong with the item, field by field (empty when it's fine). Messages match the form's. */
export function itemProblems(input: ItemInput, settings: { minStartingBidCents: number }): FieldProblems {
  const problems: FieldProblems = {};
  const title = input.title.trim();
  if (!title) problems.title = "Enter a title.";
  else if (title.length > ITEM_LIMITS.titleMax) problems.title = `Use ${ITEM_LIMITS.titleMax} characters or fewer.`;
  const description = input.description.trim();
  if (!description) problems.description = "Enter a description.";
  else if (description.length > ITEM_LIMITS.descriptionMax) problems.description = `Use ${ITEM_LIMITS.descriptionMax} characters or fewer.`;

  if (input.type === "auction") {
    const starting = input.startingBidCents;
    if (starting === undefined || starting === null) problems.startingBid = "Enter a starting bid.";
    else if (!wholeDollars(starting)) problems.startingBid = "Whole dollars only.";
    else if (starting < settings.minStartingBidCents) problems.startingBid = `Enter at least ${formatDollars(settings.minStartingBidCents / 100)}.`;
    else if (starting > ITEM_LIMITS.amountMaxCents) problems.startingBid = `Enter ${formatDollars(ITEM_LIMITS.amountMaxCents / 100)} or less.`;
  } else {
    const price = input.priceCents;
    if (price === undefined || price === null) problems.price = "Enter a price.";
    else if (!wholeDollars(price)) problems.price = "Whole dollars only.";
    else if (price > ITEM_LIMITS.amountMaxCents) problems.price = `Enter ${formatDollars(ITEM_LIMITS.amountMaxCents / 100)} or less.`;
    const quantity = input.quantity;
    if (quantity === undefined || quantity === null) problems.quantity = "Enter a quantity.";
    else if (!Number.isSafeInteger(quantity) || quantity < 1) problems.quantity = "Enter a whole number, 1 or more.";
    else if (quantity > ITEM_LIMITS.quantityMax) problems.quantity = `Enter ${ITEM_LIMITS.quantityMax} or fewer.`;
  }

  if (input.photoCount < ITEM_LIMITS.photosMin) problems.photos = "Add at least one photo.";
  else if (input.photoCount > ITEM_LIMITS.photosMax) problems.photos = `Use ${ITEM_LIMITS.photosMax} photos or fewer.`;
  return problems;
}
