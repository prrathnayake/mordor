# Task Log for 2026-05-31

## 2026-05-31T00:00:00Z — Replace Cesium point entities with SVG billboard icons in app.js

**Summary:** Modified `/Users/pasan/Desktop/Projects/mordor/apps/web/public/app.js` to replace all simple colored-circle `point` Cesium entities with proper SVG `billboard` icons.

**Changes made (14 distinct edits):**
1. **Inserted SVG icon helpers** after `sanitizeEmbedUrl` and before `clearEntityMap`. Added `svgToDataUrl`, `getSvgIcon` (with 17 icon types: aircraft, aircraft-ground, satellite, space-station, starlink, earthquake, weather, traffic, bikeshare, camera, sensor, incident, swan, intelligence, inference, artifact, default), `getMarkerIconType`, and `getIntelligenceSourceIconType`.
2. **`buildFlightEntitySpec`** — Replaced `point` block with `billboard` using `aircraft-ground` / `aircraft` icons sized 20/28px, with heading rotation.
3. **`upsertLiveFlightEntity`** — Updated existing entity assignment from `existing.point` to `existing.billboard`.
4. **`renderMapMarkers` (replay section)** — Replaced `point`/`ellipse` blocks with unified `billboard` using `aircraft` icon sized 18/24px with heading rotation.
5. **`renderSwanMapOverlays`** — Replaced `point` with `billboard` using `swan` icon (22px).
6. **`renderIntelligenceSourceLayer`** — Replaced `point` with `billboard` using dynamic icon from `getIntelligenceSourceIconType` (18/22px). Updated existing entity color assignment to `existing.billboard.color`.
7. **`renderIncidentContext` AOI point** — Replaced `point` with `billboard` using `incident` icon (26px).
8. **`renderIncidentIntelligenceMapEntities`** — Replaced `point` with `billboard` using `artifact` icon (20px).
9. **`renderCorrelationTimeline`** — Replaced `point` with `billboard` using dynamic icon from `getMarkerIconType`.
10. **`renderSatellites`** — Replaced `point` with `billboard` using `space-station` / `starlink` / `satellite` icons. Updated existing entity assignment to `existing.billboard`.
11. **`renderWeather`** — Replaced `point` with `billboard` using `weather` icon (20px).
12. **`renderBikeshare`** — Replaced `point` with `billboard` using `bikeshare` icon (size+8).
13. **`renderTraffic`** — Replaced `point` with `billboard` using `traffic` icon (18px).
14. **Inference rendering** — Replaced `point` with `billboard` using `inference` icon (22px).

**Verification:** `node --check apps/web/public/app.js` passed with no syntax errors.

## 2026-05-31T08:55:00Z — Redesign MORDOR UI to classified-intelligence terminal aesthetic

**Summary:** Complete UI overhaul of `apps/web` to match a classified-intelligence terminal design (WORLDVIEW) with proper SVG icons, real data, and layout overhaul.

**Files modified:**
1. **`apps/web/public/tactical-styles.css`** — Complete redesign:
   - Added WORLDVIEW classification header with `rgba(8,8,12,0.92)` panels
   - Added sensor control panel with CCTV 05 / Austin SAT labels
   - Added camera feed container with timer, range, FOV readouts
   - Added location preset chips (Austin, SF, NY, Tokyo, London, Paris, Dubai, DC)
   - Added POI chips (Texas State Capitol, Frost Bank Tower, etc.)
   - Added mode selector buttons (Normal, CRT, NVG, FLIR, Anime, Noir, Snow, AI)
   - Added telemetry readouts (GSD, NIIRS, ALT, SUN EL)
   - Added toggle switches v2 (Bloom, Sharpen, HUD, Panoptic)
   - Added CRT scanline effects, green `#00ff41` / amber `#f59e0b` accents

2. **`apps/web/public/index.html`** — Structural overhaul:
   - Added `worldview-header` with classification markings
   - Added `sensor-control-panel` with CCTV labels and button grids
   - Added `camera-feed-container` with simulated static/noise
   - Added `location-preset-chips` and `poi-chips`
   - Added `mode-selector-buttons`
   - Added `telemetry-readouts`
   - Added new toggle switches and tactical select
   - Preserved all existing DOM IDs referenced by `app.js`

3. **`apps/web/public/app.js`** — New JS functions:
   - `flyToLocationPreset()` / `flyToPoi()` — Camera fly-to for presets and POIs
   - `initLocationPresets()` / `initModeSelector()` — Event binding
   - `setViewMode()` — Applies preset + surface mode
   - `startCameraTimer()` / `stopCameraTimer()` — REC timer
   - `updateTelemetryReadouts()` — GSD, NIIRS, ALT, SUN EL from camera
   - `initSensorSliders()` — Pitch, Roll, Yaw, Zoom, etc.
   - `initNewToggles()` — Bloom, Sharpen, HUD, Panoptic toggle wiring
   - `updateClassificationLabel()` — Dynamic "CRT STREET NEAR X" text
   - Added camera.changed listener for live telemetry updates

**Verification:**
- `node --check apps/web/public/app.js` passed
- `npm run typecheck` passed
- Docker container rebuilt and running (`mordor-web` on `:3001`)
- Fetched HTML confirms new WORLDVIEW layout is served

**Known issues (not addressed in this task):**
- API `relation "data_source_registry" does not exist` (PostgreSQL schema)
- Satellite external layer has 0 events
- `/external-layers/satellites/events` and `/earthquakes/events` return 404
