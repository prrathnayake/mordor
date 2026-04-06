# Resilience and Reconnect Progress

## Date
2026-04-05

## Phase
Resilience and Reconnect (Phase 6)

## Scope implemented
- Sequence tracking in live event bus for backfill support
- Connection info event sent on SSE connect
- Since_sequence parameter for backfill on reconnect
- Reconnect with exponential backoff (max 5 attempts)
- Connection status display in web UI
- Latest-state bootstrap on initial connect
- Resync on reconnect

## Runtime paths now working
1. Initial connect path
   `SSE connect -> receive connection_info -> loadLatestState() -> receive state updates`
2. Reconnect path
   `SSE disconnect -> reconnect with exponential backoff -> /live/events?since_sequence=X -> backfill + new events`
3. Connection state display
   `connectToLiveEvents() -> updateConnectionStatus() -> UI shows connected/reconnecting/error`

## Notable boundaries preserved
- live event bus in apps/api/ (API concern)
- SSE endpoint handles backfill query parameter
- client-side reconnect with exponential backoff (no server-side push)
- no recovery shortcuts that bypass persistence

## Current limitations by design
- max 1000 events kept in recent events buffer
- max 5 reconnect attempts before giving up
- no persistent client ID (each connect is fresh)
- backfill only for recent events within buffer

## Exit evidence
- TypeScript typecheck passes
- biome lint passes (clean, no warnings)
- all gate checks pass
- 78 unit/integration tests pass (9 new live resilience tests)
- 8 e2e tests pass

## Live resilience tests added
- tracks sequence numbers for events
- stores recent events for backfill
- retrieves events after a given sequence
- provides connection info with sequence
- handles multiple publishes with increasing sequence
- returns empty array when no events since sequence
- accepts since_sequence parameter
- sends connection info on connect
- provides backfill for missed events

## Files changed in this phase
- apps/api/src/live-event-bus.ts - Sequence tracking, backfill support, connection info
- apps/api/src/server.ts - Since_sequence parameter handling in /live/events
- apps/web/public/app.js - Reconnect logic, exponential backoff, connection state
- apps/web/public/index.html - Connection status panel
- apps/web/public/styles.css - Connection status styles
- tests/integration/live-resilience.spec.ts - Live resilience integration tests (new)
