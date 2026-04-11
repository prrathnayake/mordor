# Persistence Layer Documentation

The Persistence Layer (`packages/persistence/src/postgres-persistence.ts`) handles all database operations for the digital twin platform, including events, object states, sources, alerts, incidents, and evidence.

## Database Connection

### Initialization

```typescript
// From connection string
const persistence = PostgresPersistenceGateway.fromConnectionString(
  "postgres://user:pass@localhost:5432/chrona"
);

// Ping to verify connection
await persistence.ping();
```

### Transaction Support

All operations can be wrapped in transactions:

```typescript
await persistence.getDatabase().withTransaction(async (client) => {
  // Multiple operations in single transaction
});
```

## Core Entities

### Canonical Events

Events are the foundational data unit. Stored in `canonical_events` table:

| Column | Type | Description |
|--------|------|-------------|
| event_id | uuid | Unique event identifier |
| event_type | text | Type (position, velocity, status) |
| object_id | uuid | Associated object |
| source_id | uuid | Data source |
| observed_at | timestamptz | When event occurred |
| payload | jsonb | Event-specific data |
| geometry | geometry | GeoJSON Point |
| altitude_m | float | Altitude in meters |
| heading_deg | float | Direction in degrees |
| speed_mps | float | Speed in m/s |

### Object State

Current state derived from events. Stored in `latest_object_states` table:

```typescript
interface ObjectState {
  object_id: string;
  state_version: string;
  as_of: string;           // Timestamp of last event
  position: {              // Lat/lon/altitude
    lat: number;
    lon: number;
    altitude_m: number | null;
    geometry: Geometry;
  } | null;
  velocity: {              // Speed and heading
    speed_mps: number | null;
    heading_deg: number | null;
  } | null;
  status: string | null;
  attributes: Record<string, unknown>;
  last_event_id: string;
}
```

### Sources

Data sources tracked in `sources` table:

```typescript
interface Source {
  source_id: string;
  source_name: string;
  source_type: string;     // fixture, camera, external
  status: "active" | "inactive" | "error";
  license?: string;
  config?: Record<string, unknown>;
  last_seen_at?: string;
}
```

### Alerts

System alerts generated from anomalies:

```typescript
interface Alert {
  alert_id: string;
  rule_id: string;
  severity: "critical" | "warning" | "info";
  status: "open" | "acknowledged" | "resolved";
  evidence_event_ids: string[];
  evidence_object_ids: string[];
  summary: string;
  explanation: string;
  confidence: number;
  opened_at: string;
  acknowledged_by?: string;
  closed_at?: string;
}
```

### Incidents

Investigation containers linking related events and evidence:

```typescript
interface Incident {
  incident_id: string;
  title: string;
  description?: string;
  start_at: string;       // Incident time window
  end_at: string;
  aoi?: Geometry;         // Area of interest
  status: "open" | "investigating" | "closed";
  severity: "critical" | "major" | "minor";
  created_by: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}
```

### Capture Jobs

Snapshot jobs for evidence collection:

```typescript
interface CaptureJob {
  capture_job_id: string;
  incident_id: string;
  source_type: string;
  status: "pending" | "running" | "completed" | "failed";
  created_by: string;
  started_at?: string;
  completed_at?: string;
  error_code?: string;
  error_message?: string;
}
```

### Snapshots & Evidence Freeze

Captured data and frozen evidence:

```typescript
interface CaptureSnapshot {
  snapshot_id: string;
  capture_job_id: string;
  source_type: string;
  external_id: string | null;
  observed_at: string;
  payload: Record<string, unknown>;
  metadata: {
    source_name: string;
    record_count: number;
    source_complete: boolean;
    raw_ref?: string;
    adapter_version: string;
  };
  frozen: boolean;
  frozen_at?: string;
}

interface EvidenceFreeze {
  freeze_id: string;
  capture_job_id: string;
  incident_id: string;
  source_type: string;
  source_label: string;
  frozen_by: string;
  notes?: string;
  created_at: string;
}
```

