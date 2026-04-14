# Chrona Twin Documentation Index

Use this index for the current runtime shape of the repo. Some numbered planning docs still describe target-state architecture; prefer the topical folders below when you need the codebase as it exists now.

## Start Here

1. [README.md](../README.md)
2. [architecture/overview.md](architecture/overview.md)
3. [runbooks/local-run.md](runbooks/local-run.md)
4. [architecture/database-schema.md](architecture/database-schema.md)

## Runtime and Architecture

| Document | Description |
|----------|-------------|
| [architecture/overview.md](architecture/overview.md) | Current project goal, runtime topology, package boundaries, and data flows |
| [architecture/api-server.md](architecture/api-server.md) | API process responsibilities and endpoint families |
| [architecture/live-event-bus.md](architecture/live-event-bus.md) | SSE event stream contract and live event fanout |
| [architecture/capture-service.md](architecture/capture-service.md) | Capture-job and evidence-freeze workflow |
| [architecture/inference-service.md](architecture/inference-service.md) | Inferred-intelligence generation path |

## Persistence and Domain

| Document | Description |
|----------|-------------|
| [architecture/database-schema.md](architecture/database-schema.md) | Migration-driven schema overview |
| [architecture/persistence-layer.md](architecture/persistence-layer.md) | Persistence gateway behavior |
| [architecture/object-state-projector.md](architecture/object-state-projector.md) | Deterministic event-to-state projection |
| [architecture/external-data-adapters.md](architecture/external-data-adapters.md) | External layer adapter behavior |

## Ops and Validation

| Document | Description |
|----------|-------------|
| [runbooks/local-run.md](runbooks/local-run.md) | Local startup commands, ports, and environment variables |
| [runbooks/startup-shutdown.md](runbooks/startup-shutdown.md) | Runtime startup/shutdown guide |
| [tests/validation.md](tests/validation.md) | Verification workflow |
| [runbooks/recovery.md](runbooks/recovery.md) | Recovery and troubleshooting guidance |
| [runbooks/demo-guide.md](runbooks/demo-guide.md) | Demo workflow and operator walkthrough |
| [runbooks/SWAN_PROTOCOL.md](runbooks/SWAN_PROTOCOL.md) | SWAN operational and debugging runbook |

## Planning Material

The numbered docs in `docs/00_*` through `docs/17_*` and the progress files under `docs/plans/` are still useful for roadmap context, but they are not always the source of truth for current implementation details. Treat the topical subfolders as the primary navigation path for current-state documentation.
