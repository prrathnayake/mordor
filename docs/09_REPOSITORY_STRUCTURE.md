# Repository Structure

## Goal

Keep the monorepo easy to scan from the root, keep bounded contexts obvious, and prevent operational artifacts from blurring into product code.

## Current top-level layout

```text
project-root/
  apps/             Runtime entrypoints only
  packages/         Shared bounded-context code
  infra/            Compose, container, migration, and deployment support
  tests/            Automated test suites and helpers
  docs/             Current docs, plans, ADRs, and runbooks
  scripts/          Repository gates and maintenance checks
  runtime/          Ignored runtime scratch state
  .codex_memories/  Repo-local task memory for Codex work
  README.md         Human-friendly starting point
```

## Folder responsibilities

### `apps/`

Keep app folders thin. They should own process setup, wiring, and transport concerns.

- `apps/api`: HTTP, SSE, auth, and orchestration endpoints
- `apps/web`: static asset hosting for the tactical UI
- `apps/worker`: fixture-oriented ingestion and background entrypoints

### `packages/`

Place reusable, cross-entrypoint logic here. Each package should represent a bounded concern.

- domain and data contracts: `contracts`, `domain`, `replay`, `persistence`
- runtime services: `ingestion`, `alerts`, `auth`, `logging`, `live-world`, `swan`
- integrations: `adapters`, `external-data`
- support assets: `config`, `analytics`, `test-fixtures`, `ui-components`

### `infra/`

Collect environment and deployment support files away from the repo root.

- `infra/compose`: Docker Compose stack, compose env example, and worker sample payload
- `infra/docker`: Docker build definitions
- `infra/migrations`: ordered Postgres/PostGIS migrations
- `infra/monitoring`, `infra/ci`: reserved infrastructure support lanes

### `tests/`

Mirror how the system is verified, not how the source is implemented.

- `unit`, `contract`, `integration`, `replay`, `e2e`
- `helpers` for shared harness utilities
- `manual/outputs` for screenshots, dumps, and ad hoc debugging artifacts only

### `docs/`

Use topical folders for current-state documentation.

- `architecture/` for runtime and subsystem behavior
- `runbooks/` for local-run and recovery workflows
- `tests/` for validation process docs
- `plans/` for progress and roadmap material
- `adr/` for durable architectural decisions

Legacy numbered docs remain in `docs/` root because repo gates still require them.

## Placement rules

- Keep only repo-wide entrypoints and config at the root.
- Put deploy and runtime support under `infra/`, not beside `package.json`.
- Keep ignored runtime output in `runtime/` or `tests/manual/outputs/`, never in source folders.
- Prefer moving reusable logic from `apps/` into `packages/` once it stops being process-specific.
- Treat `packages/test-fixtures` as the canonical home for reusable JSON fixtures.

## Dependency rules

- Packages must not depend on app entrypoints.
- Production packages must not depend on `tests/`.
- Core packages must not depend on `packages/ui-components`.
- Frontend code must not depend directly on adapter implementations.

## Non-negotiables

1. Test fixtures are first-class assets.
2. Docs should move with structural changes.
3. Contracts stay lightweight and stable.
4. Runtime artifacts must not drift back into the root.
