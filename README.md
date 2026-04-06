# Chrona Twin - Geospatial Digital Twin Platform

A browser-based, time-aware digital twin platform for live monitoring and deterministic replay of campus monitoring data.

## Overview

Chrona Twin provides real-time object tracking, alert generation, and historical replay capabilities for campus monitoring scenarios. The platform combines live event streaming with deterministic replay to enable operators to investigate incidents and understand system behavior.

## Features

- **Live Monitoring**: Real-time object tracking via SSE event stream
- **Deterministic Replay**: Historical replay with timeline controls
- **Alert System**: Automatic alert generation for anomalies (object stale, source errors, low speed)
- **Evidence Investigation**: Detailed alert views with event data and replay jump
- **Role-based Access**: Viewer, Operator, and Admin roles with appropriate permissions
- **Session Management**: Token-based authentication with 30-minute expiration

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+ with PostGIS extension
- npm

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your database connection:
   ```
   DATABASE_URL=postgres://postgres:password@localhost:5432/chrona
   ```

4. Run the validation suite:
   ```bash
   npm run validate
   ```

### Running the Application

**API Server** (Terminal 1):
```bash
npm run api:dev
```

**Web Server** (Terminal 2):
```bash
npm run web:dev
```

Open `http://127.0.0.1:3001` in your browser.

### Demo Credentials

| Role    | Username | Password    |
|---------|----------|-------------|
| Viewer  | viewer   | viewer123   |
| Operator| operator | operator123|
| Admin   | admin    | admin123    |

## Architecture

```
apps/
├── api/          # REST API server with SSE live events
├── web/          # Frontend web application
├── worker/       # Background worker for batch ingestion
└── migrations/   # Database migrations

packages/
├── adapters/      # Data ingestion adapters
├── alerts/        # Alert rules engine
├── auth/          # Authentication service
├── config/        # Configuration management
├── contracts/     # Input validation
├── domain/        # Core domain logic
├── ingestion/     # Ingestion orchestration
├── logging/       # Structured logging
├── persistence/   # PostgreSQL/PostGIS persistence
├── replay/        # Replay query logic
└── test-fixtures/ # Test data fixtures
```

## API Endpoints

### Ingestion
- `POST /ingest/fixture-telemetry` - Ingest GPS telemetry
- `POST /ingest/camera-observation` - Ingest camera observations

### State & Replay
- `POST /replay/query` - Query historical events
- `GET /state/latest` - Get latest object states
- `GET /live/events` - SSE live event stream

### Alerts
- `GET /alerts` - List alerts
- `GET /alerts/:id` - Get alert details
- `PATCH /alerts/:id` - Update alert status

### Events
- `GET /events/:id` - Get event details

### Authentication
- `POST /auth/login` - Login and get token
- `POST /auth/validate` - Validate token

## Testing

```bash
# Unit and integration tests
npm run test:unit

# E2E tests
npm run test:e2e

# Full validation
npm run validate
```

## Configuration

| Variable       | Description                  | Default         |
|----------------|------------------------------|-----------------|
| DATABASE_URL   | PostgreSQL connection string | Required        |
| API_PORT       | API server port              | 3000            |
| WEB_PORT       | Web server port              | 3001            |
| LOG_LEVEL      | Logging level                | info            |
| AUTH_ENABLED   | Enable authentication        | true            |
| NODE_ENV       | Environment                  | development     |

## License

Proprietary - All rights reserved
