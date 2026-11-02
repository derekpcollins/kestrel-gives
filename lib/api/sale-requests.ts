// Input checks for the items, bids and purchases endpoints (SPEC §11, DECISIONS #87). Pure, so
// node:test covers them. Money arrives as cents and must be whole dollars (SPEC §7.9).
import { BROWSE_SORTS } from "../data/items.ts";
import type { BrowseSort, ItemType } from "../../src/items-api.ts";

const ID = /^[1-9]\d{0,17}$/;

function asId(value: unknown): string | null {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === "string" && ID.test(text) ? text : null;
}

function asObject(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

export type ItemsQuery = { kind: "one"; id: string } | { kind: "list"; type: ItemType; sort: BrowseSort };

/** `?id=12`, or `?type=auction|instant&sort=newest|price|bids` (sort defaults to newest). */
export function parseItemsQuery(params: URLSearchParams): ItemsQuery | { error: string } {
  if (params.has("id")) {
    const id = asId(params.get("id"));
    return id ? { kind: "one", id } : { error: "id must be an item id." };
  }
  const type = params.get("type");
  if (type !== "auction" && type !== "instant") return { error: "type must be auction or instant." };
  const sort = params.get("sort") ?? "newest";
  if (!(BROWSE_SORTS as readonly string[]).includes(sort)) return { error: "sort must be newest, price or bids." };
  if (sort === "bids" && type === "instant") return { error: "Instant-sale items have no bids to sort by." };
  return { kind: "list", type, sort: sort as BrowseSort };
}

export interface BidRequest {
  itemId: string;
  amountCents: number;
  seenHighBidCents?: number | null;
}

/** `{ itemId, amountCents, seenHighBidCents? }`. Amounts other than whole dollars are refused. */
export function parseBidRequest(body: unknown): BidRequest | { error: string } {
  const b = asObject(body);
  if (!b) return { error: "Expected a JSON object." };
  const itemId = asId(b["itemId"]);
  if (!itemId) return { error: "itemId must be an item id." };
  const amount = b["amountCents"];
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 || amount % 100 !== 0) return { error: "Whole dollars only." };
  const seen = b["seenHighBidCents"];
  if (seen !== undefined && seen !== null && (typeof seen !== "number" || !Number.isSafeInteger(seen) || seen <= 0)) {
    return { error: "seenHighBidCents must be a number of cents or null." };
  }
  return seen === undefined ? { itemId, amountCents: amount } : { itemId, amountCents: amount, seenHighBidCents: seen };
}

/** `{ itemId }`: one unit per purchase, so there is no quantity (DECISIONS #88). */
export function parseBuyRequest(body: unknown): { itemId: string } | { error: string } {
  const b = asObject(body);
  if (!b) return { error: "Expected a JSON object." };
  const itemId = asId(b["itemId"]);
  return itemId ? { itemId } : { error: "itemId must be an item id." };
}
