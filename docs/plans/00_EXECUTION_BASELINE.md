# Execution Baseline

## Date
2026-04-05

## Baseline decisions
- operating domain: campus monitoring
- architectural baseline: modular monolith with clean package boundaries
- implementation baseline: TypeScript-first repository with root-level tooling, shared contracts, deterministic replay helpers, and migration-backed storage definitions
- storage target: PostgreSQL with PostGIS for production-aligned persistence once DB-backed integration work begins

## Current repository status
Before this bootstrap pass, the repository contained only the markdown planning pack under `docs/`.

### What existed
- product, architecture, domain, frontend, backend, ingestion, replay, security, and compliance documents
- implementation plan, test strategy, hard gates, bootstrap tasks, and risk register

### What was missing
- repo skeleton matching the documented package layout
- ADRs required by bootstrap day 1
- executable contract artifacts
- migration baseline
- tests and validation tooling
- CI skeleton

## Bootstrap scope completed in this pass
- created the top-level repo skeleton for `apps/`, `packages/`, `infra/`, `tests/`, `scripts/`, and `.github/`
- recorded ADR 0001, ADR 0002, and an initial technology baseline ADR
- added baseline contract schemas and runtime validators
- added a deterministic replay comparator and latest-state projection helper
- added baseline fixtures, tests, and hard-gate scripts
- added an initial migration file and CI workflow skeleton

## First vertical slice completed
- implemented the first deterministic telemetry fixture adapter under `packages/adapters/`
- added shared ingestion orchestration under `packages/ingestion/`
- added real Postgres/PostGIS-backed persistence under `packages/persistence/`
- added a worker ingestion runtime path and minimal API endpoints for health, fixture ingest, and replay query
- added a minimal web replay verification page under `apps/web/`
- upgraded integration coverage from SQL smoke assertions to executable PostGIS-backed migrations, writes, replay queries, and browser e2e verification
- added an adapter completeness hard gate covering valid, malformed, duplicate, delayed, and boundary fixtures

## Prioritized backlog

### Foundation
1. add replay/state rebuild verification jobs against persisted event history
2. expand source health persistence beyond baseline source status and audit logs
3. add structured request logging and metrics export around API and worker entrypoints
4. define the role-permission matrix in code once the first authenticated endpoints land

### Backend
1. add explicit source, object, and alert query endpoints from the planned backend surface
2. add state rebuild verification from canonical history to materialized latest state
3. add deterministic alert persistence and evidence linkage
4. add health and metrics detail for ingest lag, source freshness, and replay diagnostics

### Frontend
1. replace the debug replay page with the planned app shell, map container, and inspector shell
2. implement explicit live vs replay mode separation across the fuller UI
3. connect latest-state queries and basic object rendering
4. add timeline controls and replay-mode playback UI beyond the current debug verifier

### Ingestion
1. add first-class source health tracking for last seen, success, failure, and lag
2. add a second planned source type only after the first adapter path remains stable
3. add fixture-driven out-of-order and duplicate regression coverage at larger batch sizes
4. add retry/idempotency handling for external pull or push sources beyond local fixtures

### Replay and timeline
1. add playback chunk assembly and replay session serialization beyond the current direct query response
2. add golden incident fixtures covering delayed arrival, duplicate suppression, and alert evidence chains
3. add path reconstruction and snapshot verification against replay fixtures
4. add rebuild-from-history verification against materialized latest state

### Testing and quality
1. add alert evidence-chain tests once alerting exists
2. add security denial tests when auth and role checks land
3. add broader end-to-end coverage for live vs replay mode separation
4. add nightly performance checks once the runtime path grows beyond the current fixture slice

## Known blockers
- the current web app is a deterministic replay verifier, not yet the planned map-first operations UI
- auth, roles, and security denial coverage are still pending because this slice intentionally stayed pre-auth
- alert generation and evidence-chain persistence are still pending, so replay currently reflects source observations only
- source health metrics are still minimal and do not yet expose the full lag/failure model planned in the docs

## Geospatial Replay UI (Phase 4)
- implemented Leaflet map viewer in web app with object markers and track polylines
- added replay timeline controls (play, pause, step, reset, scrub)
- added layer toggles for tracked objects and tracks
- added object inspection panel showing ID, type, event, position, velocity, status
- integration tests for replay rendering behavior with deterministic verification
- e2e tests covering map display, timeline controls, and layer toggles

## Live Multi-Source Monitoring (Phase 3)
- second adapter (camera observation) in packages/adapters/
- source health/status tracking with persistence
- new API endpoints for camera ingestion, source health, and latest state
- camera observation adapter unit tests
- source health integration tests

## Live Delivery and Operator Live-Mode UI (Phase 4)
- SSE live event delivery in API (/live/events endpoint)
- live event bus for publishing object state updates
- live/replay mode switch in web UI
- source health panel in web UI
- latest state synchronization on connect

