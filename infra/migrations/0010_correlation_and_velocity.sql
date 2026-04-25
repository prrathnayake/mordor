-- Migration: Cross-domain correlation signals and velocity metrics
BEGIN;

CREATE TABLE correlation_signals (
  signal_id TEXT PRIMARY KEY,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('convergence', 'velocity_spike', 'geo_convergence', 'layer_correlation', 'prediction_leads_news')),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'dismissed')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  source_types TEXT[] NOT NULL DEFAULT '{}',
  layer_ids TEXT[] NOT NULL DEFAULT '{}',
  incident_ids TEXT[] NOT NULL DEFAULT '{}',
  entity_ids TEXT[] NOT NULL DEFAULT '{}',
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  observed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NULL,
  dedupe_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (dedupe_key)
);

CREATE INDEX correlation_signals_active_idx
  ON correlation_signals (status, observed_at DESC)
  WHERE status = 'active';
CREATE INDEX correlation_signals_severity_idx
  ON correlation_signals (severity, observed_at DESC);
CREATE INDEX correlation_signals_type_idx
  ON correlation_signals (signal_type, observed_at DESC);

ALTER TABLE incident_intelligence_artifacts
  ADD COLUMN IF NOT EXISTS mention_velocity DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS story_phase TEXT NULL CHECK (story_phase IN ('breaking', 'developing', 'sustained', 'fading', 'unknown')),
  ADD COLUMN IF NOT EXISTS source_tier INTEGER NULL CHECK (source_tier >= 1 AND source_tier <= 4);

CREATE TRIGGER correlation_signals_updated_at
  BEFORE UPDATE ON correlation_signals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;
