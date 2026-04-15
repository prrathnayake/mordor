-- Migration: Incident Intelligence
-- Adds incident-centric public-source artifacts, widget manifests, and collection run tracking

BEGIN;

CREATE TABLE incident_intelligence_runs (
  run_id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  run_type TEXT NOT NULL CHECK (run_type IN ('articles', 'images', 'videos', 'fusion')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NULL,
  error_message TEXT NULL,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(stats) = 'object')
);

CREATE INDEX incident_intelligence_runs_incident_idx
  ON incident_intelligence_runs (incident_id, started_at DESC);

CREATE TABLE incident_intelligence_artifacts (
  artifact_id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('article', 'image', 'video', 'report')),
  provider TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  thumbnail_url TEXT NULL,
  author TEXT NULL,
  published_at TIMESTAMPTZ NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  location GEOMETRY(Point, 4326) NULL,
  verification_status TEXT NOT NULL CHECK (
    verification_status IN ('unverified', 'single_source', 'cross_checked', 'trusted_source')
  ),
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_urls TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (incident_id, dedupe_key)
);

CREATE INDEX incident_intelligence_artifacts_incident_idx
  ON incident_intelligence_artifacts (incident_id, captured_at DESC);
CREATE INDEX incident_intelligence_artifacts_type_idx
  ON incident_intelligence_artifacts (incident_id, artifact_type, captured_at DESC);

CREATE TABLE incident_widget_manifests (
  widget_id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  widget_key TEXT NOT NULL,
  widget_type TEXT NOT NULL CHECK (
    widget_type IN (
      'summary',
      'map_context',
      'related_articles',
      'media_gallery',
      'source_provenance',
      'pattern_brief'
    )
  ),
  title TEXT NOT NULL,
  layout TEXT NOT NULL CHECK (layout IN ('primary', 'secondary', 'context')),
  priority INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  generated_by TEXT NOT NULL,
  spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(spec) = 'object'),
  UNIQUE (incident_id, widget_key)
);

CREATE INDEX incident_widget_manifests_incident_idx
  ON incident_widget_manifests (incident_id, priority ASC, updated_at DESC);

CREATE TRIGGER incident_intelligence_runs_updated_at
  BEFORE UPDATE ON incident_intelligence_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER incident_intelligence_artifacts_updated_at
  BEFORE UPDATE ON incident_intelligence_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER incident_widget_manifests_updated_at
  BEFORE UPDATE ON incident_widget_manifests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;