## Alerting, Evidence Chain, and Operator Workflow (Phase 5)
- alert rules engine with 4 rules (object stale, source error, source disconnected, low speed)
- alert evaluation during event ingestion
- alert persistence to PostgreSQL (with acknowledged_at columns)
- alert API endpoints (GET /alerts, GET /alerts/:id, PATCH /alerts/:id)
- alert filtering by status and severity
- evidence chain via evidence_event_ids and evidence_object_ids
- web UI alert list and detail panel
- 69 unit/integration tests (4 new alert rule tests + 7 new alert API tests)

## Resilience and Reconnect (Phase 6)
- sequence tracking in live event bus for backfill support
- connection info event sent on SSE connect
- since_sequence parameter for backfill on reconnect
- reconnect with exponential backoff (max 5 attempts)
- connection status display in web UI
- latest-state bootstrap on initial connect
- resync on reconnect
- 78 unit/integration tests (9 new live resilience tests)

## Authentication, Roles, and Operator Actions (Phase 7)
- auth package with role model (viewer, operator, admin)
- /auth/login endpoint with token-based authentication
- authorization checks on ingest and alert endpoints
- audit logging for alert status changes
- 11 new auth unit tests

## Deployment and Observability (Phase 8)
- config package with validation
- structured logging package
- health and readiness endpoints
- startup config validation
- Dockerfile for containerization
- operational docs (local run, validation, startup/shutdown, recovery)

## UI Authorization and Operator Workflow (Phase 9)
- login/session handling in web app
- role-aware UI (viewer/operator/admin)
- session UI showing authenticated user and role
- auth token persistence in localStorage
- permission-gated alert close controls
- 8 new e2e authorization tests
- 3 new integration role tests

## Evidence Investigation and Replay Jump (Phase 10)
- alert detail panel with evidence display
- jump to replay from alert (auto-fills time window and object_id)
- back button to return to alert list
- close alert from detail panel
- evidence chain visibility (triggering events, related objects, rule)
- 6 new e2e investigation tests
- 1 new integration evidence test

## Auth Hardening and Session Lifecycle (Phase 11)
- token expiration (30 minutes) in auth service
- `/auth/validate` endpoint for frontend token validation
- token validation on page load in frontend
- handleUnauthorized for consistent 401/403 handling
- 5 new auth unit tests (expiration)
- 2 new integration tests (/auth/validate)
- 4 new e2e session lifecycle tests

## First Release Finalization (Phase 12)
- acknowledge action in UI (operator can acknowledge open alerts)
- detailed evidence display (clickable event IDs show full event data)
- multi-object replay dropdown from alert (select which object to replay)
- /events/:id endpoint for event detail retrieval
- loading states for alerts and sources
- error and empty states
- .env.example file created
- secrets leakage check (none found)
- 2 new e2e tests (acknowledge flow, multi-object replay)
- README.md, RELEASE_NOTES_v1.md, ARCHITECTURE_OVERVIEW.md, DEMO_GUIDE.md created


## Cesium Globe Migration (Phase 13)
- replaced Leaflet with CesiumJS 3D globe viewer
- migrated object visualization to Cesium entities (ellipses)
- migrated track polylines to Cesium polylines
- preserved live mode with SSE updates
- added click-to-live-view UI foundation (placeholder)
- updated HTML, CSS, and JavaScript for Cesium
- added 6 new e2e tests for Cesium functionality
- created docs/plans/13_CESIUM_GLOBE_MIGRATION_PROGRESS.md

## MORDOR Tactical UI Redesign (Phase 14)
- redesigned UI to tactical operations center aesthetic (dark, CRT/HUD style)
- rebranded as MORDOR (tactical operations system)
- created circular/masked central Cesium viewport
- built left data-layers rail with 8 layers:
  - Live Flights (✅ real data)
  - Military Flights (🚧 coming soon)
  - Earthquakes 24h (🚧 not available)
  - Satellites (🚧 not available)
  - Street Traffic (🚧 not available)
  - Weather Radar (🚧 not available)
  - CCTV Mesh (⚠️ snapshot only)
  - Bikeshare (🚧 not available)
- built right visual-controls rail with:
  - style presets (CRT/NVG/FLIR/Clean)
  - visual effect sliders (bloom, sharpen, pixelate, distortion, instability)
  - view mode toggles (HUD, layout, detect, panoptic)
- created tactical header with system status and time
- created bottom control bar with replay controls and alerts strip
- added CCTV panel with truthful placeholder (no fake video)
- preserved all existing workflows: live, replay, alerts, auth, investigation
- added comprehensive e2e tests (20+ tests for tactical UI)
- added integration tests for shell structure
- created docs/plans/14_MORDOR_TACTICAL_UI_PROGRESS.md

