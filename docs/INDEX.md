# Chrona Twin Documentation Index

Use this index for the current runtime shape of the repo. Some numbered planning docs still describe target-state architecture; prefer the documents below when you need the codebase as it exists now.

## Start Here

1. [README.md](../README.md)
2. [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md)
3. [OPS_LOCAL_RUN.md](OPS_LOCAL_RUN.md)
4. [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)

## Runtime and Architecture

| Document | Description |
|----------|-------------|
| [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) | Current project goal, runtime topology, package boundaries, and data flows |
| [API_SERVER.md](API_SERVER.md) | API process responsibilities and endpoint families |
| [LIVE_EVENT_BUS.md](LIVE_EVENT_BUS.md) | SSE event stream contract and live event fanout |
| [CAPTURE_SERVICE.md](CAPTURE_SERVICE.md) | Capture-job and evidence-freeze workflow |
| [INFERENCE_SERVICE.md](INFERENCE_SERVICE.md) | Inferred-intelligence generation path |

## Persistence and Domain

| Document | Description |
|----------|-------------|
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | Migration-driven schema overview |
| [PERSISTENCE_LAYER.md](PERSISTENCE_LAYER.md) | Persistence gateway behavior |
| [DOMAIN_OBJECT_STATE_PROJECTOR.md](DOMAIN_OBJECT_STATE_PROJECTOR.md) | Deterministic event-to-state projection |
| [EXTERNAL_DATA_ADAPTERS.md](EXTERNAL_DATA_ADAPTERS.md) | External layer adapter behavior |

## Ops and Validation

| Document | Description |
|----------|-------------|
| [OPS_LOCAL_RUN.md](OPS_LOCAL_RUN.md) | Local startup commands, ports, and environment variables |
| [OPS_STARTUP_SHUTDOWN.md](OPS_STARTUP_SHUTDOWN.md) | Runtime startup/shutdown guide |
| [OPS_VALIDATION.md](OPS_VALIDATION.md) | Verification workflow |
| [OPS_RECOVERY.md](OPS_RECOVERY.md) | Recovery and troubleshooting guidance |
| [runbooks/SWAN_PROTOCOL.md](runbooks/SWAN_PROTOCOL.md) | SWAN operational and debugging runbook |

## Planning Material

The numbered docs in `docs/00_*` through `docs/17_*` and the progress files under `docs/plans/` are still useful for roadmap context, but they are not always the source of truth for current implementation details.
