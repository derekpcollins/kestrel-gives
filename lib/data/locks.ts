// Advisory lock keys. One place, so migrations, deploys and the demo controls share them.

/** Held by migrations and the deploy step (session lock) and by Jump/Restore (transaction lock). */
export const SCHEMA_LOCK_KEY = 74_012_026;
