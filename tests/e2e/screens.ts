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
  { name: "design-system", path: "/design-system/" }, // every component, every state
];
