# Inference Service Documentation

The Inference Service (`apps/api/src/inference-service.ts`) provides derived operational intelligence by analyzing raw data patterns.

## Overview

Inference services detect operational patterns that aren't explicitly recorded but can be derived from available data. All inferences are:
- Explicitly marked as "inferred"
- Scored with confidence levels (very_high, high, medium, low)
- Evidence-backed with references to source data

## Detection Algorithms

### Navigation Degradation Detection

**Purpose**: Detect areas where tracked objects are experiencing degraded movement (slow speeds).

**Algorithm**:
1. Query all tracked objects within optional geographic bounds
2. Classify objects as "slow" if speed < 50 mps
3. Calculate degradation percentage
4. Determine severity:
   - **minor**: < 30% slow objects
   - **moderate**: 30-50% slow objects
   - **severe**: > 50% slow objects
5. Calculate confidence based on percentage
6. Create degradation zone in database

**Output**:
```typescript
interface NavDegradationResult {
  detected: boolean;
  zoneId?: string;
  severity?: "minor" | "moderate" | "severe";
  confidence?: number;
  affectedAreaSqkm?: number;
  degradedSignals?: number;
  totalSignals?: number;
}
```

### Route Redirection Detection

**Purpose**: Detect when an object deviates significantly from an expected path.

**Algorithm**:
1. Compare each actual position against nearest point on expected path
2. Calculate maximum deviation distance
3. If deviation > threshold (default 500m), flag as redirection
4. Calculate confidence based on deviation magnitude

**Parameters**:
- `objectId`: Object to analyze
- `expectedPath`: Array of {lat, lon} waypoints
- `actualPositions`: Array of {lat, lon, timestamp}
- `deviationThresholdMeters`: Minimum deviation to trigger (default 500m)

### Holding Pattern Detection

**Purpose**: Detect when an object repeatedly circles in the same area.

**Algorithm**:
1. Calculate center point of all positions (centroid)
2. Calculate average radius from center
3. Count crossings of radius boundary
4. Determine loop count (crossings / 2)
5. If loop count >= minLoops (default 2), flag as holding pattern
6. Classify orbit type by radius:
   - tight_orbit: < 1000m
   - standard_holding: 1000-3000m
   - wide_orbit: > 3000m

**Note**: Also calculates heading changes to distinguish from random movement.

### Absence Signal Detection

**Purpose**: Detect when expected data sources go silent or thin significantly.

**Algorithm**:
1. Query recent event counts for specified layer
2. Compare against expected minimum count
3. Calculate thinning percentage
4. Classify as:
   - source_blackout: 0 events
   - severe thinning: > 50% decrease
   - moderate thinning: 30-50% decrease
   - mild thinning: < 30% decrease

## Confidence Scoring

Each inference calculates confidence using formula:

```
confidence = min(0.95, base + contributing_factors)
```

Contributing factors vary by detection type:
- **Nav degradation**: slow percentage
- **Route redirection**: deviation distance
- **Holding pattern**: loop count + duration
- **Absence signal**: thinning percentage or blackout flag

## Inferred Event Persistence

All detections create entries in `inferred_events` table:

```typescript
await persistence.createInferredEvent({
  inference_type: "nav_degradation",
  confidence: 0.85,
  confidence_level: "high",
  time_window_start: "2025-01-01T00:00:00Z",
  time_window_end: "2025-01-01T00:05:00Z",
  evidence_summary: "Navigation degradation detected...",
  details: { /* detection-specific fields */ }
});
```

## Geographic Helper Functions

### Haversine Distance

Calculates great-circle distance between two lat/lon points (in meters):

```typescript
calculateDistance(lat1, lon1, lat2, lon2): number
```

### Polygon Area

Calculates area of geographic polygon using spherical projection (in km²):

```typescript
calculatePolygonArea(coordinates: Array<[number, number]>): number
```

## Usage Example

```typescript
// Detect navigation degradation in a region
const result = await detectNavigationDegradation(
  persistence,
  logger,
  { north: 40.0, south: 39.0, east: -74.0, west: -75.0 }
);

// Detect holding pattern for specific object
const pattern = await detectHoldingPattern(
  persistence,
  logger,
  "flight-123",
  positionHistory
);

// Check if a data source has gone silent
const absence = await detectAbsenceSignal(
  persistence,
  logger,
  "flights",
  30,  // 30 minute window
  10   // expect at least 10
);
```