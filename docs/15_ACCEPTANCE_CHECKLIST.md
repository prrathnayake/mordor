# Acceptance Checklist

## MVP acceptance
The product is not accepted until every section below passes.

## Product
- [ ] one operating domain chosen
- [ ] MVP scope frozen
- [ ] non-goals documented

## Contracts
- [ ] canonical event schema versioned
- [ ] source schema versioned
- [ ] alert schema versioned
- [ ] migrations versioned

## Ingestion
- [ ] first adapter implemented
- [ ] raw payloads stored
- [ ] malformed payloads quarantined
- [ ] source health visible
- [ ] dedupe logic tested

## Backend
- [ ] canonical events persisted
- [ ] latest state materialized
- [ ] state rebuild job works
- [ ] audit logs exist
- [ ] health endpoints work

## Frontend
- [ ] world scene loads
- [ ] live objects render
- [ ] object inspector works
- [ ] live vs replay visually distinct
- [ ] errors are visible

## Replay
- [ ] time window query works
- [ ] deterministic replay confirmed
- [ ] fixture incident replay passes
- [ ] path reconstruction visible

## Alerts
- [ ] at least two deterministic alert rules work
- [ ] evidence chains visible
- [ ] alert lifecycle tested

## Security
- [ ] role checks enforced
- [ ] sensitive actions audited
- [ ] source secrets protected

## Testing
- [ ] unit tests pass
- [ ] contract tests pass
- [ ] integration tests pass
- [ ] replay tests pass
- [ ] e2e tests pass
- [ ] security tests pass

## Release readiness
- [ ] docs aligned with code
- [ ] ADRs recorded where needed
- [ ] CI gates enforced
- [ ] rollback notes available
