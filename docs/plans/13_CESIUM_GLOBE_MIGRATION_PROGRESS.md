# Phase 13: Cesium Globe Migration + Click-to-Live-View Foundation

## Status: In Progress

## Date: 2026-04-06

## Summary
Migrated the Chrona Twin platform from a 2D Leaflet-based map to a 3D CesiumJS globe viewer. This enables true geospatial visualization with terrain awareness and provides the foundation for future advanced 3D features.

## Implementations

### CesiumJS Globe Viewer
- Replaced Leaflet with CesiumJS 1.112 in `apps/web/public/app.js`
- Globe viewer with terrain support via Cesium World Terrain
- Camera controls preserved (zoom, pan, rotate)
- Initial view set to Sydney, Australia

### Object Visualization on Globe
- Objects rendered as ellipse entities on the globe
- Color-coded by mode: green for live, yellow for replay
- Selection highlighting with red outline
- Click-to-select functionality preserved

### Track/Replay Visualization
- Replay tracks rendered as dashed polylines on the globe
- Track color matches mode (live: green, replay: brown)
- Timeline controls preserved (play, pause, step, reset)
- Camera fly-to on replay load for better context

### Live Mode Preservation
- SSE event streaming still works on the globe
- Live object state updates reflected in real-time
- Reconnect/recovery logic preserved
- Source health display preserved

### Click-to-Live-View Foundation
- New "Live View" panel in the right sidebar
- Shows when an object is selected
- Displays placeholder content:
  - "No live camera view available" for objects without camera sources
  - Shows nearest source reference if available
  - Ready for real video streaming when backend supports it
- No fake video feeds - strictly honest about availability

## Files Changed

### HTML
- `apps/web/public/index.html`:
  - Replaced Leaflet CSS/JS with CesiumJS
  - Changed `map` div to `cesiumContainer`
  - Added `live-view-section` panel

### JavaScript
- `apps/web/public/app.js`:
  - Migrated all Leaflet code to CesiumJS
  - Replaced `objectMarkers` Map with `objectEntities` Map
  - Replaced `trackPolylines` array with single `trackEntity`
  - Added `cartesianFromLatLon` helper function
  - Updated `renderMapMarkers` to use Cesium entities
  - Updated `renderTrack` to use Cesium polylines
  - Added `updateLiveViewSection` function
  - Updated `initMap` to `initCesium` with proper initialization
  - Added entity click handler for object selection

### CSS
- `apps/web/public/styles.css`:
  - Added Cesium container styles
  - Added `live-view-section` styles
  - Added `.live-view-placeholder` styles

## Dependencies
- Added `cesium` package to package.json

## Tests Added

### E2E Tests (`tests/e2e/cesium-globe.spec.ts`)
1. `Cesium globe viewer loads successfully` - Verifies Cesium initializes
2. `replay renders objects on the globe` - Verifies replay works on globe
3. `live mode connects and displays on globe` - Verifies live mode works
4. `object selection works on the globe` - Verifies click-to-select
5. `live view section shows when object is selected` - Verifies live view panel
6. `alert investigation jump to replay still works` - Verifies alert integration

## Architectural Changes

### Before (Leaflet)
- 2D mercator projection
- Tile-based map rendering
- L.marker for objects
- L.polyline for tracks
- Zoom levels 1-19

### After (Cesium)
- 3D globe with terrain
- Entity-based rendering
- EllipseGraphics for objects
- PolylineGraphics for tracks
- Full 3D navigation

## Backwards Compatibility
- All existing workflows preserved
- Alert investigation links still work
- Replay timeline unchanged
- Authentication flow unchanged
- API contracts unchanged

## Known Limitations
- Uses default Cesium Ion token (should be replaced for production)
- No custom 3D models for objects (uses simple ellipses)
- Live view is placeholder only (no real video)
- Terrain data requires internet connection

## Next Steps for Future Phases
- Add custom 3D models for different object types
- Implement real video streaming when backend supports
- Add photorealistic 3D tiles for key areas
- Optimize performance for large numbers of objects
- Add measurement tools for geospatial analysis

## Test Results
- [To be run after completion]

## Validation
- [ ] TypeScript check passes
- [ ] Biome lint passes
- [ ] Vitest unit tests pass
- [ ] E2E tests pass
- [ ] Hard gates pass
