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
| postgres | 5432 | PostgreSQL database |
| api | 3001 | REST API server |
| web | 8080 | Tactical UI (Cesium-based) |
| worker | - | Background data processing |

## Accessing the Application

- Tactical UI: <http://localhost:8080>
- API Health: <http://localhost:3001/health>
- API Docs: <http://localhost:3001/>

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
- `JWT_SECRET` - Secret for JWT token signing
- External API keys for data sources (optional)

## Layout

- `docker-compose.yml`: local multi-service stack
- `docker.env.example`: compose-specific environment defaults
- `worker-input.json`: sample worker payload mounted by the worker service
