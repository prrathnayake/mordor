# MORDOR - Tactical Operations Center

Docker deployment for the MORDOR tactical operations platform.

## Quick Start

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down
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

- **Tactical UI**: http://localhost:8080
- **API Health**: http://localhost:3001/health
- **API Docs**: http://localhost:3001/

## Database

The PostgreSQL container automatically runs migrations from `infra/migrations/` on first start.

## Development

For local development without Docker:

```bash
npm install
npm run api:dev    # Start API on port 3001
npm run web:dev    # Start web server on port 8080
```

## Environment Variables

Copy `docker.env.example` to `.env` and configure:

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT token signing
- External API keys for data sources (optional)
