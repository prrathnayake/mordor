# Chrona Twin - Project Documentation

This directory contains comprehensive documentation for the Chrona Twin geospatial digital twin platform.

## Quick Start

If you're new to the project, start with these documents:

1. **[README.md](../README.md)** - Main project README with quick start guide
2. **[API_SERVER.md](API_SERVER.md)** - API server architecture and endpoints

## Core Services

| Document | Description |
|----------|-------------|
| [API_SERVER.md](API_SERVER.md) | HTTP server, routing, authentication, endpoints |
| [CAPTURE_SERVICE.md](CAPTURE_SERVICE.md) | Evidence capture jobs and snapshots |
| [INFERENCE_SERVICE.md](INFERENCE_SERVICE.md) | AI/ML-derived pattern detection |
| [LIVE_EVENT_BUS.md](LIVE_EVENT_BUS.md) | Real-time event streaming (SSE) |

## Domain Logic

| Document | Description |
|----------|-------------|
| [DOMAIN_OBJECT_STATE_PROJECTOR.md](DOMAIN_OBJECT_STATE_PROJECTOR.md) | Event-to-state transformation logic |

## Data Layer

| Document | Description |
|----------|-------------|
| [PERSISTENCE_LAYER.md](PERSISTENCE_LAYER.md) | PostgreSQL/PostGIS persistence API |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | Database tables, indexes, relationships |
| [EXTERNAL_DATA_ADAPTERS.md](EXTERNAL_DATA_ADAPTERS.md) | External API integrations |

## Operational Docs

See the root-level docs folder for operational guides:

| Document | Description |
|----------|-------------|
| [docs/OPS_STARTUP_SHUTDOWN.md](../docs/OPS_STARTUP_SHUTDOWN.md) | Starting and stopping the system |
| [docs/OPS_LOCAL_RUN.md](../docs/OPS_LOCAL_RUN.md) | Local development setup |
| [docs/OPS_VALIDATION.md](../docs/OPS_VALIDATION.md) | Validation and testing |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Chrona Twin Platform                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │  Web UI     │    │   API       │    │   Worker    │                 │
│  │  (React)    │◄──►│   Server    │    │   (Batch)   │                 │
│  │  Port 3001  │    │   Port 3000 │    │             │                 │
│  └─────────────┘    └──────┬──────┘    └─────────────┘                 │
│                            │                                            │
│         ┌──────────────────┼──────────────────┐                        │
│         │                  │                  │                        │
│  ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐               │
│  │ Live Event  │    │ Persistence │    │  External   │               │
│  │    Bus      │    │  (PostGIS)  │    │    Data     │               │
│  │   (SSE)     │    │              │    │  Adapters   │               │
│  └─────────────┘    └─────────────┘    └─────────────┘               │
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │
│  │   Domain    │    │  Ingestion  │    │   Alerts    │               │
│  │   Logic     │    │   Service   │    │   Engine    │               │
│  └─────────────┘    └─────────────┘    └─────────────┘               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Package Structure

```
packages/
├── alerts/         - Alert rules engine
├── auth/           - Authentication & authorization
├── config/         - Configuration management
├── contracts/      - Input validation schemas
├── domain/         - Core domain logic (state projection)
├── external-data/  - External API adapters
├── ingestion/      - Data ingestion orchestration
├── logging/        - Structured logging
├── persistence/    - PostgreSQL/PostGIS gateway
├── replay/         - Historical replay queries
└── test-fixtures/  - Test data utilities
```

## API Reference

Key API endpoints:

### Ingestion
- `POST /ingest/fixture-telemetry` - GPS telemetry
- `POST /ingest/camera-observation` - Camera observations

### State & Replay
- `POST /replay/query` - Historical query
- `GET /state/latest` - Current object states
- `GET /live/events` - SSE real-time stream

### Incidents
- `GET/POST /incidents` - List/create incidents
- `GET/POST /incidents/:id/capture-jobs` - Evidence capture
- `POST /capture-jobs/:id/freeze` - Freeze evidence

### External Data
- `GET /layers` - List data layers
- `GET /layers/:id/data` - Get layer events
- `POST /layers/:id/refresh` - Refresh from source

### Alerts
- `GET /alerts` - List alerts
- `PATCH /alerts/:id` - Update status (operator+)

## Authentication

Token-based authentication with 30-minute expiration:

```bash
# Login
POST /auth/login
{ "username": "operator", "password": "operator123" }

# Response
{ "token": "eyJ...", "user": { "user_id": "...", "role": "operator" } }

# Use token
curl -H "Authorization: Bearer eyJ..." ...
```

Roles: `viewer` (read), `operator` (read+write), `admin` (full)

## Testing

```bash
# Unit tests
npm run test:unit

# E2E tests  
npm run test:e2e

# Full validation
npm run validate
```