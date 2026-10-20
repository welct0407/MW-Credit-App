-- Receipt cycle speed measurement (owner decision 20 October 2026): record when a partner notice was
-- definitely accepted (Instagram ACCEPTED, or email fallback SENT) so result-notice delivery time is
-- measurable; runtime.job_runs records effectful runs only. Nullable, no backfill: earlier rows stay NULL.
-- Immutable after application.
SET LOCAL ROLE mw_agent_owner;

ALTER TABLE runtime.partner_notices ADD COLUMN accepted_at timestamptz;
-- The V2 table-level grants (worker SELECT,INSERT,UPDATE) cover the new column; no column-level grants exist.
