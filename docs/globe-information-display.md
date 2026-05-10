# Globe Information Display System

## Overview

The Globe Information Display System provides a centralized, real-time visualization of multi-source intelligence data on an interactive 3D Earth globe. Data is collected from various sources, stored in a PostgreSQL/PostGIS database, analyzed by SWAN agents, and presented through categorized floating widgets with zoom-responsive animations.

## Architecture

```
Data Sources → Ingestion → PostgreSQL/PostGIS → SWAN Analysis → UI Globe
     ↑                                                              ↓
     └──────────────────── Real-time SSE ←──────────────────────────┘
```

## Data Categories

### Implemented Layers

| Layer | Source | Interval | Geospatial | Endpoint |
|-------|--------|----------|------------|----------|
| Aviation | OpenSky + ADSB.lol | 30s | Yes | `/universal/aviation` |
| Weather | OpenWeatherMap + NOAA | 60s | Yes | `/universal/weather` |
| Space | NASA + EONET | 120s | Yes | `/universal/space` |
| Security | AbuseIPDB + OTX + Shodan | 120s | Yes | `/universal/security` |
| News | NewsAPI + MediaStack | 60s | No | `/universal/news` |
| Finance | Alpha Vantage + CoinGecko | 60s | No | `/universal/finance` |
| Social | Reddit + Bluesky | 60s | No | `/universal/social` |
| **Seismic** | **USGS + EMSC** | **30s** | **Yes** | **`/universal/seismic`** |
| **Maritime** | **MarineTraffic + VesselFinder** | **60s** | **Yes** | **`/universal/vessels`** |
| **Custom Intel** | **Internal Sources** | **120s** | **Yes** | **`/universal/custom-intel`** |

### New Data Types (v0.2.0)

#### Seismic Events
- Earthquake magnitude, depth, location
- Tsunami warnings
- Felt reports count
- Significance scoring

#### Maritime Traffic
- Vessel positions (IMO, MMSI)
- Speed, heading, destination
- ETA tracking
- Vessel type classification

#### Custom Intelligence
- User-defined intelligence feeds
- Flexible severity levels
- Tag-based categorization
- Metadata support

## Widget System

### Widget Types

1. **Tooltip Widget** - Hover-triggered info cards (200px, auto-dismiss)
2. **Info Card Widget** - Persistent detail panels (340px, closable)
3. **Cluster Widget** - Aggregated count badges with expandable animations
4. **Alert Badge Widget** - Pulsing severity indicators
5. **Route Line Widget** - Trajectory visualization with animated paths

### Category Icons

| Category | Icon | Color |
|----------|------|-------|
| Aviation | ✈ | #38bdf8 |
| Weather | 🌤 | #22d3ee |
| Space | 🛰 | #a78bfa |
| Security | 🔒 | #f87171 |
| News | 📰 | #f59e0b |
| Finance | 💰 | #4ade80 |
| Social | 💬 | #60a5fa |
| Seismic | 📡 | #fb923c |
| Maritime | 🚢 | #0ea5e9 |
| Custom Intel | 🎯 | #e879f9 |

## Zoom Behavior

| Zoom Level | Behavior |
|------------|----------|
| 1-4 | Cluster markers only, no labels |
| 5-10 | Individual markers with abbreviated labels |
| 11+ | Full labels + expanded info cards |

### Animations

- **Cluster Expansion**: Scale 0.5→1, opacity 0→1 (200ms)
- **Label Fade**: translateY(5px)→0, opacity 0→1 (150ms)
- **Card Slide**: translateY(20px)→0, scale(0.95)→1 (300ms)
- **Live Pulse**: 2s infinite opacity pulse for real-time indicators

## SWAN Event Integration

### New Triggers (v0.2.0)

- `zoom_level_changed` - Contextual data loading based on zoom
- `widget_interacted` - Track user engagement with widgets
- `data_threshold_crossed` - Alert on sensor threshold breaches
- `geofence_entered` - Geographic boundary triggers
- `time_window_elapsed` - Temporal analysis triggers

### Enhanced Providers

- **Zoom Context Provider** - Fetches relevant data for current zoom level
- **Geofence Provider** - Monitors active geofences against positions
- **Threshold Provider** - Watches data streams for threshold breaches
- **Widget Interaction Provider** - Routes widget actions to SWAN analysis

## UI Optimizations

### Applied Optimizations

1. **Search Debounce** - 150ms debounce on entity search input
2. **Camera Throttle** - Coordinated display updates throttled
3. **CRT Overlay** - GPU-accelerated with `will-change: transform` and `contain: layout`
4. **Entity Diffing** - Only update changed properties on Cesium entities
5. **SSE Reconnection** - Mode-aware reconnection logic

## API Endpoints

### New Endpoints

```
GET /universal/seismic?min_magnitude=2.5&hours=24&limit=50
GET /universal/vessels?west=-180&south=-90&east=180&north=90&limit=50
GET /universal/custom-intel?source_id=&severity=&limit=25
```

### Query Parameters

**Seismic:**
- `min_magnitude` - Minimum earthquake magnitude
- `hours` - Time window in hours
- `limit` - Maximum results

**Vessels:**
- `west`, `south`, `east`, `north` - Geographic bounds
- `limit` - Maximum results

**Custom Intel:**
- `source_id` - Filter by source
- `severity` - Filter by severity (low/medium/high/critical)
- `limit` - Maximum results

## Database Schema

### New Tables (Migration 014)

```sql
-- Seismic Events
CREATE TABLE seismic_events (
  event_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  magnitude NUMERIC(4,2) NOT NULL,
  depth_km NUMERIC(7,2) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  tsunami_warning BOOLEAN DEFAULT FALSE,
  felt_reports INTEGER DEFAULT 0,
  significant BOOLEAN DEFAULT FALSE
);

-- Vessel Positions
CREATE TABLE vessel_positions (
  vessel_id TEXT NOT NULL,
  source TEXT NOT NULL,
  vessel_name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (vessel_id, observed_at)
);

-- Custom Intel
CREATE TABLE custom_intel_sources (
  source_id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE custom_intel_observations (
  intel_id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES custom_intel_sources,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  received_at TIMESTAMPTZ NOT NULL
);
```

## Configuration

### Environment Variables

```bash
# Existing
NEWSAPI_KEY=...
OPENWEATHERMAP_KEY=...
NASA_API_KEY=...

# New (for maritime - optional)
MARINETRAFFIC_KEY=...
VESSELFINDER_KEY=...
```

## Version History

### v0.2.0 (Current)
- Added seismic, maritime, and custom intel data layers
- Implemented reusable widget system with 5 widget types
- Added zoom-responsive animations and behaviors
- Enhanced SWAN with 5 new event triggers and 4 providers
- Applied 5 UI performance optimizations
- Added 3 new API endpoints

### v0.1.0 (Previous)
- Base aviation, weather, space, security layers
- News, finance, social panels
- Basic SWAN integration
- Cesium globe visualization
