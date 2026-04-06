# Implementation Plan

## Delivery approach
Build in controlled phases.  
Do not start multiple major subsystems at once.

## Phase 0: Project framing
### Goals
- choose one operating domain
- freeze MVP scope
- define canonical event contract
- define tech stack
- define hard gates
- create repo skeleton

### Exit criteria
- docs starter pack approved
- ADR 0001 created
- repo skeleton exists
- CI skeleton exists
- basic contract files exist

## Phase 1: Foundational contracts
### Build
- canonical event schema
- tracked object schema
- source schema
- alert schema
- migration baseline
- test fixture format
- basic validation library

### Exit criteria
- schema validation tests pass
- migration applies cleanly
- fixture loader works
- contract tests run in CI

## Phase 2: Backend core
### Build
- API skeleton
- DB access layer
- source registry
- canonical event write path
- latest state materialization
- basic health endpoints

### Exit criteria
- canonical event persists via test endpoint
- latest state updates correctly
- event-to-state traceability confirmed
- structured logs visible

## Phase 3: First source adapter
### Build
- one simple telemetry adapter
- raw payload storage
- normalization mapper
- dedupe logic
- source health tracking

### Exit criteria
- valid payloads produce canonical events
- malformed payloads quarantine correctly
- duplicates are handled per spec
- adapter fixtures pass

## Phase 4: Frontend shell
### Build
- app shell
- map or globe view
- layer panel
- object inspector
- live object rendering from API state

### Exit criteria
- user can load scene
- user can see object markers
- user can inspect one object
- error states render correctly

## Phase 5: Realtime updates
### Build
- stream gateway
- client subscription
- live state refresh path
- reconnect and rehydrate logic

### Exit criteria
- object moves live in UI
- reconnect recovers state
- stale source state visible
- stream tests pass

## Phase 6: Replay engine
### Build
- replay query endpoint
- ordered event retrieval
- timeline UI
- playback controls
- path reconstruction

### Exit criteria
- chosen fixture incident replays correctly
- repeated replay runs match expected output
- live/replay mode separation clear
- replay tests pass

## Phase 7: Alerting
### Build
- deterministic rules
- alert persistence
- evidence linkage
- alert UI drawer

### Exit criteria
- at least 2 alert types work
- evidence chain visible end-to-end
- alert lifecycle tests pass

## Phase 8: Hardening
### Build
- auth and role checks
- performance tests
- observability dashboards
- rebuild-from-events job
- export support

### Exit criteria
- security checks pass
- replay rebuild verification passes
- load tests within target
- docs updated

## Phase 9: Controlled AI additions
### Build
- summary generation
- operator explanation assistant
- incident summary generator

### Exit criteria
- AI outputs clearly labeled
- AI never alters canonical history
- prompt / output tests pass
- fallback behavior defined

## Suggested weekly sequencing
### Week 1
- docs
- repo
- CI
- schemas
- baseline tests

### Week 2
- db
- API core
- canonical writes

### Week 3
- first adapter
- raw payload capture
- latest state

### Week 4
- frontend shell
- object rendering
- inspector

### Week 5
- realtime
- reconnect
- source health

### Week 6
- replay engine
- timeline
- replay fixtures

### Week 7
- alerting
- evidence chain

### Week 8
- security
- hardening
- performance
- release review

## Mandatory outputs per phase
Every phase must produce:
- code
- tests
- updated docs
- review checklist
- explicit exit evidence

## Scope control rules
A phase is not complete because the UI “looks okay”.
A phase is complete only when exit criteria and tests are satisfied.

## Kill-switch rules
Pause feature work if any of these occur:
- canonical contract churn without review
- replay inconsistency
- silent ingestion drops
- source adapter hacks bypassing contracts
- major docs drift
