# Phase 14: MORDOR Tactical UI Redesign + Worldview-Style Operations Shell

## Status: In Progress

## Date: 2026-04-06

## Summary
Redesigning the Chrona Twin web application UI to match a tactical operations center aesthetic - dark, cinematic, sensor-HUD style interface with central globe viewport, data-layers rail on the left, visual controls rail on the right, and tactical header/status displays. Project rebranded as MORDOR for this phase.

## Design Goals

### Aesthetic Target
- Dark, cinematic, sensor-HUD style interface
- CRT/tactical aesthetic while maintaining usability
- Large circular or masked central globe/city viewport
- High contrast, neon accents on dark backgrounds
- Military/operations center visual language

### Layout Structure
- **Top**: Tactical header with status line, session info, global alerts
- **Left**: Data-layers rail - operational data toggles
- **Center**: Cesium globe viewport with circular/masked presentation
- **Right**: Visual-controls rail - style presets, effects, view modes
- **Bottom**: Location/style/timeline controls, mode switch

### Preserved Functionality
- Live monitoring with SSE events
- Deterministic replay with timeline controls
- Alert system with investigation workflow
- Evidence chain and replay jump
- Role-based access (viewer/operator/admin)
- Session management with token expiration
- Source health monitoring
- Object selection and inspection

## Data Layers (Left Rail)

Each layer row shows:
- Icon (tactical symbol)
- Label
- Source/provider text
- Count if available
- Last update if available
- On/off toggle

### Layer Inventory

1. **Live Flights** - Real-time aircraft positions
   - Status: ✅ Real data from existing telemetry
   - Source: Telemetry fixtures/live feed

2. **Military Flights** - Military aircraft positions
   - Status: 🚧 Placeholder - Not yet implemented
   - Source: N/A

3. **Earthquakes (24h)** - Seismic activity
   - Status: 🚧 Placeholder - Not yet implemented
   - Source: N/A

4. **Satellites** - Orbital objects
   - Status: 🚧 Placeholder - Not yet implemented
   - Source: N/A

5. **Street Traffic** - Road vehicle density
   - Status: 🚧 Placeholder - Not yet implemented
   - Source: N/A

6. **Weather Radar** - Precipitation data
   - Status: 🚧 Placeholder - Not yet implemented
   - Source: N/A

7. **CCTV Mesh** - Camera network status
   - Status: ⚠️ Partial - Foundation exists, shows nearest source
   - Source: Camera observations

8. **Bikeshare** - Bike rental stations
   - Status: 🚧 Placeholder - Not yet implemented
   - Source: N/A

## Visual Controls (Right Rail)

### Style Presets
- **CRT** - Scanlines, phosphor glow, retro terminal aesthetic
- **NVG** - Night vision green monochrome
- **FLIR** - Thermal imaging false-color
- **Clean** - Minimal UI, maximum viewport

### Visual Effects
- **Bloom** - Glow intensity slider
- **Sharpen** - Edge enhancement
- **Pixelation** - Retro pixelation level
- **Distortion** - CRT barrel distortion
- **Instability** - Flicker and jitter

### View Modes
- **HUD Toggle** - Show/hide tactical overlays
- **Layout Mode** - Compact/expanded panels
- **Detect/Panoptic** - Object highlighting modes

## CCTV/Camera Panel

When CCTV Mesh layer is active or camera-linked object selected:
- Shows tactical camera section/panel
- If real live/snapshot source exists: display source info
- If not: show truthful placeholder:
  - "No live view available"
  - Nearest source ID if known
  - Last snapshot/update if known
- No fake live video streams

## Implementation Plan

### Phase 1: Foundation
1. Create new HTML structure for tactical layout
2. Implement CSS with CRT/HUD aesthetic
3. Add tactical font and icon set
4. Create circular/masked viewport container

### Phase 2: Rails
1. Build left data-layers rail with 8 layers
2. Build right visual-controls rail
3. Implement toggle logic for layers
4. Implement visual control sliders/switches

### Phase 3: Workflows
1. Wire existing live monitoring to new UI
2. Wire existing replay to new UI
3. Wire alerts and investigation
4. Wire auth/session management

### Phase 4: CCTV
1. Add camera panel foundation
2. Implement truthful placeholder behavior
3. Integrate with existing camera observations

### Phase 5: Testing
1. Write frontend integration tests
2. Write e2e tests for new shell
3. Run hard gate validations
4. Update documentation

## Files to Create/Modify

### New Files
- `docs/plans/14_MORDOR_TACTICAL_UI_PROGRESS.md` - This file
- `apps/web/public/tactical-styles.css` - Tactical theme CSS
- `apps/web/public/tactical-app.js` - Tactical UI logic

### Modified Files
- `apps/web/public/index.html` - Restructured for tactical layout
- `apps/web/public/styles.css` - Base styles (minimal reset)
- `apps/web/public/app.js` - Refactored for tactical integration
- `docs/plans/00_EXECUTION_BASELINE.md` - Add Phase 14 summary

### Test Files
- `tests/e2e/tactical-ui.spec.ts` - E2E tests for new shell
- `tests/integration/tactical-shell.spec.ts` - Integration tests

## Test Requirements

### Frontend Integration Tests
1. Shell renders with correct layout structure
2. Left rail displays all 8 data layers
3. Right rail displays visual controls
4. Tactical header shows status information
5. Bottom bar shows timeline/navigation controls

### E2E Tests
1. **Login Flow** - Authentication works in new UI
2. **Globe Load** - Cesium initializes in circular viewport
3. **Layer Panel** - All 8 layers visible and toggleable
4. **Object Selection** - Click-to-select works on globe
5. **Alert Investigation** - Jump to replay from alert works
6. **Replay Controls** - Timeline and playback work
7. **CCTV Panel** - Shows truthful placeholder
8. **Visual Controls** - Style presets apply correctly

### Role/Auth Regression Tests
1. Viewer sees read-only interface
2. Operator sees alert action controls
3. Admin has full access
4. Session expiration handled gracefully

### Replay/Live Workflow Regression Tests
1. Live mode connects and displays updates
2. Replay mode loads and plays
3. Mode switch preserves state correctly
4. Alert-to-replay jump fills correct parameters

## Validation Checklist

- [ ] TypeScript check passes
- [ ] Biome lint passes
- [ ] Vitest unit tests pass
- [ ] E2E tests pass
- [ ] Hard gates pass
- [ ] No fake data in live view
- [ ] No branding from reference screenshots
- [ ] All existing workflows preserved
- [ ] Documentation updated

## Definition of Done

1. MORDOR has the new tactical UI shell with:
   - Dark CRT/HUD aesthetic
   - Circular masked Cesium viewport
   - Left data-layers rail with 8 layers
   - Right visual-controls rail
   - Tactical header with status
   - Bottom timeline/navigation bar

2. Existing workflows still work inside new layout:
   - Live monitoring with SSE
   - Replay with timeline controls
   - Alert system with investigation
   - Evidence chain and replay jump
   - Auth/roles/session management
   - Source health monitoring
   - Object selection and inspection

3. Left rail shows all requested data layers clearly marked as real or placeholder

4. Right rail provides tactical visual controls that affect presentation

5. Central globe view feels like real operations interface

6. CCTV/live-view foundation exists truthfully with no fake video

7. Tests pass including frontend integration and e2e tests

8. Documentation updated with Phase 14 completion
