-- One-off data steps run by the production deploy (DECISIONS #84), recorded by name like
-- migrations so each runs exactly once. The row is written in the same transaction as the
-- step's work: if the work fails, neither is kept and the next deploy tries again.
CREATE TABLE deploy_steps (
  name    text PRIMARY KEY CHECK (name ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ran_at  timestamptz NOT NULL DEFAULT now()
);
