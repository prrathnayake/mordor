# MORDOR - Tactical Operations Center

Docker deployment support for the MORDOR tactical operations platform.

## Quick Start

```bash
# Start all services
docker compose -f infra/compose/docker-compose.yml up -d

# View logs
docker compose -f infra/compose/docker-compose.yml logs -f

# Stop all services
docker compose -f infra/compose/docker-compose.yml down
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| redis | 6379 | Live world cache for globe snapshots and tracks |
| postgres | 5432 | PostgreSQL/PostGIS database |
| api | 3000 | REST API server |
| web | 3001 | Tactical UI (Cesium-based) |
| worker | - | Background data processing |
| agent-collector | - | Agent data collection |
| agent-detector | - | Anomaly detection agent |
| agent-publisher | - | Publishing agent |

## Accessing the Application

- Tactical UI: <http://localhost:3001>
- API Health: <http://localhost:3000/health>
- API Docs: <http://localhost:3000/>

## Database

The PostgreSQL container automatically runs migrations from `infra/migrations/` on first start.

## Development

For local development without Docker:

```bash
npm ci
npm run api:dev
npm run web:dev
```

## Environment Variables

Copy `infra/compose/docker.env.example` to `.env` and configure:

- `DATABASE_URL` - PostgreSQL connection string
- External API keys for data sources (optional)

## Layout

- `docker-compose.yml`: local multi-service stack
- `docker.env.example`: compose-specific environment defaults
- `worker-input.json`: sample worker payload mounted by the worker service
