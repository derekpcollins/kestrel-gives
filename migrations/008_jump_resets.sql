-- Jump to "Submissions open" clears bids, purchases and proofs (owner, Milestone 7A review;
-- DECISIONS #81, #124), under the same global cooldown as Restore, which is read from this log.
-- So the log may now record that jump too. Widening a CHECK is additive: older deployments
-- never write 'jump', and they read the log only for the cooldown and the cron's dedupe.
ALTER TABLE demo_restores DROP CONSTRAINT demo_restores_source_check;
ALTER TABLE demo_restores ADD CONSTRAINT demo_restores_source_check CHECK (source IN ('manual', 'cron', 'deploy', 'jump'));
