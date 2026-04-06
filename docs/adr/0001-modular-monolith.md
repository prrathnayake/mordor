# ADR 0001: Modular Monolith Baseline

## Status
Accepted

## Date
2026-04-05

## Context
The repo starter pack requires a modular monolith first and explicitly warns against beginning with microservices. The repository had no recorded ADRs yet, but bootstrap day 1 requires ADR 0001.

## Decision
The project will begin as a modular monolith with explicit internal boundaries:
- `apps/` for runtime entrypoints
- `packages/` for contracts and bounded domain logic
- `infra/` for migrations, CI, and environment scaffolding
- `tests/` for contract, unit, integration, replay, security, and e2e coverage

## Options considered
1. modular monolith
2. early microservices split
3. single unstructured application package

## Why this option
It matches the system architecture document, keeps local development simple, reduces operational overhead, and preserves a clean path to later service extraction.

## Consequences
### Positive
- easier contract enforcement and replay verification
- simpler local development and CI setup
- lower risk of premature service-boundary mistakes

### Negative
- package boundaries must be policed in-repo
- later service extraction will still require explicit boundary discipline

## Contracts affected
- repository layout
- package import boundaries
- CI and hard-gate structure

## Replay impact
Positive. Replay logic stays centralized in a dedicated package instead of being duplicated across services.

## Security impact
Positive. Security and audit logic can be implemented once and reused across API and worker entrypoints.

## Test impact
- add architecture-boundary checks
- keep replay tests isolated from UI code
- keep contracts testable without networked services

## Rollback plan
If this decision proves inadequate, create a superseding ADR that defines the new service boundaries, migration plan, and contract compatibility strategy before moving code.
