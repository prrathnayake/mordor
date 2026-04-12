-- Migration: Swan Protocol
-- Adds lightweight background research session, activity, thread, finding, and artifact tables

BEGIN;

CREATE TABLE swan_sessions (
  session_id TEXT PRIMARY KEY,
  client_session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'expired')),
  current_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_activity_at TIMESTAMPTZ NOT NULL,
  last_projection_at TIMESTAMPTZ NULL,
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disabled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(current_context) = 'object'),
  UNIQUE (user_id, client_session_id)
);

CREATE INDEX swan_sessions_status_idx ON swan_sessions (status);
CREATE INDEX swan_sessions_last_activity_idx ON swan_sessions (last_activity_at DESC);

CREATE TABLE swan_activity_events (
  activity_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES swan_sessions(session_id) ON DELETE CASCADE,
  client_session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  target_type TEXT NULL,
  target_id TEXT NULL,
  route TEXT NULL,
  mode TEXT NULL,
  activity_key TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    activity_type IN (
      'object_selected',
      'alert_opened',
      'incident_opened',
      'mode_switched',
      'replay_query_submitted',
      'layer_toggled',
      'map_selection_changed',
      'session_enabled',
      'session_disabled',
      'session_restored',
      'auth_changed'
    )
  ),
  CHECK (
    target_type IS NULL OR
    target_type IN (
      'object',
      'alert',
      'incident',
      'mode',
      'replay_window',
      'layer',
      'session',
      'map_selection',
      'system',
      'unknown'
    )
  ),
  CHECK (mode IS NULL OR mode IN ('live', 'replay')),
  CHECK (jsonb_typeof(context) = 'object')
);

CREATE INDEX swan_activity_events_session_idx ON swan_activity_events (session_id, occurred_at DESC);
CREATE INDEX swan_activity_events_key_idx ON swan_activity_events (session_id, activity_key, occurred_at DESC);

CREATE TABLE swan_threads (
  thread_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES swan_sessions(session_id) ON DELETE CASCADE,
  recipe TEXT NOT NULL CHECK (
    recipe IN ('context', 'verify', 'research', 'watch', 'window_watch', 'layer_watch')
  ),
  target_type TEXT NULL,
  target_id TEXT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'running', 'completed', 'failed', 'cancelled')
  ),
  priority INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT NOT NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_interval_ms INTEGER NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  queued_at TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  last_run_at TIMESTAMPTZ NULL,
  next_run_at TIMESTAMPTZ NULL,
  error_message TEXT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    target_type IS NULL OR
    target_type IN (
      'object',
      'alert',
      'incident',
      'mode',
      'replay_window',
      'layer',
      'session',
      'map_selection',
      'system',
      'unknown'
    )
  ),
  CHECK (jsonb_typeof(context) = 'object'),
  UNIQUE (session_id, dedupe_key)
);

CREATE INDEX swan_threads_status_idx ON swan_threads (status, queued_at ASC);
CREATE INDEX swan_threads_next_run_idx ON swan_threads (next_run_at ASC);
CREATE INDEX swan_threads_session_idx ON swan_threads (session_id, updated_at DESC);

CREATE TABLE swan_findings (
  finding_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES swan_sessions(session_id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES swan_threads(thread_id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (
    target_type IN (
      'object',
      'alert',
      'incident',
      'mode',
      'replay_window',
      'layer',
      'session',
      'map_selection',
      'system',
      'unknown'
    )
  ),
  target_id TEXT NOT NULL,
  finding_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_status TEXT NOT NULL CHECK (
    verification_status IN ('unverified', 'single_source', 'cross_checked', 'trusted_source')
  ),
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  projection_targets TEXT[] NOT NULL DEFAULT '{}',
  source_urls TEXT[] NOT NULL DEFAULT '{}',
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  lat DOUBLE PRECISION NULL,
  lon DOUBLE PRECISION NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(details) = 'object'),
  CHECK (jsonb_typeof(media) = 'array')
);

CREATE INDEX swan_findings_session_idx ON swan_findings (session_id, generated_at DESC);
CREATE INDEX swan_findings_thread_idx ON swan_findings (thread_id, generated_at DESC);
CREATE INDEX swan_findings_target_idx ON swan_findings (session_id, target_type, target_id, generated_at DESC);
CREATE INDEX swan_findings_verification_idx ON swan_findings (verification_status, generated_at DESC);
CREATE INDEX swan_findings_projection_idx ON swan_findings USING GIN (projection_targets);

CREATE TABLE swan_artifacts (
  artifact_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES swan_sessions(session_id) ON DELETE CASCADE,
  artifact_key TEXT NOT NULL,
  projection TEXT NOT NULL CHECK (projection IN ('session', 'panels', 'map', 'notifications', 'thread')),
  file_path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, artifact_key)
);

CREATE INDEX swan_artifacts_session_idx ON swan_artifacts (session_id, generated_at DESC);

CREATE TRIGGER swan_sessions_updated_at
  BEFORE UPDATE ON swan_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER swan_threads_updated_at
  BEFORE UPDATE ON swan_threads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER swan_artifacts_updated_at
  BEFORE UPDATE ON swan_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;
