# Backend Design

## Backend goals
The backend is responsible for:
- durable history
- clean contracts
- safe normalization
- consistent queries
- deterministic replay assembly
- observability
- security

## Service boundaries
### API layer
Handles:
- auth
- request validation
- object queries
- replay queries
- alert queries
- source admin
- health endpoints

### Ingestion layer
Handles:
- pulling or receiving source payloads
- raw payload persistence
- normalization
- canonical event writes

### Processing layer
Handles:
- dedupe decisions
- derived event generation
- latest state updates
- rule evaluation
- enrichment

### Streaming layer
Handles:
- live subscriptions
- filter-aware event fanout
- reconnect semantics
- heartbeat

## Suggested module structure
- `api/`
- `domain/`
- `ingestion/`
- `processing/`
- `replay/`
- `streaming/`
- `security/`
- `observability/`
- `db/`

## API design rules
- all inputs validated
- all outputs versioned if public
- no source-specific raw payloads in public APIs unless explicitly requested
- replay endpoints must be explicit about ordering and timestamps
- admin endpoints separated from operator endpoints

## Core endpoints
### Sources
- `GET /sources`
- `POST /sources`
- `GET /sources/{id}`
- `GET /sources/{id}/health`

### Objects
- `GET /objects`
- `GET /objects/{id}`
- `GET /objects/{id}/events`
- `GET /objects/{id}/track`

### Replay
- `POST /replay/query`
- `GET /replay/session/{id}`
- `GET /timeline/window`

### Alerts
- `GET /alerts`
- `GET /alerts/{id}`
- `POST /alerts/{id}/ack`

### Health
- `GET /health`
- `GET /metrics`

## Source adapter contract
Every adapter must implement:
- source config schema
- connection / poll logic
- raw payload parser
- normalization mapper
- error classification
- health reporting
- test fixture coverage

## Canonical write pipeline
1. validate source payload envelope
2. persist raw payload reference
3. map to canonical event(s)
4. validate canonical event schema
5. persist canonical event(s)
6. update latest state materialization
7. run rule engine
8. emit stream update
9. write structured audit log

## Replay assembly
Replay service must:
- fetch time-windowed events
- enforce deterministic ordering
- optionally group by object
- serialize suitable playback chunks
- allow pagination or chunking for large windows

## State rebuilding
A maintenance job must be able to:
- rebuild latest state from event history
- validate materialized state consistency
- report divergence

This is critical for trust.

## Alert engine
### MVP rule style
Start with deterministic rules:
- zone enter / exit
- inactivity
- route deviation
- after-hours activity
- source silence thresholds

Do not begin with black-box AI anomaly detection as the core alert engine.

### Alert requirements
- versioned rule definitions
- evidence linkage
- idempotent re-evaluation strategy
- clear lifecycle transitions

## Realtime streaming
Recommended semantics:
- topic or filter-based subscriptions
- heartbeat messages
- reconnect token or time cursor
- ability to resync from last known event id or timestamp

## Database expectations
Need support for:
- append-only event tables
- spatial indexing
- temporal queries
- audit logs
- versioned migrations
- partition strategy when scale grows

## Logging rules
Every major backend action should log:
- request or event trace id
- source or actor
- operation
- duration
- result
- schema version
- error type when failed

## Backend invariants
1. Raw payload capture must occur before destructive transforms.
2. Canonical schema validation must happen before persistence.
3. Latest state must be traceable to canonical events.
4. Replay must be deterministic under test fixtures.
5. Alert generation must be reproducible from event history.

## Swan backend design
Swan v1 runs inside the API process as a lightweight scheduler, not a separate service. The backend responsibilities added by Swan are:
- manage opt-in Swan sessions keyed by authenticated user plus client session id
- persist semantic activity events with 2-second dedupe for identical trigger and target combinations
- schedule logical Swan threads from deterministic recipes such as `context`, `verify`, `research`, `watch`, `window_watch`, and `layer_watch`
- enforce concurrency ceilings of 5 running Swan jobs per session and 20 globally
- expire idle Swan sessions after 30 minutes and cancel work on logout, disable, or context replacement

Persistence and projection rules:
- PostgreSQL remains authoritative for Swan metadata and finding records
- artifact metadata is written to the database first
- JSON projections are then materialized atomically under `runtime/swan/<session_id>/`
- SSE publication happens last through `/live/events`

Provider boundaries:
- `app_context` reads local truth and evidence to produce trusted contextual findings
- `existing_external_layers` correlates current context with configured external layers and linked sources
- `external_research` is allowlisted and config-driven, stores metadata plus source URLs only, and never downloads full media payloads in v1

Swan findings are enrichments only. They never overwrite canonical event history, latest state, or alert truth, and they must always expose verification status plus provenance back to the caller.
