-- Migration: Seismic, Maritime, and Custom Intel Data Types
-- Creates tables for earthquake/seismic events, vessel positions, and custom intel

BEGIN;

-- Seismic Events Table
CREATE TABLE seismic_events (
  event_id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('usgs', 'emsc')),
  external_id TEXT NOT NULL,
  magnitude NUMERIC(4, 2) NOT NULL CHECK (magnitude >= 0),
  magnitude_type TEXT NOT NULL CHECK (magnitude_type IN ('ml', 'mw', 'mb', 'md')),
  depth_km NUMERIC(7, 2) NOT NULL,
  lat DOUBLE PRECISION NOT NULL CHECK (lat >= -90 AND lat <= 90),
  lon DOUBLE PRECISION NOT NULL CHECK (lon >= -180 AND lon <= 180),
  location_name TEXT NOT NULL,
  country TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  tsunami_warning BOOLEAN NOT NULL DEFAULT FALSE,
  felt_reports INTEGER NOT NULL DEFAULT 0,
  significant BOOLEAN NOT NULL DEFAULT FALSE,
  data_type TEXT NOT NULL CHECK (data_type IN ('earthquake', 'explosion', 'quarry')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id, observed_at)
);

CREATE INDEX seismic_events_observed_at_idx ON seismic_events (observed_at DESC);
CREATE INDEX seismic_events_location_idx ON seismic_events (lat, lon);
CREATE INDEX seismic_events_magnitude_idx ON seismic_events (magnitude DESC);
CREATE INDEX seismic_events_source_idx ON seismic_events (source, observed_at DESC);

-- Vessel Positions Table
CREATE TABLE vessel_positions (
  vessel_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('marinetraffic', 'vesselfinder')),
  imo TEXT,
  vessel_name TEXT NOT NULL,
  vessel_type TEXT NOT NULL,
  flag TEXT,
  lat DOUBLE PRECISION NOT NULL CHECK (lat >= -90 AND lat <= 90),
  lon DOUBLE PRECISION NOT NULL CHECK (lon >= -180 AND lon <= 180),
  speed_knots NUMERIC(6, 2),
  heading_deg NUMERIC(5, 2),
  destination TEXT,
  eta TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (vessel_id, observed_at)
);

CREATE INDEX vessel_positions_observed_at_idx ON vessel_positions (observed_at DESC);
CREATE INDEX vessel_positions_location_idx ON vessel_positions (lat, lon);
CREATE INDEX vessel_positions_vessel_name_idx ON vessel_positions (vessel_name);
CREATE INDEX vessel_positions_imo_idx ON vessel_positions (imo) WHERE imo IS NOT NULL;
CREATE INDEX vessel_positions_flag_idx ON vessel_positions (flag);

-- Custom Intel Sources Table
CREATE TABLE custom_intel_sources (
  source_id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  license TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'error')),
  update_cadence_seconds INTEGER NOT NULL DEFAULT 300,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX custom_intel_sources_type_idx ON custom_intel_sources (source_type);
CREATE INDEX custom_intel_sources_status_idx ON custom_intel_sources (status);

CREATE TRIGGER custom_intel_sources_updated_at
  BEFORE UPDATE ON custom_intel_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Custom Intel Observations Table
CREATE TABLE custom_intel_observations (
  intel_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES custom_intel_sources(source_id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  lat DOUBLE PRECISION CHECK (lat IS NULL OR (lat >= -90 AND lat <= 90)),
  lon DOUBLE PRECISION CHECK (lon IS NULL OR (lon >= -180 AND lon <= 180)),
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX custom_intel_observations_source_idx ON custom_intel_observations (source_id, received_at DESC);
CREATE INDEX custom_intel_observations_severity_idx ON custom_intel_observations (severity);
CREATE INDEX custom_intel_observations_geometry_idx ON custom_intel_observations (lat, lon) WHERE lat IS NOT NULL AND lon IS NOT NULL;
CREATE INDEX custom_intel_observations_tags_idx ON custom_intel_observations USING GIN (tags);
CREATE INDEX custom_intel_observations_received_idx ON custom_intel_observations (received_at DESC);

COMMIT;