## Real Data Layer Expansion (Phase 15)
- implemented external data layer package with typed adapters
- USGS Earthquake Adapter (✅ real): fetches M2.5+ earthquakes from USGS GeoJSON feed
- CelesTrak Satellite Adapter (✅ real): fetches TLE data and propagates satellite positions
- NOAA Weather Adapter (⚠️ degraded): provides weather alerts and radar station data
- CityBikes Bikeshare Adapter (✅ real): fetches station availability from multiple cities
- Street Traffic Adapter (⚠️ degraded): placeholder with API key requirement documentation
- Military Flights Adapter (❌ unavailable): explicitly marked as unavailable with honest explanation
- created database migration (0002_external_data_layers.sql) for caching layer
- extended persistence gateway with external data methods
- added API endpoints: /layers, /layers/:id, /layers/:id/data, /layers/:id/refresh
- updated left rail UI to show real/degraded/unavailable status with provider names
- implemented Cesium globe rendering for all real data layers:
  - Earthquakes: magnitude-based colored circles with magnitude labels
  - Satellites: colored points by type (ISS, Starlink, GEO, LEO) with altitude
  - Weather: alert markers by severity with popup data
  - Bikeshare: availability-colored station markers
- each layer explicitly marked as real/degraded/unavailable (truthfulness rule)
- added unit tests for all adapters (USGS, CelesTrak, military flights, cache)
- added integration tests for external data persistence
- added e2e tests for layer UI and toggle behavior
- created docs/plans/15_REAL_DATA_LAYER_EXPANSION_PROGRESS.md

## Incident Playback and Correlation Timeline (Phase 16)
- incident model with severity, status, AOI geometry, chapters, and links
- database migration (0003_incidents.sql) for incidents, chapters, and links tables
- incident API endpoints: list, create, detail, update, timeline, chapters, links
- incident persistence methods for CRUD and timeline correlation
- incident panel UI with title, severity, status, time display
- Before/During/After section controls with marker counts
- incident playback controls: play/pause/scrubber/speed presets (0.5x-10x)
- correlation timeline rendering with layer markers on Cesium globe:
  - alert markers (red triangles)
  - earthquake markers (magnitude-colored circles)
  - weather markers (severity-colored diamonds)
  - satellite markers (type-colored squares)
  - traffic markers (severity-colored hexagons)
  - bikeshare markers (availability-colored circles)
- chapter markers with click-to-jump functionality
- linked alerts display in incident panel with severity colors
- alert-to-incident linking via "Link to Incident" button
- globe focus integration (camera flies to incident AOI)
- comprehensive E2E tests (25+ test cases)
- added DOM lib to tsconfig.json for Playwright type safety
- created docs/plans/16_INCIDENT_PLAYBACK_AND_CORRELATION_TIMELINE_PROGRESS.md

## Incident Capture and Evidence Freeze (Phase 17)
- capture job model with id, incident, source, status, timestamps, snapshots, freeze status
- database migration (0004_capture_jobs.sql) for capture_jobs, capture_snapshots, evidence_freeze tables
- capture job API endpoints: create, list, detail, start, run, complete, freeze
- source snapshotting for 9 sources: flights, earthquakes, satellites, weather, bikeshare, traffic, cctv, alerts, events
- evidence freeze functionality with automatic status tracking
- tactical UI capture panel in incident section with:
  - capture job list with status indicators
  - evidence list with frozen status
  - add capture job modal with source selection
- integration tests for capture persistence (11 test cases)
- E2E tests for capture workflow (18 test cases)
- unit tests for capture models (13 test cases)
- created docs/plans/17_INCIDENT_CAPTURE_AND_EVIDENCE_FREEZE_PROGRESS.md

## Inferred Intelligence Layers (Phase 18)
- inferred intelligence contracts with explicit types, confidence, evidence
- database migration (0005_inferred_intelligence.sql) for:
  - inferred_events with geometry (AOI)
  - degradation_zones for nav degradation heatmap
  - route_redirections for deviation events
  - holding_patterns for circular flight patterns
  - heatmap_grid_cells for visualization
  - inference_incident_links for linking to incidents
- inference API endpoints: list, create, detail, update, timeline, link-incident
- detection functions:
  - detectNavigationDegradation - GPS/signal degradation detection
  - detectRouteRedirection - route deviation detection
  - detectHoldingPattern - circular flight pattern detection
  - detectAbsenceSignal - activity thinning/blackout detection
- Cesium globe rendering for inference markers and polygons
- UI integration with layer toggles (degradation, redirection, holding, absence)
- confidence and evidence display in inference list
- click-to-fly to inference locations
- incident timeline integration with inferred markers
- unit tests for inference models (13 test cases)
- unit tests for inference logic (27 test cases)
- integration tests for inference API (15 test cases)
- E2E tests for inferred layer workflow (17 test cases)
- created docs/plans/18_INFERRED_INTELLIGENCE_LAYERS_PROGRESS.md

