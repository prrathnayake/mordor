# First Vertical Slice Progress

## Date
2026-04-05

## Scope implemented
- one deterministic telemetry fixture adapter
- raw payload capture and quarantine
- canonical event validation and persistence
- latest-state materialization
- replay query API
- minimal browser replay verification page
- real Postgres/PostGIS-backed integration tests
- **geospatial replay UI with map viewer** (this pass)

## Runtime paths now working
1. worker path
   `fixture request -> adapter -> canonical validation -> raw payload persistence -> canonical event persistence -> latest-state update`
2. API path
   `POST /ingest/fixture-telemetry -> same ingestion service -> persistence`
3. replay path
   `POST /replay/query -> persisted canonical events -> deterministic ordering -> state-after-event timeline`
4. verification UI path
   `apps/web -> replay query -> step/play controls -> current event/state display`

## Notable boundaries preserved
- adapter logic remains in `packages/adapters/`
- ingestion orchestration remains in `packages/ingestion/`
- replay assembly remains in `packages/replay/`
- DB concerns remain in `packages/persistence/`
- frontend debug rendering stays out of domain and replay packages

## Current limitations by design
- replay view is a debug verifier, not the planned scene/timeline UI
- ingest endpoint is a narrow dev/test fixture endpoint, not a general public source API
- no auth or role enforcement is implemented in this slice
- no alerting or analytics-derived events are implemented yet

## Exit evidence
- adapter completeness gate passes
- PostGIS-backed migration test passes
- worker ingestion test passes
- replay API integration test passes
- browser e2e replay test passes
- malformed input is quarantined and rejected end to end
