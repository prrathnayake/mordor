-- Migration: Inferred Intelligence Layers
-- Adds tables for derived operational intelligence

BEGIN;

-- Inferred events table
CREATE TABLE inferred_events (
  inference_id TEXT PRIMARY KEY,
  inference_type TEXT NOT NULL CHECK (inference_type IN ('nav_degradation', 'route_redirection', 'holding_pattern', 'absence_signal', 'anomaly')),
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('low', 'medium', 'high', 'very_high')),
  time_window_start TIMESTAMPTZ NOT NULL,
  time_window_end TIMESTAMPTZ NOT NULL,
  aoi geometry(Polygon, 4326),
  related_source_ids TEXT[] NOT NULL DEFAULT '{}',
  related_object_ids TEXT[] NOT NULL DEFAULT '{}',
  related_event_ids TEXT[] NOT NULL DEFAULT '{}',
  evidence_summary TEXT NOT NULL,
  inferred_status TEXT NOT NULL DEFAULT 'active' CHECK (inferred_status IN ('active', 'resolved', 'expired', 'invalidated')),
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(details) = 'object'),
  CHECK (time_window_end >= time_window_start)
);

CREATE INDEX inferred_events_type_idx ON inferred_events (inference_type);
CREATE INDEX inferred_events_status_idx ON inferred_events (inferred_status);
CREATE INDEX inferred_events_confidence_idx ON inferred_events (confidence_level);
CREATE INDEX inferred_events_time_idx ON inferred_events (time_window_start, time_window_end);
CREATE INDEX inferred_events_geometry_idx ON inferred_events USING GIST (aoi);

-- Degradation zones table (for nav degradation heatmap)
CREATE TABLE degradation_zones (
  zone_id TEXT PRIMARY KEY,
  polygon geometry(Polygon, 4326) NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'severe')),
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  affected_signals INTEGER NOT NULL DEFAULT 0,
  estimated_area_sqkm DOUBLE PRECISION NOT NULL DEFAULT 0,
  inferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expired_at TIMESTAMPTZ,
  evidence_refs TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX degradation_zones_severity_idx ON degradation_zones (severity);
CREATE INDEX degradation_zones_geometry_idx ON degradation_zones USING GIST (polygon);
CREATE INDEX degradation_zones_inferred_idx ON degradation_zones (inferred_at);

-- Route redirection events table
CREATE TABLE route_redirections (
  redirection_id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL,
  inference_id TEXT NOT NULL REFERENCES inferred_events(inference_id) ON DELETE CASCADE,
  original_path JSONB NOT NULL,
  actual_path JSONB NOT NULL,
  deviation_meters DOUBLE PRECISION NOT NULL,
  deviation_point geometry(Point, 4326),
  probable_cause TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(original_path) = 'array'),
  CHECK (jsonb_typeof(actual_path) = 'array')
);

CREATE INDEX route_redirections_object_idx ON route_redirections (object_id);
CREATE INDEX route_redirections_inference_idx ON route_redirections (inference_id);

-- Holding pattern events table
CREATE TABLE holding_patterns (
  pattern_id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL,
  inference_id TEXT NOT NULL REFERENCES inferred_events(inference_id) ON DELETE CASCADE,
  center_point geometry(Point, 4326) NOT NULL,
  radius_meters DOUBLE PRECISION NOT NULL,
  loop_count INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  orbit_type TEXT,
  heading_changes INTEGER NOT NULL DEFAULT 0,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX holding_patterns_object_idx ON holding_patterns (object_id);
CREATE INDEX holding_patterns_inference_idx ON holding_patterns (inference_id);
CREATE INDEX holding_patterns_geometry_idx ON holding_patterns USING GIST (center_point);

-- Heatmap grid cells table
CREATE TABLE heatmap_grid_cells (
  cell_id TEXT PRIMARY KEY,
  grid_id TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  cell_type TEXT NOT NULL DEFAULT 'degradation',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE (grid_id, lat, lon)
);

CREATE INDEX heatmap_cells_grid_idx ON heatmap_grid_cells (grid_id);
CREATE INDEX heatmap_cells_geometry_idx ON heatmap_grid_cells (lat, lon);

-- Inference incident links
CREATE TABLE inference_incident_links (
  inference_id TEXT NOT NULL REFERENCES inferred_events(inference_id) ON DELETE CASCADE,
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  linked_by TEXT NOT NULL,
  PRIMARY KEY (inference_id, incident_id)
);

CREATE INDEX inference_incident_links_inference_idx ON inference_incident_links (inference_id);
CREATE INDEX inference_incident_links_incident_idx ON inference_incident_links (incident_id);

-- Trigger for updated_at
CREATE TRIGGER inferred_events_updated_at
  BEFORE UPDATE ON inferred_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER degradation_zones_updated_at
  BEFORE UPDATE ON degradation_zones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- View for inferred timeline markers
CREATE OR REPLACE VIEW inferred_timeline_markers AS
SELECT
  ie.inference_id AS marker_id,
  ie.inference_id,
  'inferred' AS type,
  ie.inference_type AS subtype,
  ie.time_window_start AS timestamp,
  ie.inference_type AS title,
  ie.evidence_summary AS description,
  ie.confidence,
  ie.confidence_level,
  ie.inferred_status AS severity,
  ST_Y(ie.aoi::geometry) AS lat,
  ST_X(ie.aoi::geometry) AS lon,
  ie.details
FROM inferred_events ie
WHERE ie.inferred_status = 'active';

-- View for active degradation heatmap
CREATE OR REPLACE VIEW active_degradation_zones AS
SELECT
  dz.zone_id,
  dz.polygon,
  dz.severity,
  dz.confidence,
  dz.affected_signals,
  dz.estimated_area_sqkm,
  dz.inferred_at,
  dz.evidence_refs,
  ST_Y(ST_Centroid(dz.polygon)) AS center_lat,
  ST_X(ST_Centroid(dz.polygon)) AS center_lon,
  ST_Area(dz.polygon::geography) / 1000000 AS area_sqkm
FROM degradation_zones dz
WHERE dz.expired_at IS NULL
  AND dz.inferred_at > NOW() - INTERVAL '24 hours';

COMMIT;
