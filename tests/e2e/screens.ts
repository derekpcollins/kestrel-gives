// Every screen the browser checks visit. Each milestone adds its screens (and seeded
// states) here, so the accessibility and visual checks cover them automatically.

export interface Screen {
  name: string;
  path: string;
}

export const SCREENS: readonly Screen[] = [
  { name: "home", path: "/" },
  // Milestone 3B: placeholder pages inside the real shell.
  { name: "silent-auction", path: "/silent-auction" },
  { name: "instant-sale", path: "/instant-sale" },
  { name: "your-items", path: "/your-items" },
  { name: "submit", path: "/submit" },
  { name: "admin", path: "/admin" },
  // Milestone 4C: item pages (seeded ids are stable: the seed restarts identities).
  { name: "item-auction", path: "/items/1" }, // five photos, six bids, the crown
  { name: "item-instant", path: "/items/13" }, // sold out
  { name: "item-cancelled", path: "/items/10" },
  { name: "item-not-found", path: "/items/99999" },
  // Milestone 5B: the edit form (Jules's pottery class, seeded id 5).
  { name: "item-edit", path: "/items/5/edit" },
  { name: "design-system", path: "/design-system/" }, // every component, every state
];
