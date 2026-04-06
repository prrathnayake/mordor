# Risk Register

## Purpose
Track risks early so they are designed around, not discovered late.

## Risk 1: Scope explosion
### Description
Trying to support too many source types and domains too early.

### Impact
High

### Mitigation
- freeze one domain
- phase-gate features
- reject unrelated “nice to have” work before MVP

## Risk 2: Replay inconsistency
### Description
Live path appears correct but replay produces different ordering or outcomes.

### Impact
Critical

### Mitigation
- replay golden fixtures
- deterministic comparator
- state rebuild tests
- ADR for replay changes

## Risk 3: Source adapter chaos
### Description
Every adapter introduces custom logic and leaks its own data model.

### Impact
High

### Mitigation
- strict adapter contract
- fixture completeness rule
- code ownership on contracts
- hard gate for source-specific leakage

## Risk 4: False confidence from UI progress
### Description
System looks impressive visually while contracts and integrity remain weak.

### Impact
High

### Mitigation
- do backend and fixtures first
- require replay and evidence before declaring progress
- protect branch with hard gates

## Risk 5: AI-generated bad code
### Description
Fast-generated code breaks boundaries, weakens tests, or invents semantics.

### Impact
High

### Mitigation
- use bounded prompts
- require explicit acceptance tests
- human review of contracts and replay logic
- keep ADR discipline

## Risk 6: Security debt
### Description
Admin and export surfaces grow faster than permission and audit controls.

### Impact
High

### Mitigation
- role matrix early
- audit log required
- security tests from early phases

## Risk 7: Performance bottlenecks
### Description
Live updates or replay windows become too heavy for the stack.

### Impact
Medium to High

### Mitigation
- viewport filtering
- chunked replay
- latest-state materialization
- performance tests before broadening scope

## Risk 8: Data privacy or compliance misstep
### Description
Sensitive location or camera data handled without correct boundaries.

### Impact
Critical

### Mitigation
- classify sources
- define retention policy
- minimize personal data
- document lawful and internal-use constraints

## Risk 9: Contract churn
### Description
Schemas keep changing during implementation.

### Impact
High

### Mitigation
- freeze MVP contracts early
- use versioning
- use ADRs for meaning changes
- run contract diff gate

## Risk 10: Weak observability
### Description
Ingest lag, dropped events, or replay divergence go unnoticed.

### Impact
High

### Mitigation
- structured logs
- health metrics
- lag metrics
- replay verification jobs
