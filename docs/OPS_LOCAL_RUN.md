# Local Run Instructions

## Prerequisites

- Node.js 24.x
- npm 11+
- PostgreSQL 15+ with PostGIS extension
- a working container runtime if you want to run integration or e2e suites through `testcontainers`

## Environment Setup

1. Set the database connection:
```bash
export DATABASE_URL="postgres://user:password@localhost:5432/chronadb"
```

2. Install dependencies:
```bash
npm ci
```

3. Copy local env defaults if needed:
```bash
cp .env.example .env
```

## Running the API Server

Default API port is `3000`:

```bash
npm run api:dev
```

Custom API port:

```bash
API_PORT=3002 npm run api:dev
```

## Running the Web Server

Default web port is `3001` and the default API target is `http://127.0.0.1:3000`:

```bash
npm run web:dev
```

Custom ports:

```bash
API_PORT=3002 WEB_PORT=3003 API_BASE_URL=http://127.0.0.1:3002 npm run web:dev
```

## Running the Fixture Worker

```bash
WORKER_INPUT_FILE=./packages/test-fixtures/fixtures/adapters/fixture-telemetry/valid.request.json \
DATABASE_URL="$DATABASE_URL" \
npm run worker:fixture
```

## Running Tests

Full verification:

```bash
npm run validate
```

Focused suites:

```bash
npm run test:unit
npm run test:contract
npm run test:integration
npm run test:replay
npm run test:e2e
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `API_PORT` | No | `3000` | API server port |
| `WEB_PORT` | No | `3001` | Web server port |
| `API_BASE_URL` | No | `http://127.0.0.1:3000` | Browser app target for API requests |
| `LOG_LEVEL` | No | `info` | Logging level |
| `AUTH_ENABLED` | No | `true` | Enable authentication |
| `NODE_ENV` | No | `development` | Runtime environment |
