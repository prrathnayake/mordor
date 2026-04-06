# Hard Gates and Compliance

## Purpose
This file defines merge-blocking checks that keep the implementation strictly aligned with plan.

## Rule zero
No one merges because “it seems fine”.  
Every protected branch change must prove compliance.

## Gate categories
### Gate A: Documentation alignment
Block merge if:
- architecture-impacting code changed but docs not updated
- canonical contract changed without changelog or ADR
- new source adapter added without onboarding docs

### Gate B: Contract integrity
Block merge if:
- canonical event schema changes without version update
- fixture outputs no longer match expected schemas
- public API changes without contract review

### Gate C: Replay determinism
Block merge if:
- golden replay fixtures change unexpectedly
- ordering comparator behavior changes without explicit approval
- state rebuild from event history diverges

### Gate D: Source adapter compliance
Block merge if:
- adapter lacks valid and invalid fixtures
- adapter bypasses raw payload persistence
- adapter writes source-specific shape directly into core APIs

### Gate E: Security and authorization
Block merge if:
- new endpoint lacks access rules
- sensitive actions lack audit logging
- secret handling checks fail

### Gate F: Test floor
Block merge if:
- required test categories missing
- critical path tests skipped
- replay tests flaky beyond threshold
- contract tests fail

## Mandatory compliance checks
### 1. Architecture drift check
A scripted review that flags:
- unauthorized new cross-package imports
- domain logic implemented in UI layer
- replay logic duplicated outside replay package
- direct adapter coupling to frontend models

### 2. Contract diff check
Compares:
- canonical event schema
- API schemas
- fixture outputs
- migration versions

### 3. Replay golden check
Runs curated incident fixtures and compares:
- event sequence
- object paths
- alert evidence chains
- state snapshots

### 4. State rebuild check
Rebuild latest state from canonical event history and compare with materialized state.

### 5. Source fixture completeness check
Every adapter must show:
- valid input fixture
- malformed fixture
- duplicate fixture
- delayed or out-of-order fixture
- expected canonical outputs

### 6. Security lint and policy check
Must fail on:
- leaked secrets
- unsafe debug endpoints
- missing access decorators or policies
- export without audit hooks

## Pull request checklist
Every PR must answer:
1. Which bounded context changed?
2. Which contracts changed?
3. Which tests prove it?
4. Does replay behavior change?
5. Does security posture change?
6. Are docs updated?
7. Is an ADR needed?

## ADR trigger conditions
ADR required when:
- changing modular boundaries
- changing canonical event semantics
- changing replay ordering
- introducing AI into operational decisions
- changing storage strategy
- adding a new externally visible API pattern

## Compliance scoring idea
Each PR can report:
- doc alignment: pass/fail
- contract integrity: pass/fail
- replay integrity: pass/fail
- security integrity: pass/fail
- test completeness: pass/fail

No soft pass on protected branches.

## Non-negotiables
1. Replay drift is release-blocking.
2. Contract drift requires review.
3. New adapters must prove compliance through fixtures.
4. Security regressions block merge immediately.
