# Live Event Bus Documentation

The Live Event Bus (`apps/api/src/live-event-bus.ts`) implements a publish-subscribe pattern for real-time event distribution across the system.

## Overview

The Live Event Bus provides:
- Event publishing for state changes
- Subscriber management for SSE clients
- Sequence-based event history for reconnection support

## Event Types

### Object State Update

Published when any tracked object's state changes:

```typescript
interface ObjectStateUpdate extends LiveEvent {
  type: "object_state_update";
  payload: {
    object_id: string;
    state_version: string;
    as_of: string;
    position: { lat: number; lon: number } | null;
    velocity: { speed_mps: number | null; heading_deg: number | null } | null;
    status: string | null;
    last_event_id: string;
  };
}
```

### Source Health Update

Published when source health status changes:

```typescript
interface SourceHealthUpdate extends LiveEvent {
  type: "source_health_update";
  payload: {
    source_id: string;
    status: "active" | "inactive" | "stale" | "error";
    last_seen_at: string;
    error_message: string | null;
  };
}
```

### Connection Info

Sent on initial connection and periodically:

```typescript
interface ConnectionInfoEvent extends LiveEvent {
  type: "connection_info";
  payload: {
    client_id: string;
    server_sequence: number;
    server_time: string;
  };
}
```

## API Reference

### `subscribe(listener: LiveEventListener): () => void`

Subscribes to all events. Returns unsubscribe function.

```typescript
type LiveEventListener = (event: LiveEvent) => void;

const unsubscribe = liveEventBus.subscribe((event) => {
  console.log(event.type, event.timestamp);
});

// Later: unsubscribe when done
unsubscribe();
```

### `publish(event: LiveEvent): void`

Publishes an event to all subscribers. Assigns sequence number and timestamp.

```typescript
liveEventBus.publish({
  type: "object_state_update",
  timestamp: new Date().toISOString(),
  payload: { /* ... */ }
});
```

### `getRecentEvents(sinceSequence: number): LiveEvent[]`

Retrieves events since given sequence number for reconnection support.

```typescript
// Client reconnects with last seen sequence
const missed = liveEventBus.getRecentEvents(42);
// Send missed events to client
```

### `getConnectionInfo(): ConnectionInfoEvent`

Returns current server state for new connections.

## SSE Endpoint

Clients connect via `/live/events` endpoint:

```javascript
const eventSource = new EventSource('/live/events');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle event
};

// Optional: reconnect with last sequence
const es = new EventSource('/live/events?since_sequence=50');
```

## Event Flow

```
┌─────────────────┐      publish()      ┌──────────────┐
│ Ingestion      │ ──────────────────► │ LiveEventBus │
│ Service        │                     │              │
└─────────────────┘                     │  ┌────────┐  │
                                        │  │ Sub 1  │  │
┌─────────────────┐                     │  ├────────┤  │
│ Persistence    │ ──state_callback──► │  │ Sub 2  │  │
│ Gateway        │                     │  ├────────┤  │
└─────────────────┘                     │  │ Sub 3  │  │
                                        │  └────────┘  │
                                        └──────────────┘
                                                  │
                                                  ▼
                                        ┌──────────────┐
                                        │ SSE / WebSocket │
                                        │   Clients     │
                                        └──────────────┘
```

## Configuration

The event bus maintains a rolling buffer of recent events:

- **maxRecentEvents**: 1000 events (configurable in code)
- Events older than buffer are discarded
- Sequence numbers continue incrementing

## Error Handling

Listener errors are caught and ignored to prevent one subscriber from affecting others:

```typescript
this.listeners.forEach((listener) => {
  try {
    listener(event);
  } catch {
    // Ignore listener errors
  }
});
```