// Every screen the browser checks visit. Each milestone adds its screens (and seeded
// states) here, so the accessibility and visual checks cover them automatically.

export interface Screen {
  name: string;
  path: string;
}

export const SCREENS: readonly Screen[] = [{ name: "home", path: "/" }];
