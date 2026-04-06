# Local Run Instructions

## Prerequisites
- Node.js 22+
- PostgreSQL 15+ with PostGIS extension

## Environment Setup

1. Set the DATABASE_URL environment variable:
```bash
export DATABASE_URL="postgres://user:password@localhost:5432/chronadb"
```

2. Install dependencies:
```bash
npm install
```

## Running the API Server

Start the API server on the default port (3001):
```bash
npm run start:api
```

Or with a custom port:
```bash
PORT=3002 npm run start:api
```

## Running Tests

Run the full validation suite:
```bash
npm run validate
```

Run only unit/integration tests:
```bash
npm run test:vitest
```

Run only e2e tests:
```bash
npm run test:e2e
```

## Running with Docker

Build the image:
```bash
docker build -t chrona-twin .
```

Run the container:
```bash
docker run -p 3001:3001 -e DATABASE_URL="postgres://user:password@host:5432/db" chrona-twin
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| DATABASE_URL | Yes | - | PostgreSQL connection string |
| PORT | No | 3001 | API server port |
| API_PORT | No | 3000 | Alternative API port |
| WEB_PORT | No | 3001 | Web server port |
| LOG_LEVEL | No | info | Logging level (debug, info, warn, error) |
| AUTH_ENABLED | No | true | Enable authentication |
| NODE_ENV | No | development | Environment (development, production) |
