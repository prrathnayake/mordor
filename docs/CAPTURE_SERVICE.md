# Capture Service Documentation

The Capture Service (`apps/api/src/capture-service.ts`) handles snapshotting system state for incident-linked evidence collection.

## Overview

Capture jobs create point-in-time snapshots of various data sources for later investigation. This is critical for forensic analysis and evidence preservation.

## Architecture

### Capture Context

```typescript
interface CaptureContext {
  captureJobId: string;    // Unique identifier for this capture job
  incidentId: string;      // Associated incident
  sourceType: string;      // Type of data to capture
  incidentStartAt: string; // Incident time window start
  incidentEndAt: string;   // Incident time window end
}
```

### Supported Source Types

| Source Type | Description | Query Strategy |
|-------------|-------------|----------------|
| `flights` | Live tracked objects | Latest object states from fixtures |
| `earthquakes` | USGS earthquake data | Events within incident time window |
| `satellites` | CelesTrak TLE data | Recent 500 records |
| `weather` | NOAA weather alerts | Events within incident time window |
| `bikeshare` | CityBikes station data | Recent 200 records |
| `traffic` | Street traffic incidents | Events within incident time window |
| `alerts` | System alerts | Alerts within incident time window |
| `events` | Canonical events | Up to 1000 events in time window |
| `cctv` | CCTV sources | Snapshot-only (no data capture) |

## Capture Functions

### `runCaptureJob(persistence, captureJobId, logger)`

Main entry point that:
1. Loads capture job from database
2. Validates job is in "running" state
3. Loads associated incident for time bounds
4. Dispatches to appropriate capture function
5. Completes job on success or failure

### Capture Flow

```
┌─────────────────────────────────────────┐
│         runCaptureJob called           │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Load job + incident from database     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Switch on source_type                  │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌─────────────┐   ┌──────────────────┐
│ captureX() │   │ captureY()       │
│   ...      │   │   ...            │
└──────┬──────┘   └────────┬─────────┘
       │                   │
       ▼                   ▼
┌─────────────────────────────────────────┐
│  addCaptureSnapshot() per record       │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  completeCaptureJob() + return result  │
└─────────────────────────────────────────┘
```

### Snapshot Data Structure

Each snapshot captures:
- **external_id**: Original entity identifier
- **observed_at**: Timestamp of capture
- **payload**: Source-specific data
- **metadata**: Source name, record count, completeness flag

## Evidence Freeze

After capture jobs complete, snapshots can be "frozen" to create immutable evidence:

```typescript
POST /capture-jobs/:id/freeze
{
  notes: "Evidence preserved for investigation"
}
```

Freeze process:
1. Marks snapshots as "frozen" (immutable)
2. Creates `evidence_freeze` record
3. Updates capture job freeze status

## Error Handling

Capture functions return `SnapshotResult`:

```typescript
interface SnapshotResult {
  success: boolean;
  snapshotCount: number;
  error?: string;
}
```

On failure, capture job is marked with error code and message for later review.

## Usage Example

```typescript
// Create capture job
await persistence.createCaptureJob(
  incidentId,
  "flights",
  userId
);

// Start and execute
const result = await runCaptureJob(
  persistence,
  captureJobId,
  logger
);

// Freeze for evidence
await persistence.freezeSnapshots(captureJobId);
```