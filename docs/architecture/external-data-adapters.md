# External Data Adapters Documentation

The External Data package (`packages/external-data/`) provides adapters for integrating real-world data sources into the digital twin platform.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    External Data Layer                      │
├─────────────────────────────────────────────────────────────┤
│  ExternalDataRegistry                                       │
│  ├── USGSEarthquakeAdapter    (USGS Earthquake API)        │
│  ├── CelesTrakAdapter         (NASA/DoD Satellite TLEs)    │
│  ├── NOAAWeatherAdapter      (NOAA Weather Alerts)         │
│  ├── CityBikesAdapter        (CityBikes bike share)        │
│  ├── MilitaryFlightsAdapter  (Military flight tracking)    │
│  └── StreetTrafficAdapter    (TomTom/Google Traffic)        │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure                                             │
│  ├── http-client.ts         (HTTP client with rate limits) │
│  ├── cache.ts              (Response caching)              │
│  └── types.ts              (Shared types)                  │
└─────────────────────────────────────────────────────────────┘
```

## Adapter Interface

All adapters implement a common interface:

```typescript
interface ExternalDataAdapter {
  readonly source: ExternalDataSource;
  fetch(): Promise<FetchResult<ExternalDataEvent[]>>;
}
```

### FetchResult

```typescript
interface FetchResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  fetchedAt: string;
  durationMs: number;
}
```

## Supported Data Sources

### USGS Earthquakes

Fetches earthquake data from USGS GeoJSON feed.

```typescript
import { createUSGSEarthquakeAdapter } from "external-data";

const adapter = createUSGSEarthquakeAdapter();
const result = await adapter.fetch();

// Returns events with:
// - eventType: 'earthquake'
// - magnitude, location, depth in payload
// - GeoJSON Point geometry
```

**Source Details**:
- Provider: USGS
- URL: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
- Update Cadence: 5 minutes
- License: Public Domain

### CelesTrak Satellites

Fetches TLE (Two-Line Element) satellite data from CelesTrak.

```typescript
import { createCelesTrakAdapter } from "external-data";

const adapter = createCelesTrakAdapter();

// Fetch by category
const result = await adapter.fetchTLEs("visual");  // Visual satellites
const result = await adapter.fetchTLEs("stations"); // ISS, Tiangong
const result = await adapter.fetchTLEs("active");   // Active satellites
```

**Source Details**:
- Provider: CelesTrak (NASA/DoD)
- URL: https://celestrak.org/
- Update Cadence: 1 hour
- License: Public Domain

### NOAA Weather

Fetches weather alerts from NOAA National Weather Service API.

```typescript
import { createNOAAWeatherAdapter } from "external-data";

const adapter = createNOAAWeatherAdapter();
const result = await adapter.fetchAlerts();

// Filter by state
const result = await adapter.fetchAlerts({ state: "NY" });
```

**Source Details**:
- Provider: NOAA/NWS
- URL: https://api.weather.gov/
- Update Cadence: 10 minutes
- License: Public Domain

### CityBikes

Fetches bike share station data from CityBikes API.

```typescript
import { createCityBikesAdapter } from "external-data";

const adapter = createCityBikesAdapter();
const result = await adapter.fetchMajorCities();

// Fetch specific network
const result = await adapter.fetchNetwork("citi bikes nyc");
```

**Source Details**:
- Provider: CityBikes
- URL: https://api.citybik.es/
- Update Cadence: 1 minute
- License: Open Data

### Street Traffic

Fetches traffic incident data (requires API key).

```typescript
import { createStreetTrafficAdapter } from "external-data";

const adapter = createStreetTrafficAdapter("YOUR_API_KEY");
const result = await adapter.fetchIncidents();

// Fetch within bounds
const result = await adapter.fetchIncidents({
  bounds: {
    minLat: 40.0,
    maxLat: 41.0,
    minLon: -75.0,
    maxLon: -73.0
  }
});
```

**Source Details**:
- Provider: TomTom / Google Maps
- License: Commercial API Key Required

### Military Flights

Fetches military aircraft data (simulated for demo purposes).

```typescript
import { createMilitaryFlightsAdapter } from "external-data";

const adapter = createMilitaryFlightsAdapter();
const result = await adapter.fetch();
```

**Note**: This adapter provides simulated data for demonstration purposes.

## HTTP Client

The package provides a rate-limited HTTP client:

```typescript
import { createHttpClient } from "external-data";

const client = createHttpClient({
  timeout: 30000,
  maxRetries: 3,
  rateLimit: {
    maxRequests: 10,
    windowMs: 60000
  }
});
```

## Caching

Built-in response caching to reduce API calls:

```typescript
import { ExternalDataCache, createCacheKey } from "external-data";

// Create cache key
const key = createCacheKey("earthquakes", { timeRange: "24h" });

// Check cache
const cached = ExternalDataCache.get(key);

// Set cache
ExternalDataCache.set(key, data, ttlMs);
```

## Event Normalization

All adapters normalize data to a common `ExternalDataEvent` format:

```typescript
interface ExternalDataEvent {
  eventId: string;           // Generated UUID
  externalId: string;        // Original source ID
  eventType: string;         // Event category
  observedAt: string;        // ISO timestamp
  lat: number;
  lon: number;
  altitudeM?: number;
  payload: Record<string, unknown>;  // Source-specific data
}
```

## Error Handling

All fetch operations return consistent error structure:

```typescript
{
  success: false,
  error: "Error message",
  fetchedAt: "2025-01-01T00:00:00.000Z",
  durationMs: 1234
}
```

The system tracks source health:

```typescript
interface SourceHealth {
  source_id: string;
  status: "active" | "inactive" | "stale" | "error";
  last_seen_at: string;
  error_message: string | null;
}
```

## Usage in API Server

External data is refreshed via API endpoints:

```bash
# Get all layers
GET /layers

# Get layer data
GET /layers/earthquakes/data

# Refresh layer (authenticated)
POST /layers/earthquakes/refresh
```

When the API live-world service auto-refreshes a layer, it also publishes an
`external_layer_update` event over `/live/events`. The web client can use that signal to
reload only the affected layer instead of polling and redrawing every external layer at once.

The refresh process:
1. Calls adapter's fetch method
2. Persists events to `external_data_events` table
3. Updates layer metadata (status, record_count, last_fetch_at)
4. Returns success/failure with count
