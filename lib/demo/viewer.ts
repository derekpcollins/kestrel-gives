// "Viewing as" (SPEC §3.1, DECISIONS #81): a cookie holding the user id of whoever the
// visitor is pretending to be. This mock login is not security; a real deployment would use
// company login.
import type { Id } from "../data/db.ts";

export const VIEWER_COOKIE = "kg_viewer";
const ONE_YEAR = 365 * 24 * 60 * 60;

export interface Person {
  id: Id;
  firstName: string;
  lastName: string;
  role: "admin" | "employee";
}

/** The id in the viewer cookie, if it looks like one. Never trusted beyond "is this a seeded user". */
export function viewerIdFrom(cookieHeader: string | null): Id | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === VIEWER_COOKIE) {
      const value = rest.join("=").trim();
      return /^[1-9]\d{0,17}$/.test(value) ? value : null;
    }
  }
  return null;
}

/** The person the cookie names; otherwise Jules, the demo's main employee; otherwise the first person. */
export function resolveViewer(people: readonly Person[], id: Id | null): Person | null {
  return (
    people.find((p) => p.id === id) ??
    people.find((p) => p.firstName === "Jules" && p.role === "employee") ??
    people[0] ??
    null
  );
}

export function viewerCookie(id: Id, secure: boolean): string {
  return `${VIEWER_COOKIE}=${id}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
