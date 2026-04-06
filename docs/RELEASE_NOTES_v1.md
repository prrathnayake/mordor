# Release Notes - v1.0.0 RC1

## Release Date
2026-04-05

## Version
v1.0.0 RC1 (Release Candidate 1)

## Overview

This is the first release candidate for the Chrona Twin geospatial digital twin platform. This release provides core functionality for live monitoring, deterministic replay, and alert investigation.

## What's New

### Core Features

1. **Live Monitoring**
   - Real-time object tracking via Server-Sent Events (SSE)
   - Auto-reconnect with exponential backoff
   - Connection status indicator

2. **Deterministic Replay**
   - Historical event replay with timeline controls (play, pause, step, reset)
   - Object state visualization on map
   - Track polylines showing movement history
   - Multi-object query support

3. **Alert System**
   - Automatic alert generation for:
     - Object stale detection
     - Source errors
     - Source disconnection
     - Low speed warnings
   - Alert status management (open → acknowledged → closed)
   - Evidence chain linking to triggering events and objects

4. **Evidence Investigation**
   - Alert detail panel with full event data
   - Jump to replay from alert (auto-fills time window and object)
   - Event detail view showing position, velocity, source
   - Multi-object alert replay with object selector

5. **Authentication & Authorization**
   - Token-based authentication
   - Role-based access (viewer, operator, admin)
   - Session persistence across page reloads
   - Token expiration (30 minutes)

### User Experience

1. **Loading & Error States**
   - Loading indicators for alerts, sources
   - Error messages with retry options
   - Empty state messages

2. **Connection Status**
   - Clear visual indicator of connection state
   - Reconnecting progress display

3. **Alert Workflow**
   - Acknowledge and close actions for operators
   - Status badges on alert list items
   - Filtered by open status by default

## Technical Changes

### Backend
- Added `/events/:id` endpoint for event detail retrieval
- Added `/auth/validate` endpoint for token validation
- Enhanced alert filtering to support multiple statuses
- Token expiration logic with 30-minute TTL

### Frontend
- Session validation on page load
- `handleUnauthorized()` for consistent 401/403 handling
- Event detail modal for evidence investigation
- Multi-object dropdown for alert replay

### Database
- Alert status supports comma-separated filtering (e.g., `status=open,acknowledged`)

## Test Coverage

- **Unit Tests**: 113 tests passing
- **E2E Tests**: 
  - Login and session persistence
  - Alert acknowledge flow
  - Multi-object replay
  - Invalid token handling

## Known Limitations

- Mock authentication (no LDAP/SSO integration)
- No user management UI (direct database edits required)
- Limited to campus monitoring domain
- Single map view (no multi-floor/facility support)

## Breaking Changes

None - this is the first release candidate.

## Upgrade Notes

This is a fresh installation. No upgrade path required.

## Bug Fixes

- Session now persists correctly across page reloads
- Invalid tokens are cleared on page load
- Alert status filtering now supports multiple statuses

## Contributors

This release was developed as part of the Chrona Twin project.
