-- Migration: Incident Management and Correlation Timeline
-- Adds tables for incident playback and multi-layer correlation

BEGIN;

-- Incidents table
CREATE TABLE incidents (
  incident_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  aoi geometry(Polygon, 4326),
  status TEXT NOT NULL CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  CHECK (end_at >= start_at)
);

CREATE INDEX incidents_status_idx ON incidents (status);
CREATE INDEX incidents_severity_idx ON incidents (severity);
CREATE INDEX incidents_time_idx ON incidents (start_at, end_at);

-- Incident chapters table
CREATE TABLE incident_chapters (
  chapter_id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  description TEXT,
  event_ids TEXT[] NOT NULL DEFAULT '{}',
  alert_ids TEXT[] NOT NULL DEFAULT '{}',
  position geography(Point, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (timestamp >= (SELECT start_at FROM incidents WHERE incident_id = incident_chapters.incident_id)),
  CHECK (timestamp <= (SELECT end_at FROM incidents WHERE incident_id = incident_chapters.incident_id))
);

CREATE INDEX incident_chapters_incident_idx ON incident_chapters (incident_id);
CREATE INDEX incident_chapters_timestamp_idx ON incident_chapters (timestamp);

-- Incident links table (many-to-many relationships)
CREATE TABLE incident_links (
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  event_id TEXT,
  alert_id TEXT,
  external_event_id TEXT,
  layer_id TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  linked_by TEXT NOT NULL,
  PRIMARY KEY (incident_id, event_id, alert_id, external_event_id),
  CHECK (
    (event_id IS NOT NULL AND alert_id IS NULL AND external_event_id IS NULL) OR
    (event_id IS NULL AND alert_id IS NOT NULL AND external_event_id IS NULL) OR
    (event_id IS NULL AND alert_id IS NULL AND external_event_id IS NOT NULL)
  )
);

CREATE INDEX incident_links_incident_idx ON incident_links (incident_id);
CREATE INDEX incident_links_event_idx ON incident_links (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX incident_links_alert_idx ON incident_links (alert_id) WHERE alert_id IS NOT NULL;
CREATE INDEX incident_links_layer_idx ON incident_links (layer_id) WHERE layer_id IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Timeline correlation view
CREATE OR REPLACE VIEW incident_timeline_view AS
SELECT
  i.incident_id,
  i.title,
  i.start_at,
  i.end_at,
  i.severity,
  ic.chapter_id,
  ic.title AS chapter_title,
  ic.timestamp AS chapter_timestamp,
  il.event_id,
  il.alert_id,
  il.external_event_id,
  il.layer_id
FROM incidents i
LEFT JOIN incident_chapters ic ON i.incident_id = ic.incident_id
LEFT JOIN incident_links il ON i.incident_id = il.incident_id;

COMMIT;
