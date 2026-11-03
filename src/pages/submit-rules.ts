// The Submit an Item and Edit item page's decisions (SPEC §7.3; DECISIONS #94, #98). No DOM,
// so node:test covers them. Money is typed in whole dollars and sent as cents.
import { dollarsToCents, parseWholeDollars } from "../components/form-rules.ts";
import {
  deleteBlock, editBlock, lockedFields, submitBlock,
  type ItemField, type LockableField, type Refusal, type Role, type SaleType,
} from "../components/item-form-rules.ts";
import type { Phase } from "../components/item-tile-rules.ts";
import type { ItemDetail } from "../items-api.ts";

/** `/items/12/edit` → "12"; anything else is the submit page. */
export function editIdFromPath(path: string): string | null {
  return /^\/items\/([1-9]\d{0,17})\/edit\/?$/.exec(path)?.[1] ?? null;
}

export const ITEM_LINK = (id: string) => `/items/${id}`;
export const EDIT_LINK = (id: string) => `/items/${id}/edit`;

export interface PageCopy {
  title: string;
  description: string;
  submitLabel: string;
  busyLabel: string;
}

export function pageCopy(mode: "submit" | "edit"): PageCopy {
  return mode === "submit"
    ? { title: "Submit an Item", description: "Donate an item or an experience to the auction.", submitLabel: "Submit item", busyLabel: "Submitting…" }
    : { title: "Edit item", description: "Change your item's details and photos.", submitLabel: "Save changes", busyLabel: "Saving…" };
}

/** Why the viewer can't submit now, or null (employees only in the submission window). */
export function submitPageBlock(viewer: { role: Role } | null, phase: Phase | null): string | null {
  if (!viewer || !phase) return "The demo isn't ready yet. Try Restore demo data.";
  return submitBlock(viewer.role, phase)?.message ?? null;
}

export interface EditState {
  blocked: Refusal | null;
  locked: LockableField[];
  canDelete: boolean;
}

export function editState(viewer: { id: string; role: Role }, item: Pick<ItemDetail, "submitter" | "cancelled" | "hasActivity">): EditState {
  const facts = { submitterId: item.submitter.id, cancelled: item.cancelled, hasActivity: item.hasActivity };
  return { blocked: editBlock(viewer, facts), locked: lockedFields(item.hasActivity), canDelete: deleteBlock(viewer, facts) === null };
}

/** The item page shows "Edit item" to its submitter and admins, unless it's cancelled. */
export function canEdit(viewer: { id: string; role: Role } | null, item: Pick<ItemDetail, "submitter" | "cancelled" | "hasActivity">): boolean {
  return viewer !== null && editState(viewer, item).blocked === null;
}

/** Help under the starting bid, from the event minimum (never hard-coded, SPEC §7.4). */
export { startingBidHelp } from "../components/item-form-rules.ts";

export interface FormValues {
  type: SaleType;
  title: string;
  description: string;
  startingBid: string;
  price: string;
  quantity: string;
}

export type PhotoRefBody = { photoId: string } | { uploadId: string };

export interface ItemWriteBody {
  type: SaleType;
  title: string;
  description: string;
  startingBidCents: number | null;
  priceCents: number | null;
  quantity: number | null;
  photos: PhotoRefBody[];
}

const cents = (raw: string) => {
  const dollars = parseWholeDollars(raw);
  return dollars === null ? null : dollarsToCents(dollars);
};

/** The request body. Only the chosen sale type's money is sent. */
export function itemBody(values: FormValues, photos: PhotoRefBody[]): ItemWriteBody {
  const auction = values.type === "auction";
  const quantity = /^\d+$/.test(values.quantity.trim()) ? Number(values.quantity.trim()) : null;
  return {
    type: values.type,
    title: values.title.trim(),
    description: values.description.trim(),
    startingBidCents: auction ? cents(values.startingBid) : null,
    priceCents: auction ? null : cents(values.price),
    quantity: auction ? null : quantity,
    photos,
  };
}

/** Where each server problem shows: the id of the control it belongs to. */
export const FIELD_CONTROLS: Record<ItemField, string> = {
  type: "item-type-auction",
  title: "item-title",
  description: "item-description",
  startingBid: "item-start",
  price: "item-price",
  quantity: "item-quantity",
  photos: "item-photos",
};

/** Dollars for an input, from stored cents ("" when there are none). */
export function dollarsField(centsValue: number | null): string {
  return centsValue === null ? "" : String(centsValue / 100);
}

export function deleteDialogTitle(title: string): string {
  return `Delete “${title}”?`;
}

export const DELETE_BODY = "This removes the item and its photos from the auction. It can't be undone.";

/** A message for an answer that isn't about a field (a cap, a closed window, a lost connection). */
export function requestFailure(status: number | null, error: string | undefined): string {
  if (status === null) return "We couldn't reach the server. Check your connection and try again.";
  if (error) return error;
  return "Something went wrong. Please try again.";
}