### Inferred Events

AI/ML-derived intelligence:

```typescript
interface InferredEvent {
  inference_id: string;
  inference_type: string;  // nav_degradation, route_redirection, etc.
  confidence: number;
  confidence_level: "very_high" | "high" | "medium" | "low";
  time_window_start: string;
  time_window_end: string;
  evidence_summary: string;
  details: Record<string, unknown>;
  related_object_ids?: string[];
  related_source_ids?: string[];
}
```

## Key Operations

### Event Persistence

```typescript
// Ingest canonical event
await persistence.persistCanonicalEvent(event);

// Batch ingest
await persistence.persistCanonicalEventsBatch(events);
```

### State Management

```typescript
// Get latest state for all objects
const states = await persistence.fetchLatestStateForAllObjects();

// Get state for specific object
const state = await persistence.fetchObjectState(objectId);

// Query historical events for replay
const events = await persistence.fetchCanonicalEvents({
  start_at: "2025-01-01T00:00:00Z",
  end_at: "2025-01-01T01:00:00Z",
  object_id: "flight-123"
});
```

### Source Management

```typescript
// Register new source
await persistence.upsertTrackedObject({ /* ... */ });

// Get all sources
const sources = await persistence.fetchAllSources();

// Get source health
const health = await persistence.fetchAllSourceHealth();
```

### Alert Operations

```typescript
// Create alert
await persistence.persistAlert(alert);

// List alerts with filters
const alerts = await persistence.fetchAlerts({
  status: "open",
  severity: "critical"
});

// Update alert status
await persistence.updateAlertStatus({
  alert_id: alertId,
  status: "acknowledged",
  acknowledged_by: userId
});
```

### Incident Operations

```typescript
// Create incident
await persistence.createIncident(incident);

// Get incident with chapters and links
const incident = await persistence.fetchIncident(incidentId);

// Add chapter to timeline
await persistence.createIncidentChapter(chapter);

// Link evidence
await persistence.createIncidentLink({
  incident_id: incidentId,
  event_id: eventId
});
```

### Evidence Operations

```typescript
// Create capture job
const jobId = await persistence.createCaptureJob(
  incidentId,
  "flights",
  userId
);

// Get capture status for incident
const status = await persistence.getIncidentCaptureStatus(incidentId);

// List frozen evidence
const evidence = await persistence.listEvidenceFreeze(incidentId);
```

### Inference Operations

```typescript
// Create inferred event
await persistence.createInferredEvent(inference);

// List inferences
const inferences = await persistence.listInferredEvents({
  inference_type: "nav_degradation",
  confidence_level: "high"
});
```

## PostGIS Integration

The database uses PostGIS for geospatial queries:

```typescript
// Spatial queries via raw SQL
const result = await persistence.getDatabase().pool.query(`
  SELECT * FROM canonical_events
  WHERE ST_DWithin(position, ST_MakePoint($1, $2)::geography, $3)
`, [lon, lat, radiusMeters]);
```

Common spatial operations:
- `ST_AsGeoJSON()` - Convert geometry to GeoJSON
- `ST_DWithin()` - Find points within distance
- `ST_MakePoint()` - Create point from coordinates
- `ST_Contains()` - Test polygon containment

## Callback System

The persistence layer can notify on object state changes:

```typescript
// Set callback for state updates
setObjectStateUpdateCallback((state) => {
  // Publish to live event bus
  liveEventBus.publish({
    type: "object_state_update",
    payload: state
  });
});
```

## Audit Logging

All significant operations are logged for compliance:

```typescript
await persistence.recordAuditLog({
  actor_id: userId,
  actor_type: "user",
  operation: "alert_status_change",
  target_type: "alert",
  target_id: alertId,
  trace_id: crypto.randomUUID(),
  occurred_at: new Date().toISOString(),
  result: "success",
  metadata: { previous_status, new_status }
});
```