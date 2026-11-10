// localStorage that never throws (DECISIONS entry 141). With storage blocked (cookies off, some
// privacy modes) even reading `window.localStorage` throws, which would stop the demo bar and
// the shell. A failed read is null; a failed write is false, so callers can fall back.

/** The stored value, or null if there is none or storage can't be read. */
export function readItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** True if the value was stored. */
export function writeItem(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** False when storage is blocked, so a value can't be remembered between page loads. */
export function storageWorks(): boolean {
  try {
    const probe = "kestrel-storage-probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
