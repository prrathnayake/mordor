# Phase 15: Real Data Layer Expansion for MORDOR

## Status: COMPLETED

## Date: 2026-04-06

## Summary
Transform the MORDOR tactical UI left rail from placeholder layers to real operational intelligence surfaces by integrating with publicly available, documented, legally usable data sources. Each layer must be explicitly marked as **real**, **degraded**, or **unavailable** with no fake counts, freshness claims, or provider names.

## Critical Truthfulness Rule
Every left-rail layer must be explicitly represented as one of:
- **real** - Live data from legitimate API with working data path
- **degraded** - Partial data available, rate limited, or delayed
- **unavailable** - No legitimate source available or source violates terms

Do not fake counts, freshness, provider names, or live feeds.

## Priority Order
1. Earthquakes (24h) - USGS GeoJSON Feed ✅
2. Satellites - CelesTrak/N2YO API ✅
3. Weather Radar - NOAA/NWS (degraded/radar overlay)
4. Street Traffic - TomTom/Google Maps API or degraded
5. Bikeshare - CityBikes/GBFS
6. Military Flights - unavailable (no legitimate open source)

## Implementation Plan

### Phase 1: Shared Infrastructure
- Create external data layer types and contracts
- Create shared HTTP client with rate limiting
- Create caching and freshness tracking
- Create health status tracking for external sources

### Phase 2: Earthquake Adapter (USGS)
**Source**: USGS GeoJSON Feed (https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php)
**License**: Public Domain
**Update Cadence**: 5 minutes
**Data**: M 2.5+ earthquakes, past 24 hours, worldwide

**Normalization Contract**:
- event_type: "geo_event_observed"
- object_id: USGS event id (e.g., "us7000lxyz")
- geometry: Point with lat/lon
- payload: magnitude, depth, place, tsunami risk, status

**Rendering Strategy**:
- Cesium markers sized by magnitude
- Color-coded by severity (green < 4, yellow 4-6, red > 6)
- Popup with magnitude, location, depth, time

### Phase 3: Satellite Adapter (CelesTrak/N2YO)
**Source**: CelesTrak GP/OEM data or N2YO API
**License**: Public Domain (NASA/DoD data)
**Update Cadence**: 60 seconds
**Data**: Active satellites with TLE for position propagation

**Normalization Contract**:
- event_type: "satellite_observed"
- object_id: NORAD catalog number
- geometry: Point with lat/lon/altitude
- payload: satellite name, type, altitude, velocity, visibility

**Rendering Strategy**:
- Cesium entities with billboard icons
- Orbital track polylines (calculated from TLE)
- Different icons by satellite type (LEO/MEO/GEO)

### Phase 4: Weather Radar (NOAA/NWS)
**Source**: NOAA NWS API or Iowa State Mesonet
**License**: Public Domain
**Update Cadence**: 10 minutes
**Data**: NEXRAD base reflectivity imagery

**Status**: degraded (overlay images only, no point data)

### Phase 5: Street Traffic (TomTom/Mapbox)
**Source**: TomTom Traffic API or Mapbox Directions API
**License**: Requires API key, free tier available
**Update Cadence**: 5 minutes
**Data**: Traffic flow and incidents

**Status**: degraded or unavailable if API limits exceeded

