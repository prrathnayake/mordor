BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE sources (
  source_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  owner TEXT NOT NULL,
  auth_ref TEXT NOT NULL,
  polling_mode TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE tracked_objects (
  object_id TEXT PRIMARY KEY,
  object_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  source_primary TEXT NOT NULL REFERENCES sources(source_id) ON DELETE RESTRICT,
  latest_state_ref TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE raw_payloads (
  raw_payload_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE RESTRICT,
  received_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL,
  parse_status TEXT NOT NULL CHECK (parse_status IN ('received', 'parsed', 'quarantined')),
  adapter_version TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  failure_code TEXT NULL,
  failure_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE TABLE canonical_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  object_id TEXT NOT NULL REFERENCES tracked_objects(object_id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE RESTRICT,
  observed_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL,
  payload JSONB NOT NULL,
  provenance JSONB NOT NULL,
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  dedupe_key TEXT NOT NULL,
  geometry geometry(Geometry, 4326) NULL,
  altitude_m DOUBLE PRECISION NULL,
  heading_deg DOUBLE PRECISION NULL,
  speed_mps DOUBLE PRECISION NULL,
  related_object_ids TEXT[] NOT NULL DEFAULT '{}',
  parent_event_id TEXT NULL REFERENCES canonical_events(event_id) ON DELETE RESTRICT,
  trace_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, dedupe_key),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (jsonb_typeof(provenance) = 'object')
);

CREATE INDEX canonical_events_object_observed_idx
  ON canonical_events (object_id, observed_at);

CREATE INDEX canonical_events_source_ingested_idx
  ON canonical_events (source_id, ingested_at);

CREATE INDEX canonical_events_geometry_idx
  ON canonical_events
  USING GIST (geometry);

CREATE OR REPLACE FUNCTION forbid_canonical_event_mutation()
RETURNS trigger
AS $$
BEGIN
  RAISE EXCEPTION 'canonical_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER canonical_events_no_update
  BEFORE UPDATE OR DELETE ON canonical_events
  FOR EACH ROW
  EXECUTE FUNCTION forbid_canonical_event_mutation();

CREATE TABLE latest_object_states (
  object_id TEXT PRIMARY KEY REFERENCES tracked_objects(object_id) ON DELETE RESTRICT,
  state_version TEXT NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  position geometry(Point, 4326) NULL,
  velocity JSONB NULL,
  status TEXT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_event_id TEXT NOT NULL REFERENCES canonical_events(event_id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (velocity IS NULL OR jsonb_typeof(velocity) = 'object'),
  CHECK (jsonb_typeof(attributes) = 'object')
);

CREATE INDEX latest_object_states_position_idx
  ON latest_object_states
  USING GIST (position);

CREATE TABLE alerts (
  alert_id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ NULL,
  acknowledged_at TIMESTAMPTZ NULL,
  acknowledged_by TEXT NULL,
  schema_version TEXT NOT NULL,
  evidence_event_ids TEXT[] NOT NULL,
  evidence_object_ids TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL,
  explanation TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cardinality(evidence_event_ids) > 0)
);

CREATE INDEX alerts_status_opened_idx
  ON alerts (status, opened_at);

CREATE TABLE audit_logs (
  audit_id BIGSERIAL PRIMARY KEY,
  actor_id TEXT NULL,
  actor_type TEXT NOT NULL,
  operation TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NULL,
  trace_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  result TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX audit_logs_target_idx
  ON audit_logs (target_type, target_id, occurred_at);

CREATE TABLE source_health (
  source_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'stale', 'error')),
  last_seen_at TIMESTAMPTZ NOT NULL,
  error_message TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX source_health_status_idx
  ON source_health (status);

COMMIT;
