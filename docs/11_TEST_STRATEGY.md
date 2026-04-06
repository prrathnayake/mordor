# Test Strategy

## Goal
Create a test system strong enough to keep a vibe-coded codebase aligned with architecture and contracts.

## Testing philosophy
We are not testing only for bugs.  
We are testing for:
- architecture drift
- contract drift
- replay drift
- source adapter drift
- security regressions
- false confidence from UI-only progress

## Test layers
### 1. Unit tests
Validate:
- pure functions
- mappers
- ordering logic
- dedupe logic
- rule evaluation
- validation helpers

### 2. Contract tests
Validate:
- canonical event schema
- public API schemas
- adapter input/output contracts
- version compatibility

### 3. Integration tests
Validate:
- API to DB flow
- ingestion to canonical write flow
- canonical write to latest state flow
- alert rule execution
- replay query assembly

### 4. Replay tests
Special category.
Validate:
- deterministic ordering
- incident reconstruction correctness
- snapshot sequences
- same fixture => same replay result

### 5. End-to-end tests
Validate:
- user loads UI
- sees objects
- receives live updates
- enters replay mode
- inspects alert evidence
- handles reconnect

### 6. Performance tests
Validate:
- ingest throughput
- replay window latency
- websocket fanout behavior
- frontend render tolerance

### 7. Security tests
Validate:
- access control
- forbidden endpoint denial
- export restrictions
- secret leakage prevention
- malformed payload handling

## Required test assets
### Golden fixtures
Create golden fixtures for:
- canonical events
- latest state derivation
- replay incident sequences
- alert trigger scenarios

### Snapshot references
Allow snapshot testing only for:
- deterministic replay outputs
- stable contract schemas
- selected UI evidence panels

Do not overuse UI snapshots as a substitute for logic tests.

## Must-test functions
- timestamp ordering comparator
- canonical event validator
- source adapter normalizers
- dedupe key generation
- latest state projector
- replay chunk builder
- alert evidence linker
- permission checks

## Replay test design
Replay tests should include:
- clean ordered data
- delayed arrival data
- duplicate events
- missing intervals
- mixed source timestamps
- evidence-rich incident cases

## Example hard replay case
Fixture:
- vehicle enters zone
- source duplicates one event
- camera observation arrives late
- alert rule triggers
- replay still shows stable evidence order

Expected assertions:
- alert opens once
- replay path order is deterministic
- duplicate suppression is explainable
- evidence list contains correct event ids

## Coverage expectations
Coverage target is not enough by itself, but set minimums:
- domain logic high coverage
- adapters high branch coverage
- replay engine very high coverage
- critical security and permission checks complete

## CI categories
Run in CI:
- fast unit + contract on every push
- integration on every PR
- replay + e2e on protected branches
- performance nightly or before release
- security regularly and before release

## Test review rules
No feature is considered done without:
- direct tests
- regression tests if bug fixed
- fixture updates where relevant
- documentation updates if behavior changes

## Anti-patterns
Do not allow:
- manual testing as sole proof
- UI screenshots as correctness evidence
- hidden adapter assumptions
- skipping replay tests because “live works”
- AI-generated tests without human review

## Non-negotiables
1. Every source adapter has fixtures.
2. Replay has golden incident tests.
3. Alerts have evidence-chain tests.
4. Access control has denial tests.
5. Build fails on contract drift.
