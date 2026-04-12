# Chrona Twin - Geospatial Digital Twin Platform

A browser-based geospatial digital twin for live monitoring, deterministic replay, alerting, evidence capture, external data overlays, and SWAN advisory intelligence.

## Overview

Chrona Twin is a TypeScript modular monolith with three runtime entrypoints:

- `apps/api`: Node HTTP API and SSE server
- `apps/web`: static server for the Cesium tactical UI
- `apps/worker`: fixture-oriented ingestion worker

The project goal is to give operators a single environment for:

- ingesting telemetry and camera observations into canonical event history
- monitoring live or replayed object state on a globe-first tactical shell
- investigating alerts and incidents with evidence-linked workflows
- layering external signals such as flights, weather, earthquakes, traffic, satellites, and bikeshare
- adding bounded SWAN advisory context without mutating source-of-truth data

## Features

- Live monitoring over SSE-backed state feeds
- Deterministic replay with timeline controls and `state_after_event` snapshots
- Alert generation and operator workflows
- Incident capture, evidence freeze, and investigation flows
- External data layers and source-registry APIs
- SWAN advisory sessions, findings, and artifact projections

## Quick Start

### Prerequisites

- Node.js 24.x
- npm 11+
- PostgreSQL 14+ with PostGIS extension

### Setup

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Copy local environment defaults:
   ```bash
   cp .env.example .env
   ```
3. Set `DATABASE_URL` in `.env`.
4. Run the fast checks or full validation:
   ```bash
   npm run validate
   ```

### Running the Application

API server on `http://127.0.0.1:3000`:

```bash
npm run api:dev
```

Web server on `http://127.0.0.1:3001`:

```bash
npm run web:dev
```

Fixture worker:

```bash
WORKER_INPUT_FILE=./packages/test-fixtures/fixtures/adapters/fixture-telemetry/valid.request.json \
DATABASE_URL="$DATABASE_URL" \
npm run worker:fixture
```

## Demo Credentials

| Role | Username | Password |
|------|----------|----------|
| Viewer | `viewer` | `viewer123` |
| Operator | `operator` | `operator123` |
| Admin | `admin` | `admin123` |

## Architecture

```text
apps/
├── api/          # Node HTTP API server with SSE live events
├── web/          # Static server for the tactical Cesium UI
└── worker/       # Fixture-oriented ingestion worker

packages/
├── adapters/      # Ingestion adapters
├── alerts/        # Alert rules engine
├── analytics/     # Analytical helpers
├── auth/          # Authentication service
├── config/        # Configuration management
├── contracts/     # Shared schemas and models
├── domain/        # Deterministic state projection
├── external-data/ # External layer adapters and cache helpers
├── ingestion/     # Ingestion orchestration
├── live-world/    # Live snapshot cache
├── logging/       # Structured logging
├── persistence/   # PostgreSQL/PostGIS gateway
├── replay/        # Replay query logic
├── swan/          # Advisory intelligence workflow
└── test-fixtures/ # Golden fixtures
```

See [docs/ARCHITECTURE_OVERVIEW.md](docs/ARCHITECTURE_OVERVIEW.md) for the current runtime topology and data flows.

## Key API Areas

### Ingestion

- `POST /ingest/fixture-telemetry`
- `POST /ingest/camera-observation`

### State and Replay

- `POST /replay/query`
- `GET /state/latest`
- `GET /state/tracks/:objectId`
- `GET /live/events`

### Alerts and Events

- `GET /alerts`
- `GET /alerts/:id`
- `PATCH /alerts/:id`
- `GET /events/:id`

### Incidents, Sources, and Intelligence

- `GET/POST /incidents`
- `GET/POST /incidents/:id/capture-jobs`
- `GET /incidents/:id/evidence`
- `GET /sources`
- `GET /sources/nearest-to-point`
- `GET /sources/linked/:targetType/:targetId`
- `GET /layers`
- `GET /inferences`
- `GET/POST/DELETE /swan/session`

### Authentication

- `POST /auth/login`
- `POST /auth/validate`
- `POST /auth/logout`

## Testing

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run validate
```

Note: integration and e2e suites rely on `testcontainers`, so they need a working container runtime.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `API_PORT` | API server port | `3000` |
| `WEB_PORT` | Web server port | `3001` |
| `API_BASE_URL` | Web app API origin | `http://127.0.0.1:3000` |
| `LOG_LEVEL` | Logging level | `info` |
| `AUTH_ENABLED` | Enable authentication | `true` |
| `NODE_ENV` | Environment | `development` |

## License

Proprietary - All rights reserved
