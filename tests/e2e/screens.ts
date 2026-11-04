// Every screen the browser checks visit. Each milestone adds its screens (and seeded
// states) here, so the accessibility and visual checks cover them automatically.

export interface Screen {
  name: string;
  path: string;
  /** The demo viewer's user id (the kg_viewer cookie); the default viewer (Jules) when absent. */
  viewer?: string;
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
  // Milestone 5D: the proof page (what it shows follows the dev phase and viewer) and the giving stub.
  { name: "proof", path: "/your-items/proof" },
  { name: "giving", path: "/giving" },
  // Milestone 6B: the Admin Dashboard as Maya (the plain "admin" screen above is Jules: For admins only).
  { name: "admin-totals", path: "/admin", viewer: "1" },
  { name: "admin-people", path: "/admin/people", viewer: "1" },
  { name: "admin-proofs", path: "/admin/proofs", viewer: "1" },
  { name: "admin-items", path: "/admin/items", viewer: "1" },
  { name: "admin-settings", path: "/admin/settings", viewer: "1" },
  { name: "admin-templates", path: "/admin/templates", viewer: "1" },
  // Milestone 6F: Reset for next year (locked on the seeded live event).
  { name: "admin-reset", path: "/admin/reset", viewer: "1" },
  { name: "design-system", path: "/design-system/" }, // every component, every state
];

/** Sets the screen's viewer cookie, if it has one, before the page loads. */
export async function viewAs(page: { context(): { addCookies(c: { name: string; value: string; url: string }[]): Promise<void> } }, screen: Screen, baseURL: string | undefined): Promise<void> {
  if (screen.viewer) await page.context().addCookies([{ name: "kg_viewer", value: screen.viewer, url: baseURL ?? "http://localhost:3000" }]);
}
