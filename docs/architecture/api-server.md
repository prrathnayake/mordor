# API Server Documentation

The API Server (`apps/api/src/server.ts`) is the central HTTP server that handles all client requests, authentication, and orchestrates interactions between various system components.

## Overview

The API Server is built on Node.js's native HTTP module without additional frameworks. It provides:
- RESTful API endpoints for data ingestion, state retrieval, alerts, and incidents
- Server-Sent Events (SSE) for real-time live event streaming
- Authentication and authorization middleware
- External data layer management

## Core Components

### Request Handling Pipeline

```
HTTP Request → CORS Headers → Route Matching → Auth Check → Handler → JSON Response
```

1. **CORS Middleware**: Adds appropriate `Access-Control-*` headers to all responses
2. **Route Matching**: Parses URL and HTTP method to determine handler
3. **Authentication**: Validates Bearer tokens via `validateToken()` from auth package
4. **Handler Execution**: Processes request and returns JSON response

### Key Functions

#### `createApiServer(options: ApiServerOptions): RunningApiServer`

Creates and configures the HTTP server with database connection and optional clock for testing.

```typescript
interface ApiServerOptions {
  connection_string: string;  // PostgreSQL connection string
  clock?: Clock;              // Optional clock for time-based operations
}
```

#### `refreshExternalDataLayer(layerId, persistence, logger, publishLiveEvent?)`

Fetches fresh data from external sources and persists them to the database. Supports:
- earthquakes (USGS)
- satellites (CelesTrak)
- weather (NOAA)
- bikeshare (CityBikes)
- traffic (Street Traffic)
- military (Military Flights)

### Authentication Flow

1. Client sends credentials to `/auth/login`
2. `authenticate()` validates against user database
3. Returns JWT token with 30-minute expiration
4. Subsequent requests include token in `Authorization: Bearer <token>`
5. Tokens validated via `validateToken()` on each request

### Live Event Streaming

The `/live/events` endpoint uses Server-Sent Events (SSE):

```typescript
// Client connects
GET /live/events

// Server sends events in format:
data: {"type": "object_state_update", "timestamp": "...", "payload": {...}}
```

- Supports reconnection via `since_sequence` parameter
- Accepts optional `west/south/east/north` query params for viewport-scoped external-layer
  snapshots on the live stream
- Maintains event history buffer (1000 events)
- Publishes: object state updates, source health updates, connection info, and external layer
  refresh notifications

### Ingestion Pipeline

#### Fixture Telemetry (`/ingest/fixture-telemetry`)
1. Validates input via `validateFixtureTelemetryIngestionInput()`
2. Calls `ingestFixtureTelemetryBatch()` from ingestion package
3. Evaluates events for alert generation
4. Persists alerts if conditions are met
5. Publishes state updates to live event bus

#### Camera Observations (`/ingest/camera-observation`)
1. Validates input via `validateCameraObservationIngestionInput()`
2. Calls `ingestCameraObservationBatch()` from ingestion package
3. Returns status and trace ID

### Incident Management

The API provides comprehensive incident CRUD operations:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/incidents` | GET | List incidents with filtering |
| `/incidents` | POST | Create new incident |
| `/incidents/:id` | GET | Get incident details |
| `/incidents/:id` | PATCH | Update incident |
| `/incidents/:id/timeline` | GET | Get incident timeline |
| `/incidents/:id/chapters` | GET/POST | Manage incident chapters |
| `/incidents/:id/links` | GET/POST | Link evidence to incident |
| `/incidents/:id/capture-jobs` | GET/POST | Manage capture jobs |
| `/incidents/:id/evidence` | GET | List frozen evidence |

### Capture Jobs

Capture jobs snapshot current system state for incident investigation:

```
POST /incidents/:id/capture-jobs { source_type: "flights" }
→ Returns capture_job with ID

POST /capture-jobs/:id/run
→ Executes capture based on source type
→ Creates snapshots in database

POST /capture-jobs/:id/freeze
→ Freezes snapshots as immutable evidence
```

### Alert System

- Alerts generated automatically during ingestion when anomalies detected
- Manual alert creation supported
- Status workflow: open → acknowledged → resolved
- Role-based update permissions (operator+ only)

## Error Handling

All errors return JSON with consistent structure:

```json
{
  "error": "error_code",
  "message": "Human readable message",
  "issues": ["validation issues..."] // optional
}
```

Common status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 503: Service Unavailable

## Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/health` | Basic health check |
| `/ready` | Readiness probe for orchestration |
| `/health/detailed` | Component status + metrics |
| `/metrics` | Process metrics (CPU, memory) |
| `/logs` | SSE log stream |
| `/health/sources` | Source health status |
