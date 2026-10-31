-- Placeholder until Milestone 2 proposes the real schema; proves migrations run.
CREATE TABLE app_meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
