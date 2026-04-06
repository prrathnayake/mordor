# System Architecture

## Architectural style
Use a **modular monolith first**, with clean internal boundaries and event-driven edges.
Do not begin with microservices.

Reason:
- lower operational complexity
- easier local development
- tighter contract enforcement
- simpler transactional guarantees
- faster MVP iteration

The system should be structured so it can later split into services if needed.

## High-level components
1. **Frontend client**
   - web UI
   - 2D/3D map or globe renderer
   - timeline controls
   - layer controls
   - object inspector panels
   - alert feed
   - realtime subscription client

2. **API service**
   - auth and session handling
   - source management
   - object queries
   - timeline queries
   - alert queries
   - admin endpoints
   - contract validation

3. **Ingestion workers**
   - poll or subscribe to external feeds
   - validate source payloads
   - normalize to canonical events
   - write to durable store
   - emit streaming updates

4. **Processing engine**
   - deduplication
   - correlation
   - rule evaluation
   - enrichment
   - derived state materialization

5. **Event store**
   - append-only canonical event storage

6. **State store**
   - latest known object state
   - derived object summaries
   - active alert state

7. **Object storage**
   - snapshots, exports, images, attachments

8. **Realtime gateway**
   - websocket or server-sent events
   - client subscriptions by layer, viewport, and filter

9. **Observability layer**
   - structured logs
   - metrics
   - traces
   - ingest lag
   - replay correctness diagnostics

## Context boundaries
### A. Source integration context
Responsible for:
- source registration
- source health
- raw payload capture
- adapter execution

### B. Canonical event context
Responsible for:
- canonical schemas
- validation
- versioning
- event persistence

### C. World state context
Responsible for:
- latest object state
- object indexing
- layer views
- spatial materializations

### D. Timeline / replay context
Responsible for:
- ordered event retrieval
- scrubbing
- animation windows
- time slicing
- deterministic playback

### E. Alerting / analytics context
Responsible for:
- rule execution
- anomaly detection boundaries
- alert life cycle
- evidence linkage

### F. Admin / security context
Responsible for:
- users
- roles
- source credentials
- audit logs
- compliance controls

## Data flow
### Live flow
1. source payload arrives
2. raw payload validated and logged
3. adapter normalizes payload
4. canonical event persisted
5. latest object state updated
6. alert rules evaluated
7. realtime update emitted
8. UI updates visible objects

### Replay flow
1. user selects time window
2. API retrieves ordered canonical events
3. optional enrichment events are joined
4. playback stream is assembled
5. frontend timeline replays events deterministically

### Investigation flow
1. analyst selects object, region, or incident
2. API resolves related entities and alerts
3. event history is fetched
4. frontend displays timeline, spatial path, and evidence chain

## Recommended runtime topology
### Development
- one backend app
- one worker process
- one database
- one cache / broker
- one frontend app

### Production starter
- frontend app
- api app
- worker pool
- postgres with spatial extensions
- redis or equivalent broker / cache
- object storage
- observability stack

## Storage pattern
Use:
- **append-only canonical event table**
- **latest state materialized table**
- **derived alert tables**
- **source raw payload capture**
- **schema versioned migrations**

Do not rely only on in-memory state.

## Event-driven rules
- ingestion may be asynchronous
- canonical event write is the authoritative point of history
- streaming is a side effect, not the source of truth
- replay always reads from durable history

## Failure boundaries
### Source failure
One source adapter failure must not stop other sources.

### Normalization failure
Bad payloads must be quarantined with error metadata.

### Streaming failure
Clients may miss transient live updates; they must always be able to rehydrate from API state.

### Replay failure
Replay bugs are severe because they undermine trust. Replay logic must be deterministic and fixture-tested.

## Extension rules
New source types must:
- define source contract
- define normalization mapping
- define canonical object/event impact
- define tests
- define error strategy
- define replay compatibility

## Architectural invariants
These are non-negotiable:
1. Every live update becomes a canonical event or a quarantined failure record.
2. History is append-only.
3. Replay reads durable events, not cached live state.
4. Every alert links to evidence.
5. Schema changes are versioned.
6. AI outputs never overwrite raw truth.
7. External source data is tagged with provenance.
8. Time semantics are explicit.
