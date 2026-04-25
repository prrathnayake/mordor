# Data Ingestion and Normalization

## Goal
Convert messy external source data into clean canonical events without losing provenance or breaking replay.

## Ingestion principles
- each source is isolated
- raw payloads are preserved
- normalization is explicit
- bad data is quarantined, not hidden
- canonical writes are auditable
- adapters are replaceable

## Source categories
Start with only a few source categories:
- telemetry feed
- camera metadata feed
- gate / access control feed
- external geospatial feed
- manual operator annotation feed

The intelligence source catalog extends this with operational source groups for
hazards, atmosphere, space weather, maritime/coastal monitoring, cyber advisories,
health events, and public live video. Point-like feeds should continue to normalize
into `external_data_events`; source/watch-wall metadata belongs in `source_registry`
or `intelligence_source_catalog`; embedded video observations belong in
`intelligence_media_observations` so incident/evidence workflows can reference the
same source without duplicating provider details.

## Adapter lifecycle
1. fetch or receive payload
2. validate source envelope
3. store raw payload
4. transform to canonical event(s)
5. validate canonical event(s)
6. write canonical events
7. update health / metrics
8. emit downstream signals

## Adapter contract
Every adapter must define:
- `adapter_name`
- `adapter_version`
- supported `source_type`
- source config schema
- raw payload schema or expectations
- normalization mapping rules
- retry rules
- error classes
- fixture set

## Raw payload storage
Persist:
- raw payload bytes or JSON
- source id
- received timestamp
- content hash
- parse status
- adapter version
- trace id

## Normalization mapping example
Example source payload:
```json
{
  "tracker_id": "veh-42",
  "lat": -33.8688,
  "lng": 151.2093,
  "speed": 13.4,
  "heading": 91.2,
  "ts": "2026-04-05T10:15:30Z"
}
```

Normalized event:
```json
{
  "event_type": "position_observed",
  "object_id": "veh_42",
  "payload": {
    "lat": -33.8688,
    "lon": 151.2093,
    "speed_mps": 13.4,
    "heading_deg": 91.2
  }
}
```

## Error classes
Define explicit classes:
- `SourceUnavailable`
- `AuthenticationFailed`
- `PayloadMalformed`
- `SchemaMismatch`
- `NormalizationFailed`
- `PersistenceFailed`
- `DownstreamDispatchFailed`

## Retry strategy
- network/transient errors: retry with backoff
- auth/config errors: do not blind retry forever
- malformed payloads: quarantine
- persistence failures: alert and retry with idempotency protection

## Idempotency
Ingestion must protect against duplicate writes.
Use:
- deterministic dedupe key
- source payload hash
- object + observed timestamp rules where appropriate

## Ordering issues
Sources may be:
- delayed
- out of order
- duplicated
- bursty

The system must not assume perfect order.
Canonical events must preserve original source observation time.

## Quarantine
Bad or ambiguous payloads must be stored with:
- source
- raw reference
- adapter version
- failure code
- failure reason
- timestamps

They must be inspectable later.

## Health monitoring
For each source track:
- last seen
- last success
- last failure
- failure rate
- ingest lag
- payload rate
- normalization error count

## Test fixture policy
Every adapter must include:
- valid fixture payloads
- malformed payloads
- duplicate payloads
- delayed / out-of-order payloads
- boundary value payloads
- expected canonical event outputs

## Ingestion invariants
1. No silent payload dropping.
2. No canonical write without schema validation.
3. No adapter merge without fixtures.
4. No adapter-specific hacks inside core domain logic.
5. No source can bypass provenance requirements.
