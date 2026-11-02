-- A log of Restore demo data runs (SPEC §3.1, DECISIONS #80, #81). It drives the global
-- cooldown on Restore and the daily cron's dedupe. Not one of the app tables the seed
-- truncates, so a restore never erases its own record. Additive: older deployments ignore it.
CREATE TABLE demo_restores (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source       text NOT NULL CHECK (source IN ('manual', 'cron', 'deploy')),
  restored_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX demo_restores_recent ON demo_restores (restored_at DESC);
