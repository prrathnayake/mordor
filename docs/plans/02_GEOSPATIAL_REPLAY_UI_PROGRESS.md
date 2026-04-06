# Geospatial Replay UI Progress

## Date
2026-04-05

## Phase
Geospatial Replay UI (Phase 4-6 continuation)

## Scope implemented
- map/globe view using Leaflet
- replay timeline controls (play, pause, step, reset, scrub)
- layer toggles (tracked objects, tracks)
- object selection/inspection panel
- API integration with existing replay endpoints

## Runtime paths now working
1. Web UI map path
   `apps/web -> map viewer -> Leaflet -> object markers`
2. Replay timeline path
   `load replay -> play/pause/step/scrub -> state update -> map update`
3. Layer toggle path
   `layer checkbox -> marker visibility -> track visibility`
4. Inspector path
   `click marker -> select object -> inspector panel update`

## Notable boundaries preserved
- replay logic remains in `packages/replay/`
- domain projection remains in `packages/domain/`
- frontend uses existing replay API, no new endpoints added
- Leaflet used directly in public folder, no map library leakage

## Current limitations by design
- map tiles from OpenStreetMap (not custom tiles)
- limited to position_observed events from fixture adapter
- no live streaming mode yet
- no auth implemented
- basic layer toggles only

## Exit evidence
- TypeScript typecheck passes
- biome lint passes
- all gate checks pass
- unit tests pass (replay timeline controls)
- integration tests pass (replay rendering behavior)
- e2e tests pass (8 tests for replay web functionality)
- regression test passes (malformed input quarantine)
