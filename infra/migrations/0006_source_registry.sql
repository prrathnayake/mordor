-- Migration: Source Registry
-- Adds tables for source context, coverage, snapshots, and linking

BEGIN;

-- Source registry: extended source metadata beyond source_health
CREATE TABLE source_registry (
  source_id TEXT PRIMARY KEY REFERENCES sources(source_id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('camera', 'radar', 'satellite', 'adsb', 'ais', 'sensor', 'manual')),
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  lat DOUBLE PRECISION NULL,
  lon DOUBLE PRECISION NULL,
  alt_m DOUBLE PRECISION NULL,
  heading_deg DOUBLE PRECISION NULL,
  coverage geometry(Geometry, 4326) NULL,
  coverage_type TEXT NULL CHECK (coverage_type IN ('cone', 'polygon', 'circle') OR coverage_type IS NULL),
  coverage_heading_deg DOUBLE PRECISION NULL,
  coverage_fov_deg DOUBLE PRECISION NULL,
  coverage_range_m DOUBLE PRECISION NULL,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'stale', 'error', 'disconnected')),
  last_update TIMESTAMPTZ NOT NULL,
  snapshot_available BOOLEAN NOT NULL DEFAULT false,
  live_available BOOLEAN NOT NULL DEFAULT false,
  linked_object_ids TEXT[] NOT NULL DEFAULT '{}',
  linked_alert_ids TEXT[] NOT NULL DEFAULT '{}',
  linked_incident_ids TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX source_registry_type_idx ON source_registry (source_type);
CREATE INDEX source_registry_status_idx ON source_registry (status);
CREATE INDEX source_registry_provider_idx ON source_registry (provider);
CREATE INDEX source_registry_geometry_idx ON source_registry USING GIST (coverage);
CREATE INDEX source_registry_objects_idx ON source_registry USING GIN (linked_object_ids);
CREATE INDEX source_registry_alerts_idx ON source_registry USING GIN (linked_alert_ids);
CREATE INDEX source_registry_incidents_idx ON source_registry USING GIN (linked_incident_ids);

-- Source snapshots: metadata for captured snapshots
CREATE TABLE source_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES source_registry(source_id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL,
  url TEXT NULL,
  thumbnail_url TEXT NULL,
  width INTEGER NULL,
  height INTEGER NULL,
  format TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX source_snapshots_source_idx ON source_snapshots (source_id);
CREATE INDEX source_snapshots_captured_idx ON source_snapshots (captured_at DESC);

-- Source links: explicit or nearest links from objects/alerts/incidents to sources
CREATE TABLE source_links (
  source_id TEXT NOT NULL REFERENCES source_registry(source_id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('object', 'alert', 'incident')),
  target_id TEXT NOT NULL,
  link_type TEXT NOT NULL CHECK (link_type IN ('explicit', 'nearest')),
  distance_m DOUBLE PRECISION NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_id, target_type, target_id)
);

CREATE INDEX source_links_target_idx ON source_links (target_type, target_id);
CREATE INDEX source_links_type_idx ON source_links (link_type);

-- Populate source_registry from existing sources and source_health
INSERT INTO source_registry (
  source_id,
  source_type,
  provider,
  label,
  status,
  last_update,
  metadata
)
SELECT
  s.source_id,
  s.source_type,
  s.owner AS provider,
  s.name AS label,
  COALESCE(sh.status, s.status) AS status,
  COALESCE(sh.last_seen_at, s.updated_at) AS last_update,
  jsonb_build_object(
    'owner', s.owner,
    'polling_mode', s.polling_mode,
    'schema_version', s.schema_version
  ) AS metadata
FROM sources s
LEFT JOIN source_health sh ON sh.source_id = s.source_id
ON CONFLICT (source_id) DO NOTHING;

-- Trigger for updated_at
CREATE TRIGGER source_registry_updated_at
  BEFORE UPDATE ON source_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;
