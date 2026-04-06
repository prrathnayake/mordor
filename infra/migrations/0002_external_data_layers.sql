-- Migration: External Data Layer Support
-- Adds tables for caching and tracking external data sources

BEGIN;

-- External data layer cache table
-- Stores metadata and cache for external data sources
CREATE TABLE external_data_layers (
  layer_id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_url TEXT,
  license TEXT NOT NULL,
  update_cadence_seconds INTEGER NOT NULL,
  last_fetch_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('real', 'degraded', 'unavailable')),
  record_count INTEGER DEFAULT 0,
  error_message TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(raw_data) = 'object' OR raw_data IS NULL)
);

CREATE INDEX external_data_layers_status_idx ON external_data_layers (status);

-- External data events table
-- Stores normalized events from external sources
CREATE TABLE external_data_events (
  event_id TEXT PRIMARY KEY,
  layer_id TEXT NOT NULL REFERENCES external_data_layers(layer_id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  observed_at TIMESTAMPTZ,
  geometry geometry(Point, 4326),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (layer_id, external_id),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX external_data_events_layer_idx ON external_data_events (layer_id, observed_at);
CREATE INDEX external_data_events_geometry_idx ON external_data_events USING GIST (geometry);

-- Source health tracking for external sources
-- Extends source_health table for external API sources
CREATE TABLE external_source_health (
  source_id TEXT PRIMARY KEY,
  layer_id TEXT NOT NULL REFERENCES external_data_layers(layer_id) ON DELETE CASCADE,
  api_endpoint TEXT,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  failure_count INTEGER DEFAULT 0,
  rate_limit_remaining INTEGER,
  rate_limit_reset_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX external_source_health_layer_idx ON external_source_health (layer_id);

-- Function to update timestamp on row modification
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER external_data_layers_updated_at
  BEFORE UPDATE ON external_data_layers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER external_source_health_updated_at
  BEFORE UPDATE ON external_source_health
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default layer definitions
INSERT INTO external_data_layers (layer_id, source_name, source_url, license, update_cadence_seconds, status)
VALUES
  ('earthquakes', 'USGS', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php', 'Public Domain', 300, 'real'),
  ('satellites', 'CelesTrak (NASA/DoD)', 'https://celestrak.org/', 'Public Domain', 3600, 'real'),
  ('weather', 'NOAA/NWS', 'https://api.weather.gov/', 'Public Domain', 600, 'degraded'),
  ('bikeshare', 'CityBikes', 'https://api.citybik.es/', 'Open Data', 60, 'real'),
  ('traffic', 'TomTom/Google Maps API', 'https://developer.tomtom.com/', 'Commercial API Key Required', 300, 'degraded'),
  ('military', 'N/A', NULL, 'N/A', 0, 'unavailable');

COMMIT;
