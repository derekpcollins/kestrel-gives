// The demo's seed data (SPEC §10, DECISIONS #76). Plain data, no database: times are offsets
// from "now", so the demo always opens live, with bidding closing in about two days. All
// people, items and charities are invented. Amounts are whole dollars here; the seed stores
// cents. tests/unit/seed-data.test.ts checks the rules this data must follow.

/** Real photos land in 2D. Until then every item photo is the placeholder image. */
export const PHOTOS_INSTALLED = false;
export const PLACEHOLDER_PHOTO = "/seed/placeholder-photo.png";
export const PLACEHOLDER_LOGO = "/seed/charities/placeholder-logo.png";
export const PLACEHOLDER_PROOF = "/seed/proofs/placeholder-proof.png";

export const EVENT = {
  name: "Kestrel Gives 2026",
  timeZone: "America/New_York",
  givingPlatformUrl: "/giving",
  // Relative to now, in hours. Live: bidding opened two days ago and closes in two days.
  submissionsOpenHoursAgo: 14 * 24,
  biddingOpenedHoursAgo: 48,
  biddingClosesInHours: 48,
};

export type Person = "maya" | "theo" | "jules" | "dev" | "priya" | "rosa" | "owen";

export const USERS: ReadonlyArray<{ key: Person; first: string; last: string; role: "admin" | "employee" }> = [
  { key: "maya", first: "Maya", last: "Okafor", role: "admin" },
  { key: "theo", first: "Theo", last: "Lindqvist", role: "admin" },
  { key: "jules", first: "Jules", last: "Ferreira", role: "employee" },
  { key: "dev", first: "Dev", last: "Kapoor", role: "employee" },
  { key: "priya", first: "Priya", last: "Natarajan", role: "employee" },
  { key: "rosa", first: "Rosa", last: "Delgado", role: "employee" },
  { key: "owen", first: "Owen", last: "Achterberg", role: "employee" },
];

export const CHARITIES = [
  { name: "Lantern Paws", description: "Fosters and rehomes cats and dogs from crowded shelters." },
  { name: "Lunchbox Brigade", description: "Packs weekend and summer meals for kids who rely on school lunch." },
  { name: "Saplingworks", description: "Plants and cares for street trees in neighborhoods with the least shade." },
] as const;

/** [bidder, dollars, hours ago] in the order they were placed. */
type Bid = readonly [Person, number, number];
/** [buyer, hours ago] */
type Purchase = readonly [Person, number];

interface BaseItem {
  slug: string;
  title: string;
  description: string;
  submitter: Person;
  /** How many photos; files are `${slug}-${n}.jpg` once PHOTOS_INSTALLED. */
  photos: number;
  /** Hours after submissions opened that it was submitted. */
  submittedAfterHours: number;
}
export interface AuctionItem extends BaseItem {
  type: "auction";
  startingBid: number;
  bids: readonly Bid[];
  cancelledHoursAgo?: number;
}
export interface InstantItem extends BaseItem {
  type: "instant";
  price: number;
  quantity: number;
  purchases: readonly Purchase[];
}
export type SeedItem = AuctionItem | InstantItem;

