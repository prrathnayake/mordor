-- Migration: Intelligence Source Catalog
-- Stores planned and active intelligence sources plus embeddable media observations.

BEGIN;

CREATE TABLE intelligence_source_catalog (
  source_id TEXT PRIMARY KEY,
  layer_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (
    source_type IN ('hazard', 'atmosphere', 'space', 'maritime', 'media', 'cyber', 'health')
  ),
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  source_url TEXT NOT NULL,
  license TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('real', 'degraded', 'planned')),
  update_cadence_seconds INTEGER NOT NULL CHECK (update_cadence_seconds >= 0),
  geometry geometry(Point, 4326),
  coverage TEXT NOT NULL CHECK (coverage IN ('global', 'regional', 'point', 'non_map')),
  normalized_event_type TEXT NOT NULL,
  storage_targets JSONB NOT NULL,
  watch_capabilities JSONB NOT NULL,
  useful_fields JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(storage_targets) = 'array'),
  CHECK (jsonb_typeof(watch_capabilities) = 'array'),
  CHECK (jsonb_typeof(useful_fields) = 'array'),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX intelligence_source_catalog_layer_idx ON intelligence_source_catalog (layer_id, status);
CREATE INDEX intelligence_source_catalog_type_idx ON intelligence_source_catalog (source_type);
CREATE INDEX intelligence_source_catalog_geometry_idx
  ON intelligence_source_catalog USING GIST (geometry);

CREATE TABLE intelligence_media_observations (
  observation_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES intelligence_source_catalog(source_id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  geometry geometry(Point, 4326),
  title TEXT NOT NULL,
  summary TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('video', 'image', 'text', 'stream')),
  embed_url TEXT,
  source_url TEXT NOT NULL,
  confidence NUMERIC(4, 3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX intelligence_media_observations_source_idx
  ON intelligence_media_observations (source_id, observed_at DESC);
CREATE INDEX intelligence_media_observations_geometry_idx
  ON intelligence_media_observations USING GIST (geometry);

CREATE TRIGGER intelligence_source_catalog_updated_at
  BEFORE UPDATE ON intelligence_source_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;
