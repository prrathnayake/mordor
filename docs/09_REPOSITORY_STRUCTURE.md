# Repository Structure

## Goal
Create a repo that is easy to navigate, safe to extend, and hard to accidentally corrupt.

## Suggested top-level layout
```text
project-root/
├─ docs/
│  ├─ architecture/
│  ├─ design/
│  ├─ plans/
│  ├─ tests/
│  ├─ adr/
│  └─ runbooks/
├─ apps/
│  ├─ web/
│  ├─ api/
│  └─ worker/
├─ packages/
│  ├─ domain/
│  ├─ contracts/
│  ├─ adapters/
│  ├─ replay/
│  ├─ alerting/
│  ├─ analytics/
│  ├─ ui-components/
│  └─ test-fixtures/
├─ infra/
│  ├─ docker/
│  ├─ compose/
│  ├─ migrations/
│  ├─ monitoring/
│  └─ ci/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ contract/
│  ├─ replay/
│  ├─ e2e/
│  ├─ performance/
│  └─ security/
├─ scripts/
├─ .github/
└─ README.md
```

## Responsibilities by area
### `docs/`
The source of truth for architecture and process.
No implementation should merge if docs are materially outdated.

### `apps/web`
Frontend application only.

### `apps/api`
HTTP API, auth, admin endpoints, query assembly.

### `apps/worker`
Background ingestion and processing entrypoints.

### `packages/domain`
Canonical models, business rules, invariants.

### `packages/contracts`
Schemas, API models, canonical event definitions, validators.

### `packages/adapters`
Source adapter implementations, one folder per source type.

### `packages/replay`
Replay ordering, window assembly, playback serialization.

### `packages/alerting`
Rules, evidence linking, alert lifecycle.

### `packages/analytics`
Derived logic, summaries, ML boundaries if added later.

### `packages/test-fixtures`
Golden datasets, replay incident fixtures, adapter samples.

## Repo rules
- no circular dependencies between domain packages
- contracts package must remain lightweight and stable
- adapters cannot directly mutate frontend concerns
- replay logic must not depend on UI code
- tests mirror production boundaries

## Suggested docs layout
```text
docs/
├─ architecture/
│  ├─ system-overview.md
│  ├─ domain-model.md
│  ├─ data-flow.md
├─ design/
│  ├─ frontend.md
│  ├─ backend.md
│  ├─ alerting.md
├─ plans/
│  ├─ implementation-plan.md
│  ├─ bootstrap-tasks.md
├─ tests/
│  ├─ strategy.md
│  ├─ hard-gates.md
├─ adr/
│  ├─ 0001-modular-monolith.md
└─ runbooks/
   ├─ source-onboarding.md
   ├─ incident-replay.md
```

## Code ownership guidance
Assign clear ownership for:
- domain contracts
- adapter layer
- replay engine
- frontend scene and timeline
- security and auth
- CI and hard gates

## Branch policy
- protected main branch
- required tests
- required review
- required docs check
- required contract compatibility checks

## Non-negotiables
1. Test fixtures are first-class assets.
2. Docs live with code.
3. Contracts are versioned.
4. Replay fixtures must be easy to locate and run.