// Who sees what (viewing as Jules, the demo's main employee): winning on guitar lessons and
// dog-sitting, outbid on the cabin and the sourdough. Dev, Rosa and Owen bought instant-sale
// items and uploaded proof (approved, pending, rejected); none of them holds a top bid, so
// finalizing winners never changes their totals.
export const ITEMS: readonly SeedItem[] = [
  {
    slug: "lakeside-cabin-weekend", type: "auction", title: "Lakeside Cabin Weekend", submitter: "theo", photos: 5, submittedAfterHours: 3,
    description: "Two nights for up to four people in a quiet cabin on a small lake. Canoe, firewood and a stocked pantry included. Dates arranged with Theo.",
    startingBid: 150,
    bids: [["rosa", 150, 46], ["jules", 170, 40], ["dev", 185, 30], ["jules", 200, 20], ["owen", 220, 10], ["priya", 240, 3]],
  },
  {
    slug: "guitar-lessons", type: "auction", title: "Guitar lessons, four weeks", submitter: "priya", photos: 3, submittedAfterHours: 20,
    description: "Four one-hour lessons for a beginner or a rusty player, at lunch or after work. Bring any guitar; a loaner is available.",
    startingBid: 60,
    bids: [["dev", 60, 44], ["owen", 70, 25], ["jules", 85, 5]],
  },
  {
    slug: "sourdough-starter", type: "auction", title: "Sourdough starter and a loaf a month", submitter: "rosa", photos: 1, submittedAfterHours: 30,
    description: "A jar of a well-fed starter with written care notes, plus a fresh loaf on the first Monday of each month for six months.",
    startingBid: 30,
    bids: [["jules", 30, 45], ["dev", 40, 33], ["jules", 50, 12], ["maya", 60, 2]],
  },
  {
    slug: "custom-pet-portrait", type: "auction", title: "Custom pet portrait", submitter: "dev", photos: 1, submittedAfterHours: 50,
    description: "A painted portrait of your pet from a photo, about the size of a paperback, ready to frame.",
    startingBid: 40,
    bids: [],
  },
  {
    slug: "pottery-class", type: "auction", title: "Pottery class for two", submitter: "jules", photos: 3, submittedAfterHours: 70,
    description: "An evening at the wheel for two people with Jules. You'll make a bowl or a mug each, glazed and fired for you to pick up later.",
    startingBid: 30,
    bids: [],
  },
  {
    slug: "bike-tune-up", type: "auction", title: "Bike tune-up at your desk", submitter: "owen", photos: 1, submittedAfterHours: 90,
    description: "Owen picks up your bike from the rack, tunes the gears and brakes, pumps the tires and brings it back by the end of the day.",
    startingBid: 25,
    bids: [["priya", 25, 30], ["theo", 35, 8]],
  },
  {
    slug: "pasta-night", type: "auction", title: "Homemade pasta night for four", submitter: "maya", photos: 1, submittedAfterHours: 110,
    description: "Maya makes fresh pasta, two sauces and a salad for you and three friends, at your place or hers.",
    startingBid: 50,
    bids: [["owen", 50, 20], ["priya", 55, 7]],
  },
  {
    slug: "vegetable-bed", type: "auction", title: "Help planting a vegetable bed", submitter: "theo", photos: 1, submittedAfterHours: 130,
    description: "A Saturday morning of digging, planting and mulching a small vegetable bed, with seedlings for tomatoes, beans and herbs.",
    startingBid: 35,
    bids: [["rosa", 35, 40], ["jules", 45, 15], ["maya", 50, 6]],
  },
  {
    slug: "dog-sitting", type: "auction", title: "Weekend dog-sitting", submitter: "maya", photos: 1, submittedAfterHours: 150,
    description: "Friday evening to Sunday evening at Maya's house, with a fenced yard and two long walks a day. One dog, any size.",
    startingBid: 40,
    bids: [["dev", 40, 36], ["jules", 50, 9]],
  },
  {
    slug: "board-game-night", type: "auction", title: "Board game night, hosted", submitter: "owen", photos: 1, submittedAfterHours: 170,
    description: "Owen hosts four to six people for an evening of board games, with snacks and a short lesson for each game.",
    startingBid: 20,
    bids: [["jules", 20, 40], ["priya", 25, 30]],
    cancelledHoursAgo: 24,
  },
  {
    slug: "hot-sauce-trio", type: "instant", title: "Homemade hot sauce trio", submitter: "dev", photos: 3, submittedAfterHours: 10,
    description: "Three small bottles: a mild green, a smoky red and a very hot habanero. Made in small batches in Dev's kitchen.",
    price: 20, quantity: 12,
    purchases: [["rosa", 47], ["owen", 46], ["jules", 44], ["maya", 40], ["priya", 36], ["theo", 30], ["rosa", 22], ["jules", 18], ["priya", 9], ["theo", 4]],
  },
  {
    slug: "hand-knit-scarf", type: "instant", title: "Hand-knit scarf", submitter: "rosa", photos: 1, submittedAfterHours: 40,
    description: "A long, soft wool scarf in your choice of forest green, rust or navy. Knitted to order.",
    price: 45, quantity: 8,
    purchases: [["dev", 42], ["jules", 13]],
  },
  {
    slug: "lemon-bars", type: "instant", title: "Lemon bars, a dozen", submitter: "priya", photos: 1, submittedAfterHours: 60,
    description: "Twelve tangy lemon bars on a shortbread base, delivered to your desk on a day you choose.",
    price: 15, quantity: 6,
    purchases: [["dev", 47], ["owen", 45], ["maya", 38], ["jules", 26], ["theo", 16], ["dev", 6]],
  },
  {
    slug: "candles", type: "instant", title: "Hand-poured candles, set of three", submitter: "owen", photos: 1, submittedAfterHours: 80,
    description: "Three soy candles in reused jars: cedar, orange peel and unscented.",
    price: 25, quantity: 10,
    purchases: [["rosa", 39], ["jules", 28], ["theo", 11]],
  },
  {
    slug: "desk-plant", type: "instant", title: "Desk plant in a hand-painted pot", submitter: "theo", photos: 1, submittedAfterHours: 100,
    description: "An easy-care pothos in a small pot Theo painted by hand. Happy in low light.",
    price: 30, quantity: 5,
    purchases: [["dev", 35], ["priya", 21]],
  },
  {
    slug: "banana-bread", type: "instant", title: "Banana bread, two loaves", submitter: "jules", photos: 1, submittedAfterHours: 120,
    description: "Two loaves of banana bread with walnuts, or without if you prefer. Baked the day you pick them up.",
    price: 12, quantity: 10,
    purchases: [],
  },
];

/** Proofs uploaded during the live phase by people who bought instant-sale items. */
export const PROOFS: ReadonlyArray<{
  person: Person;
  amount: number;
  status: "pending" | "approved" | "rejected";
  hoursAgo: number;
  rejectionReason?: string;
}> = [
  { person: "dev", amount: 105, status: "approved", hoursAgo: 5 },
  { person: "rosa", amount: 60, status: "pending", hoursAgo: 3 },
  {
    person: "owen", amount: 35, status: "rejected", hoursAgo: 8,
    rejectionReason: "The screenshot doesn't show the donation amount. Please upload one that does.",
  },
];

/** Who reviewed the reviewed proofs, and how long after upload. */
export const PROOF_REVIEWER: Person = "maya";
export const REVIEW_AFTER_HOURS = 1;

export function photoPath(slug: string, n: number): string {
  return PHOTOS_INSTALLED ? `/seed/photos/${slug}-${n}.jpg` : PLACEHOLDER_PHOTO;
}
