// Browser checks start with the welcome dialog already seen (DECISIONS entry 140), so it never
// covers the page under test. playwright.config.ts makes this every context's default, and
// visual.spec.ts passes it to the contexts it opens itself. welcome.spec.ts starts empty.
import { WELCOME_KEY } from "../../src/components/welcome-rules.ts";

export const BASE_URL = "http://localhost:3000";

export const WELCOME_SEEN = {
  cookies: [],
  origins: [{ origin: BASE_URL, localStorage: [{ name: WELCOME_KEY, value: "true" }] }],
};
