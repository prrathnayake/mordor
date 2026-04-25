-- Add missing standalone index on observed_at for capture service queries
-- that filter by observed_at without object_id

BEGIN;

CREATE INDEX IF NOT EXISTS canonical_events_observed_at_idx
ON canonical_events (observed_at);

COMMIT;