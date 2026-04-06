# ADR 0002: Canonical Event Contract Baseline

## Status
Accepted

## Date
2026-04-05

## Context
Phase 0 and bootstrap day 2 require the canonical event contract baseline to be frozen early. The docs require append-only history, replay determinism, provenance, and explicit time semantics.

## Decision
Adopt schema version `1.0.0` as the initial baseline for:
- source
- tracked object
- canonical event
- object state
- alert

The canonical event baseline includes:
- explicit `observed_at`, `ingested_at`, and `processed_at`
- provenance metadata with `adapter`, `adapter_version`, and `raw_ref`
- deterministic `dedupe_key`
- optional geospatial fields and geometry
- optional lineage links for related objects and parent events

## Options considered
1. freeze a versioned canonical contract now
2. postpone canonical contract definition until after API work
3. allow each adapter to define its own event shape first

## Why this option
It preserves the architecture-first rule, makes replay and latest-state projection testable early, and prevents source-specific shapes from leaking into core history.

## Consequences
### Positive
- shared truth anchor for validators, fixtures, and migrations
- early replay and state-materialization tests become possible
- future contract drift can be detected through versioned artifacts

### Negative
- contract evolution now requires explicit versioning and fixture maintenance
- some storage and API details must conform to the frozen baseline

## Contracts affected
- `packages/contracts/schemas/*.schema.json`
- `packages/contracts/src/*.ts`
- fixture files under `packages/test-fixtures/`
- baseline migration columns for canonical events and latest state

## Replay impact
Positive. Replay ordering can rely on the documented timestamp fields and stable identifiers.

## Security impact
Positive. Provenance and raw payload references remain mandatory for auditability.

## Test impact
- add contract validation tests
- add replay ordering tests against canonical event fixtures
- add latest-state projection tests tied to canonical events

## Rollback plan
Any semantic change to canonical event meaning must be introduced through a new schema version and a superseding ADR, with fixture and replay verification updates in the same change.
