# Architecture Overview

## System Design

Chrona Twin is a modular monolith application built with TypeScript. It follows clean architecture principles with clear package boundaries.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web Browser                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Maps UI   │  │  Timeline   │  │    Alert Panel          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTP + SSE
┌─────────────────────────────────────────────────────────────────┐
│                         API Server                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  REST API    │  │  Live SSE   │  │   Auth Middleware       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐
│  Ingestion       │  │  Persistence │  │  Live Event Bus  │
│  Adapters        │  │  Gateway     │  │                  │
└──────────────────┘  └──────────────┘  └──────────────────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
              ┌─────────────────────────────────────┐
              │     PostgreSQL + PostGIS            │
              │  - canonical_events                 │
              │  - object_states                    │
              │  - alerts                           │
              └─────────────────────────────────────┘
```

## Package Structure

### apps/api
HTTP server providing REST endpoints and SSE live event streaming.

**Responsibilities:**
- HTTP request handling
- Authentication middleware
- Alert rules evaluation
- Live event publishing

**Key Endpoints:**
- `/ingest/*` - Data ingestion
- `/replay/query` - Historical queries
- `/alerts/*` - Alert management
- `/live/events` - SSE stream

### apps/web
Static file server serving the browser application.

**Responsibilities:**
- Serve HTML/CSS/JS
- API proxy for development

### packages/adapters
Data normalization adapters for different source types.

**Adapters:**
- `fixture-telemetry` - GPS telemetry data
- `camera-observation` - Camera metadata

### packages/alerts
Alert rules engine for anomaly detection.

**Rules:**
- Object stale detection
- Source error detection
- Source disconnection detection
- Low speed warning

### packages/auth
Token-based authentication service.

**Features:**
- User authentication
- Role-based authorization
- Token validation and expiration

### packages/domain
Core domain logic for object state projection.

**Responsibilities:**
- Canonical event application to state
- Deterministic state computation

### packages/persistence
PostgreSQL/PostGIS persistence layer.

**Responsibilities:**
- Data persistence
- Query execution
- Migration management

### packages/replay
Replay query logic and state reconstruction.

**Responsibilities:**
- Event ordering
- Time window queries
- State reconstruction

## Data Flow

### Ingestion Flow

1. External system sends data to `/ingest/*`
2. Adapter validates and normalizes input
3. Canonical events are created
4. Persistence layer stores events
5. Alert rules are evaluated
6. Alerts are persisted if triggered
7. State projections are updated
8. Live event bus publishes state updates

### Live Monitoring Flow

1. Browser connects to `/live/events`
2. Server sends connection info with sequence number
3. Server sends initial latest state
4. On new events, server publishes state updates
5. Browser updates map markers

### Replay Flow

1. User selects time window and optional object filter
2. API queries canonical events
3. Events are sorted by observed_at timestamp
4. State projections are computed for each event
5. Results are returned to browser for visualization

### Alert Investigation Flow

1. User views alert list
2. User clicks alert to see details
3. Evidence events are clickable
4. User can jump to replay with pre-filled time window

## Authentication Flow

1. User submits credentials to `/auth/login`
2. Server validates against mock user store
3. Server returns JWT token (30-min expiry)
4. Browser stores token in localStorage
5. Subsequent requests include `Authorization: Bearer <token>`
6. On page reload, token is validated via `/auth/validate`
7. Invalid/expired tokens are cleared

## State Management

### Object State Projection

When events are ingested, they're applied to create object states:

```
state_n = applyCanonicalEvent(state_{n-1}, event_n)
```

This ensures deterministic replay - the same events always produce the same states.

### Live Event Bus

The live event bus maintains:
- Current sequence number
- Recent events for reconnection backfill
- Subscribers for SSE connections

## Security

- Token-based authentication with 30-minute expiration
- Role-based authorization (viewer < operator < admin)
- Operator role required for alert modifications
- No secrets stored in code

## Scalability Notes

Current design is suitable for:
- Single server deployment
- ~10,000 objects
- ~100 sources
- 1-minute event latency

For scale, consider:
- Read replicas for replay queries
- Message queue for ingestion
- CDN for static assets
