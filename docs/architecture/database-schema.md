# Database Schema Documentation

This document describes the PostgreSQL/PostGIS database schema used by the Chrona Twin platform.

## Schema Overview

The database uses **PostgreSQL 14+** with **PostGIS extension** for geospatial capabilities. Schema evolution is managed through numbered migrations in `infra/migrations/`.

### Migration Files

| File | Description |
|------|-------------|
| `0001_initial_schema.sql` | Core tables: sources, objects, events, states, alerts |
| `0002_external_data_layers.sql` | External API data (earthquakes, satellites, weather, etc.) |
| `0003_incidents.sql` | Incident management for investigation |
| `0004_capture_jobs.sql` | Evidence capture jobs and snapshots |
| `0005_inferred_intelligence.sql` | AI/ML-derived events and patterns |
| `0006_source_registry.sql` | Source registry and health tracking |

## Core Tables

### sources

Tracks data ingestion sources (fixtures, cameras, external APIs).

```sql
CREATE TABLE sources (
  source_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,        -- 'fixture', 'camera', 'external'
  name TEXT NOT NULL,
  status TEXT NOT NULL,             -- 'active', 'inactive', 'error'
  owner TEXT NOT NULL,
  auth_ref TEXT NOT NULL,            -- Authentication reference
  polling_mode TEXT NOT NULL,       -- 'poll', 'stream', 'snapshot'
  schema_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

### tracked_objects

Objects being tracked in the system (flights, vehicles, etc.).

```sql
CREATE TABLE tracked_objects (
  object_id TEXT PRIMARY KEY,
  object_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  source_primary TEXT NOT NULL REFERENCES sources(source_id),
  latest_state_ref TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}'
);
```

### canonical_events

**Append-only** event log - the system of record for all events. Immutable once written.

```sql
CREATE TABLE canonical_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,           -- 'position', 'velocity', 'status'
  object_id TEXT NOT NULL REFERENCES tracked_objects(object_id),
  source_id TEXT NOT NULL REFERENCES sources(source_id),
  observed_at TIMESTAMPTZ NOT NULL,   -- When event occurred
  ingested_at TIMESTAMPTZ NOT NULL,   -- When received
  processed_at TIMESTAMPTZ NOT NULL,  -- When processed
  schema_version TEXT NOT NULL,
  payload JSONB NOT NULL,              -- Event-specific data
  provenance JSONB NOT NULL,           -- Source provenance info
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  dedupe_key TEXT NOT NULL,            -- Deduplication key
  geometry geometry(Geometry, 4326) NULL,  -- PostGIS Point
  altitude_m DOUBLE PRECISION NULL,
  heading_deg DOUBLE PRECISION NULL,
  speed_mps DOUBLE PRECISION NULL,
  related_object_ids TEXT[] NOT NULL DEFAULT '{}',
  parent_event_id TEXT NULL REFERENCES canonical_events(event_id),
  trace_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, dedupe_key)
);
```

**Indexes**:
- `canonical_events_object_observed_idx` on `(object_id, observed_at)`
- `canonical_events_source_ingested_idx` on `(source_id, ingested_at)`
- `canonical_events_geometry_idx` using GIST on geometry

**Integrity**: Trigger prevents UPDATE/DELETE (append-only).

### latest_object_states

Current state for each tracked object. Derived from canonical_events.

```sql
CREATE TABLE latest_object_states (
  object_id TEXT PRIMARY KEY REFERENCES tracked_objects(object_id),
  state_version TEXT NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  position geometry(Point, 4326) NULL,  -- PostGIS Point
  velocity JSONB NULL,                  -- { speed_mps, heading_deg }
  status TEXT NULL,
  attributes JSONB NOT NULL DEFAULT '{}',
  last_event_id TEXT NOT NULL REFERENCES canonical_events(event_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### alerts

System alerts generated from anomaly detection.

```sql
CREATE TABLE alerts (
  alert_id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,                -- 'position_observed', 'stale', etc.
  severity TEXT NOT NULL,               -- 'critical', 'warning', 'info'
  status TEXT NOT NULL,                 -- 'open', 'acknowledged', 'resolved'
  opened_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ NULL,
  acknowledged_at TIMESTAMPTZ NULL,
  acknowledged_by TEXT NULL,
  schema_version TEXT NOT NULL,
  evidence_event_ids TEXT[] NOT NULL,  -- Backing events
  evidence_object_ids TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL,
  explanation TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cardinality(evidence_event_ids) > 0)
);
```

### audit_logs

Immutable audit trail for compliance.

```sql
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
  metadata JSONB NOT NULL DEFAULT '{}'
);
```

## External Data Tables

### external_data_layers

Metadata for external data sources (USGS, CelesTrak, etc.).

```sql
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Default layers:
- `earthquakes`: USGS (5 min cadence)
- `satellites`: CelesTrak (60 min cadence)
- `weather`: NOAA/NWS (10 min cadence)
- `bikeshare`: CityBikes (1 min cadence)
- `traffic`: TomTom (5 min cadence)
- `military`: Military flights

### external_data_events

Cached events from external sources.

```sql
CREATE TABLE external_data_events (
  event_id TEXT PRIMARY KEY,
  layer_id TEXT NOT NULL REFERENCES external_data_layers(layer_id),
  external_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  observed_at TIMESTAMPTZ,
  geometry geometry(Point, 4326),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (layer_id, external_id)
);
```

## Incident Tables

### incidents

Investigation containers.

```sql
CREATE TABLE incidents (
  incident_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  aoi geometry(Geometry, 4326),         -- Area of interest polygon
  status TEXT NOT NULL,                  -- 'open', 'investigating', 'closed'
  severity TEXT NOT NULL,                -- 'critical', 'major', 'minor'
  created_by TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### incident_chapters

Timeline chapters within incidents.

### incident_links

Links between incidents and events/alerts/external data.

## Capture & Evidence Tables

### capture_jobs

Evidence capture job metadata.

```sql
CREATE TABLE capture_jobs (
  capture_job_id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id),
  source_type TEXT NOT NULL,
  status TEXT NOT NULL,                -- 'pending', 'running', 'completed', 'failed'
  created_by TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  freeze_status TEXT,                  -- 'none', 'frozen'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### capture_snapshots

Captured data points from jobs.

### evidence_freeze

Frozen (immutable) evidence records.

## Inference Tables

### inferred_events

AI/ML-derived intelligence events.

```sql
CREATE TABLE inferred_events (
  inference_id TEXT PRIMARY KEY,
  inference_type TEXT NOT NULL,         -- 'nav_degradation', 'route_redirection', etc.
  confidence DOUBLE PRECISION NOT NULL,
  confidence_level TEXT NOT NULL,       -- 'very_high', 'high', 'medium', 'low'
  time_window_start TIMESTAMPTZ NOT NULL,
  time_window_end TIMESTAMPTZ NOT NULL,
  evidence_summary TEXT NOT NULL,
  details JSONB NOT NULL,
  related_object_ids TEXT[] NOT NULL DEFAULT '{}',
  related_source_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Inference types:
- `nav_degradation`: Detected areas with slow-moving objects
- `route_redirection`: Objects deviating from expected paths
- `holding_pattern`: Objects circling in same area
- `absence_signal`: Data sources going silent

### degradation_zones, route_redirections, holding_patterns

Specific pattern storage tables.

## Spatial Indexes

All geometry columns use PostGIS GIST indexes for efficient spatial queries:

```sql
CREATE INDEX canonical_events_geometry_idx ON canonical_events USING GIST (geometry);
CREATE INDEX latest_object_states_position_idx ON latest_object_states USING GIST (position);
CREATE INDEX external_data_events_geometry_idx ON external_data_events USING GIST (geometry);
```

## Common Queries

### Get objects in geographic area

```sql
SELECT * FROM latest_object_states
WHERE ST_DWithin(position, ST_MakePoint(-74.006, 40.7128)::geography, 5000);
```

### Get events in time range

```sql
SELECT * FROM canonical_events
WHERE observed_at BETWEEN '2025-01-01' AND '2025-01-02'
ORDER BY observed_at;
```

### Get incidents by severity

```sql
SELECT * FROM incidents
WHERE status = 'open'
ORDER BY 
  CASE severity
    WHEN 'critical' THEN 1
    WHEN 'major' THEN 2
    WHEN 'minor' THEN 3
  END;
```