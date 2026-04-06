# ADR 0003: Initial Technology Baseline

## Status
Accepted

## Date
2026-04-05

## Context
Phase 0 requires the tech stack to be defined. The repository previously had no executable tooling or runtime baseline.

## Decision
Use a TypeScript-first repository baseline with:
- root-level Node.js tooling
- TypeScript for contracts, deterministic core helpers, tests, and gate scripts
- Vitest for baseline automated tests
- Biome for formatting and lint checks
- PostgreSQL plus PostGIS as the documented production-aligned database target

`apps/web`, `apps/api`, and `apps/worker` remain empty runtime shells in this pass. The first executable code is limited to contracts, replay ordering, latest-state projection, migrations, fixtures, and hard-gate scripts.

## Options considered
1. TypeScript-first baseline at the repo root
2. mixed-language bootstrap with separate frontend and backend toolchains on day 1
3. no typed runtime baseline until after the API scaffold

## Why this option
It creates one fast feedback loop for the contract-first work required in phases 0 and 1 while keeping future app scaffolds aligned with the planned architecture.

## Consequences
### Positive
- fast setup for validators, tests, and CI
- shared language for contracts and replay helpers
- low ceremony for early hard-gate scripts

### Negative
- frontend and backend runtime frameworks are not selected beyond the TypeScript baseline in this pass
- database-backed integration execution is still pending

## Contracts affected
- repo tooling scripts
- test harness configuration
- migration and contract validation workflow

## Replay impact
Positive. Deterministic ordering code and fixtures can be implemented immediately.

## Security impact
Neutral in this pass. Security enforcement code is still pending, but CI and contract tooling are established.

## Test impact
- add root validation commands
- add unit, contract, replay, and migration smoke tests

## Rollback plan
If a different runtime/tooling stack is later required, record a superseding ADR and migrate package by package without changing canonical contracts or replay semantics implicitly.