### Phase 6: Bikeshare (CityBikes)
**Source**: CityBikes API (https://api.citybik.es/)
**License**: Open Data
**Update Cadence**: 60 seconds
**Data**: Station locations and availability

**Status**: real where city coverage exists

### Phase 7: Military Flights
**Status**: unavailable
**Reason**: No legitimate open source for real-time military aircraft positions. ADS-B Exchange exists but has legal/ethical concerns for military tracking.

## Database Schema Extensions

### External Data Cache Table
```sql
CREATE TABLE external_data_cache (
  layer_id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_url TEXT,
  last_fetch_at TIMESTAMP WITH TIME ZONE,
  data_freshness_seconds INTEGER,
  status TEXT CHECK (status IN ('real', 'degraded', 'unavailable')),
  record_count INTEGER DEFAULT 0,
  raw_data JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### External Data Events Table
```sql
CREATE TABLE external_data_events (
  event_id TEXT PRIMARY KEY,
  layer_id TEXT NOT NULL REFERENCES external_data_cache(layer_id),
  external_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  observed_at TIMESTAMP WITH TIME ZONE,
  geometry GEOMETRY(Point, 4326),
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## API Endpoints

### GET /layers
Returns all data layers with status, counts, and freshness.

### GET /layers/:layerId/data
Returns current data for a specific layer.

### GET /layers/:layerId/refresh
Triggers a manual refresh of layer data (rate limited).

## Frontend Updates

### Layer State Contract
```typescript
interface LayerState {
  id: string;
  label: string;
  provider: string;
  status: 'real' | 'degraded' | 'unavailable';
  count: number | null;
  lastUpdate: string | null;
  errorMessage: string | null;
  toggleable: boolean;
  enabled: boolean;
}
```

### Left Rail Updates
- Show provider name for real layers
- Show "--" for unavailable counts
- Show "delayed" or "limited" for degraded
- Show timestamp with relative freshness (e.g., "2 min ago")

## Testing Requirements

### Unit/Adapter Tests
- Test each adapter with mocked HTTP responses
- Test normalization logic
- Test error handling and degraded states
- Test rate limiting

### Integration Tests
- Test API endpoints return correct layer status
- Test database persistence of external events
- Test cache refresh logic
- Test concurrent refresh requests

### Frontend Tests
- Test layer status rendering (real/degraded/unavailable)
- Test toggle behavior
- Test Cesium rendering for each layer type
- Test error state display

### E2E Tests
- Test full data flow from source to globe
- Test layer visibility toggles
- Test alert integration with real data layers
- Test replay mode with external data

## Definition of Done
- [x] Earthquakes and Satellites are real and working end to end
- [x] Additional layers implemented where truthfully feasible
- [x] Each left-rail layer clearly shows real/degraded/unavailable
- [x] Globe rendering works for implemented layers
- [x] Tests and hard gates pass
- [x] Docs clearly state what is truly supported

## Implementation Summary

### Real Layers
| Layer | Source | Status | Records |
|-------|--------|--------|---------|
| Earthquakes (24h) | USGS GeoJSON | ✅ REAL | ~50-100 M2.5+ events |
| Satellites | CelesTrak TLE | ✅ REAL | ~100 visual satellites |
| Bikeshare | CityBikes API | ✅ REAL | ~1000 stations |
| Weather Radar | NOAA/NWS | ⚠️ DEGRADED | Alerts only (no radar imagery) |
| Street Traffic | TomTom/Google | ⚠️ DEGRADED | Requires API key |
| Military Flights | N/A | ❌ UNAVAILABLE | No legitimate source |

### Files Created
- `packages/external-data/src/types.ts` - Core types and contracts
- `packages/external-data/src/http-client.ts` - Rate-limited HTTP client
- `packages/external-data/src/cache.ts` - In-memory caching with TTL
- `packages/external-data/src/adapters/usgs-earthquakes.ts` - USGS earthquake adapter
- `packages/external-data/src/adapters/celestrak-satellites.ts` - Satellite TLE adapter
- `packages/external-data/src/adapters/noaa-weather.ts` - NOAA weather adapter
- `packages/external-data/src/adapters/citybikes.ts` - Bikeshare adapter
- `packages/external-data/src/adapters/street-traffic.ts` - Traffic adapter (degraded)
- `packages/external-data/src/adapters/military-flights.ts` - Military flights (unavailable)
- `packages/external-data/src/index.ts` - Public API and registry
- `infra/migrations/0002_external_data_layers.sql` - Database schema
- `tests/unit/external-data/*.spec.ts` - Adapter unit tests
- `tests/integration/external-data-api.spec.ts` - Integration tests
- `tests/e2e/external-data-layers.spec.ts` - E2E tests

### Files Modified
- `packages/persistence/src/postgres-persistence.ts` - Added external data methods
- `apps/api/src/server.ts` - Added layer API endpoints
- `apps/web/public/index.html` - Updated layer rail markup
- `apps/web/public/app.js` - Added external data layer rendering
- `apps/web/public/tactical-styles.css` - Added status indicator styles
- `docs/plans/00_EXECUTION_BASELINE.md` - Added Phase 15 summary

## Sources Reference

| Layer | Source | License | Status |
|-------|--------|---------|--------|
| Earthquakes | USGS GeoJSON | Public Domain | Real |
| Satellites | CelesTrak/N2YO | Public Domain | Real |
| Weather Radar | NOAA/NWS | Public Domain | Degraded |
| Street Traffic | TomTom/Mapbox | API Key Required | TBD |
| Bikeshare | CityBikes | Open Data | Real |
| Military Flights | N/A | N/A | Unavailable |

## Files to Create/Modify

### New Files
- `docs/plans/15_REAL_DATA_LAYER_EXPANSION_PROGRESS.md` - This file
- `packages/external-data/src/types.ts` - Shared types
- `packages/external-data/src/http-client.ts` - Rate-limited HTTP client
- `packages/external-data/src/cache.ts` - Caching logic
- `packages/external-data/src/adapters/usgs-earthquakes.ts` - USGS adapter
- `packages/external-data/src/adapters/celestrak-satellites.ts` - Satellite adapter
- `packages/external-data/src/adapters/noaa-weather.ts` - Weather adapter
- `packages/external-data/src/adapters/citybikes.ts` - Bikeshare adapter
- `packages/external-data/src/index.ts` - Public API
- `apps/api/src/layers-api.ts` - Layer API endpoints
- `apps/web/public/external-data-layers.js` - Frontend layer management

### Modified Files
- `apps/api/src/server.ts` - Add layer endpoints
- `packages/persistence/src/postgres-persistence.ts` - Add external data queries
- `apps/web/public/app.js` - Integrate external data layers
- `apps/web/public/index.html` - Update layer rail markup
- `docs/plans/00_EXECUTION_BASELINE.md` - Add Phase 15 summary
