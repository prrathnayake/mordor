# Revival Summary for 2026-05-31

## Current State
Working on the Chrona Twin / MORDOR Tactical Operations Center UI redesign.

## Last Actions Completed
1. Replaced all Cesium `point` entities with SVG `billboard` icons (17 icon types: aircraft, satellite, earthquake, weather, traffic, etc.)
2. Complete UI redesign to classified-intelligence terminal aesthetic:
   - `tactical-styles.css` overhauled with WORLDVIEW branding, CRT effects, green/amber accents
   - `index.html` restructured with sensor controls, camera feed, location/POI chips, mode buttons, telemetry readouts
   - `app.js` updated with fly-to functions, camera timer, telemetry updates, sensor sliders, toggle wiring

## Active Containers
- `mordor-web` (port 3001) — rebuilt and running with new UI
- `mordor-api` (port 3000)
- `mordor-postgres`
- `mordor-redis`

## Next Steps / Blockers
- Verify UI in browser (circular viewport mask, new controls functional)
- Fix `data_source_registry` PostgreSQL table missing
- Fix satellite/earthquake external layer routes returning 404
- Address auth requirement for live flight data (login `viewer`/`viewer123` returns token)
