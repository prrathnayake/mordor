# Domain Logic - Object State Projector

The Object State Projector (`packages/domain/src/object-state-projector.ts`) transforms canonical events into object state snapshots.

## Purpose

This module implements the core domain logic for deriving the current state of tracked objects from a sequence of events. It ensures:
- Deterministic state derivation
- Freshness-based event ordering
- Position/velocity extraction from multiple sources

## Core Function

### `applyCanonicalEventToObjectState(currentState, event): ObjectState`

Takes an existing state (or null) and a new canonical event, returns the updated state.

```typescript
function applyCanonicalEventToObjectState(
  currentState: ObjectState | null,
  event: CanonicalEvent
): ObjectState
```

## Key Logic Components

### 1. Freshness Comparison

Before applying an event, we verify it's newer than the current state:

```typescript
function compareEventFreshness(candidate, currentState): number {
  const candidateTimestamp = Date.parse(candidate.observed_at);
  const currentTimestamp = Date.parse(currentState.as_of);
  
  // If timestamps differ, newer wins
  if (candidateTimestamp !== currentTimestamp) {
    return candidateTimestamp - currentTimestamp;
  }
  
  // Tie-breaker: lexicographic event ID comparison
  return candidate.event_id.localeCompare(currentState.last_event_id);
}
```

**Why this matters**: Events may arrive out of order due to network latency. This ensures the most recent event wins.

### 2. Position Extraction

Position can come from two sources:

1. **Geometry field** (preferred): GeoJSON Point geometry
2. **Payload fields**: lat/lon in event payload

```typescript
function extractPosition(event: CanonicalEvent): PositionSnapshot | null {
  // Priority 1: GeoJSON geometry
  if (geometry?.type === "Point") {
    const [lon, lat, altitude] = geometry.coordinates;
    return { lat, lon, altitude_m: event.altitude_m ?? altitude ?? null, geometry };
  }
  
  // Priority 2: Payload fields
  if (payloadLat !== undefined && payloadLon !== undefined) {
    return {
      lat: payloadLat,
      lon: payloadLon,
      altitude_m: event.altitude_m ?? null,
      geometry: { type: "Point", coordinates: [payloadLon, payloadLat] }
    };
  }
  
  return null;
}
```

### 3. Velocity Extraction

Velocity (speed and heading) is similarly derived from event fields or payload:

```typescript
function extractVelocity(event: CanonicalEvent): VelocitySnapshot | null {
  const speedMps = event.speed_mps ?? event.payload.speed_mps ?? null;
  const headingDeg = event.heading_deg ?? event.payload.heading_deg ?? null;
  
  if (speedMps === null && headingDeg === null) {
    return null;
  }
  
  return { speed_mps: speedMps, heading_deg: headingDeg };
}
```

### 4. Status Derivation

Status priority:
1. Explicit status in event payload
2. Prior state status
3. Fall back to event type

```typescript
function deriveStatus(event, priorState): string | null {
  if (typeof event.payload.status === "string" && event.payload.status.trim() !== "") {
    return event.payload.status;
  }
  return priorState?.status ?? event.event_type;
}
```

## State Schema

The resulting object state follows this structure:

```typescript
interface ObjectState {
  object_id: string;
  state_version: string;           // Schema version
  as_of: string;                    // Event timestamp
  position: PositionSnapshot | null;
  velocity: VelocitySnapshot | null;
  status: string | null;
  attributes: {
    confidence?: number;
    event_type?: string;
    source_id?: string;
    trace_id?: string | null;
  };
  last_event_id: string;
}
```

## Usage in Replay

The replay system uses this projector to compute "state after event" for each event in a sequence:

```typescript
const currentStateByObjectId = new Map();

const items = events.map((event, index) => {
  const currentState = currentStateByObjectId.get(event.object_id) ?? null;
  const nextState = applyCanonicalEventToObjectState(currentState, event);
  currentStateByObjectId.set(event.object_id, nextState);
  
  return {
    sequence: index + 1,
    event,
    state_after_event: nextState
  };
});
```

This enables the UI to show object state at any point in the replay timeline.

## Versioning

The projector uses `OBJECT_STATE_SCHEMA_VERSION` to track state schema changes. This ensures clients can interpret state correctly even as the schema evolves.