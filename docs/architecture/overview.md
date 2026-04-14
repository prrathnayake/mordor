# Architecture Overview

## Project Goal

Chrona Twin is a browser-based geospatial digital twin for operational monitoring. The current codebase is aimed at:

- ingesting telemetry and camera observations into a canonical event history
- serving live and replay views of object state over a tactical Cesium-based UI
- generating alerts and linking them to evidence
- supporting incident playback, capture jobs, external data overlays, and SWAN advisory intelligence

## Current Architecture

Chrona Twin is implemented as a TypeScript modular monolith. Runtime entrypoints stay in `apps/`, while domain and infrastructure concerns are pushed into `packages/`.

```text
browser (Cesium tactical UI)
  -> apps/web static server
  -> talks to apps/api over HTTP + SSE

apps/api
  -> auth/session handling
  -> ingestion endpoints
  -> replay/state queries
  -> alerts/incidents/capture/inference/source registry
  -> SWAN session/activity/artifact endpoints
  -> live event streaming via /live/events

apps/worker
  -> fixture-oriented ingestion job wrapper

packages/*
  -> adapters + contracts + domain projection
  -> ingestion orchestration
  -> persistence and migrations
  -> live-world cache integration
  -> external-data adapters
  -> replay assembly
  -> alerts and SWAN services

PostgreSQL + PostGIS
  -> canonical history, latest state, alerts, incidents, evidence, source registry,
     external layers, inferred intelligence, and SWAN tables
```

## Runtime Surfaces

### `apps/api`

The API is a Node HTTP server, not an Express app. It is the main orchestration boundary and owns:

- auth endpoints and bearer-token validation
- fixture telemetry and camera observation ingestion
- replay queries and latest-state / track endpoints
- alert CRUD-lite operations
- incident, capture-job, and evidence-freeze APIs
- external layer refresh and source registry endpoints
- inferred intelligence endpoints
- SWAN session, activity, finding, and artifact APIs
- live event fanout over SSE

### `apps/web`

The web app is a server-rendered static asset host for a tactical UI built with plain HTML/CSS/JavaScript plus Cesium. It is not currently a React app. The UI shell includes:

- live vs replay mode controls
- Cesium globe viewport
- alert and source-health panels
- external layer toggles
- incident playback and evidence controls
- inferred intelligence overlays
- SWAN toggle, status, and advisory surfaces

### `apps/worker`

The worker is currently narrow and fixture-driven. It wraps fixture telemetry ingestion against the shared ingestion and persistence packages.

## Package Boundaries

- `packages/adapters`: source normalization for fixture telemetry and camera observations
- `packages/alerts`: alert rule evaluation and identifiers
- `packages/auth`: login, token validation, and role model
- `packages/config`: env parsing and runtime defaults
- `packages/contracts`: schemas and shared model definitions
- `packages/domain`: deterministic object-state projection
- `packages/external-data`: adapters for flights, earthquakes, satellites, weather, bikeshare, and traffic
- `packages/ingestion`: validation, dedupe, quarantine, and canonical write orchestration
- `packages/live-world`: in-memory or Redis-backed live snapshot cache
- `packages/logging`: structured logger
- `packages/persistence`: Postgres/PostGIS gateway and migrations runner
- `packages/replay`: replay query validation and ordered timeline assembly
- `packages/swan`: advisory session/thread/finding/artifact workflow
- `packages/test-fixtures`: golden payloads and fixture loaders

## Core Data Flows

### Ingest to Truth

1. A client posts telemetry or camera observations to `apps/api`.
2. `packages/ingestion` validates the payload and either quarantines failures or normalizes valid records.
3. Canonical events are written append-only through `packages/persistence`.
4. `packages/domain` projects latest object state.
5. `packages/alerts` evaluates the resulting events.
6. The API emits live updates to connected clients.

### Replay

1. The browser submits a replay window.
2. `packages/replay` validates the request and reads ordered canonical events.
3. The API returns timeline items with event and `state_after_event` projections.
4. The tactical UI renders the sequence deterministically on the globe and timeline.

### Live World

1. The API optionally refreshes live-flight data and caches a snapshot through `packages/live-world`.
2. `/state/latest`, `/state/tracks/:objectId`, and `/live/events` expose either cached live data or database-backed state.
3. The web client merges live snapshots with layer and selection state.

### SWAN Advisory Lane

1. The browser enables a SWAN session and emits semantic activity.
2. `packages/swan` schedules advisory threads and persists findings/artifacts.
3. SWAN projections are stored separately from canonical truth and published through shared live channels.
4. The UI renders SWAN context as advisory overlays and notifications.

## Storage Model

Important persisted areas include:

- canonical event history: `canonical_events`
- latest materialized state: `latest_object_states`
- source metadata and health: `sources`, `source_health`, `source_registry`, `source_links`
- alert workflow: `alerts`
- incident investigation: `incidents`, `incident_chapters`, `incident_links`
- evidence capture: `capture_jobs`, `capture_snapshots`, `evidence_freeze`
- external overlays: `external_data_layers`, `external_data_events`
- inferred intelligence: `inferred_events`, `degradation_zones`, related tables
- SWAN advisory state: `swan_sessions`, `swan_activity_events`, `swan_threads`, `swan_findings`, `swan_artifacts`

## Current Defaults

- API default port: `3000`
- Web default port: `3001`
- Web-to-API default base URL: `http://127.0.0.1:3000`
- Toolchain target: Node `24.x`, npm `11+`

## Known Constraints

- Integration and e2e tests rely on `testcontainers`, so they need a working container runtime.
- The top-level docs pack contains planning material as well as current-state docs; when in doubt, prefer the runtime entrypoints plus this document and `README.md`.
