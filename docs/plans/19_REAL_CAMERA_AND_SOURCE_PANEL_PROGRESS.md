# Phase 19: Real Camera/Source Panel and Source Context Progress

## Executive Summary

Phase 19 implements a real source-context layer for MORDOR, replacing CCTV placeholders with truthful linked source information. This enables operators to click objects, alerts, and incidents and see accurate source metadata.

## Implementation Completed

### 1. Source Registry Model (`packages/contracts/src/source-registry.ts`)

Implemented source registry types supporting:
- Source types: camera, radar, satellite, adsb, ais, sensor, manual
- Source statuses: active, inactive, stale, error, disconnected
- Coverage/FOV geometry (cone, polygon, circle)
- Location (lat, lon, alt)
- Orientation (heading_deg)
- Snapshot/live availability
- Linked object/alert/incident references

### 2. Database Migration (`infra/migrations/0006_source_registry.sql`)

Created tables:
- `source_registry` - Extended source metadata
- `source_snapshots` - Snapshot metadata
- `source_links` - Explicit/nearest links

### 3. Persistence Methods (`packages/persistence/src/postgres-persistence.ts`)

Added methods:
- `upsertSourceRegistry()` - Insert/update source
- `getSourceRegistry()` - Get single source
- `listSourceRegistry()` - List all sources
- `addSourceLink()` - Link source to object/alert/incident
- `removeSourceLink()` - Remove link
- `getSourceLinksForTarget()` - Get links for target
- `getNearestSourceToPoint()` - Nearest source lookup

### 4. API Endpoints (`apps/api/src/server.ts`)

Implemented:
- `GET /sources` - List all sources
- `GET /sources/:sourceId` - Get source detail
- `GET /sources/nearest-to-point?lat=&lon=` - Find nearest source
- `GET /sources/linked/:targetType/:targetId` - Get linked sources

### 5. Tactical Source Panel (`apps/web/public/app.js`)

Replaced CCTV placeholder with:
- Real source ID, label, provider
- Source type
- Status (truthful availability)
- Last update timestamp
- Snapshot/live availability states
- Link type (explicit or nearest)
- Multiple linked sources support

### 6. Unit Tests (`tests/unit/source-registry.spec.ts`)

Created tests for:
- Source registry model fields
- Optional fields handling
- Source linking to objects
- Nearest source resolution
- API endpoints
- 404 handling

## Source Types Supported

| Type | Status | Live | Snapshot | Notes |
|------|--------|------|----------|-------|
| camera | ACTIVE | NO* | YES | No real video streaming |
| radar | ACTIVE | NO* | YES | Derived imagery |
| satellite | ACTIVE | NO* | YES | Archived imagery |
| adsb | ACTIVE | N/A | N/A | Positional data only |
| ais | ACTIVE | N/A | N/A | Positional data only |
| sensor | ACTIVE | N/A | YES | Various sensors |
| manual | ACTIVE | NO | NO* | Manual entry |

*Requires existing infrastructure

## API Usage Examples

```bash
# List all sources
curl http://localhost:3001/sources

# Get source detail
curl http://localhost:3001/sources/cam_001

# Find nearest to point
curl http://localhost:3001/sources/nearest-to-point?lat=40.7128&lon=-74.006

# Get links for object
curl http://localhost:3001/sources/linked/object/obj_001
```

## Gaps and Future Work

1. **Globe Source Overlays** - Need Cesium entity rendering for source markers and FOV cones
2. **Alert/Incident Source Context** - Need to integrate with alert selection and incident playback
3. **Snapshot Image Rendering** - Need to surface actual snapshot URLs when available
4. **Health Updates** - Need real-time source health via event bus

## Backward Compatibility

- Preserves existing `/health/sources` endpoints
- No changes to object/alert/incident selection workflows
- Legacy CCTV fallback if source registry unavailable