export interface LiveEvent {
  type: "object_state_update" | "source_health_update" | "connection_info";
  timestamp: string;
  sequence?: number;
  payload: unknown;
}

export interface ConnectionInfoEvent extends LiveEvent {
  type: "connection_info";
  payload: {
    client_id: string;
    server_sequence: number;
    server_time: string;
  };
}

export interface ObjectStateUpdate extends LiveEvent {
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

export interface SourceHealthUpdate extends LiveEvent {
  type: "source_health_update";
  payload: {
    source_id: string;
    status: "active" | "inactive" | "stale" | "error";
    last_seen_at: string;
    error_message: string | null;
  };
}

type LiveEventListener = (event: LiveEvent) => void;

class LiveEventBus {
  private listeners: Set<LiveEventListener> = new Set();
  private sequence: number = 0;
  private recentEvents: Map<number, LiveEvent> = new Map();
  private maxRecentEvents = 1000;

  subscribe(listener: LiveEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: LiveEvent): void {
    this.sequence++;
    event.sequence = this.sequence;
    event.timestamp = new Date().toISOString();

    this.recentEvents.set(this.sequence, event);
    if (this.recentEvents.size > this.maxRecentEvents) {
      const oldestKey = this.recentEvents.keys().next().value;
      if (oldestKey !== undefined) {
        this.recentEvents.delete(oldestKey);
      }
    }

    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    });
  }

  getSequence(): number {
    return this.sequence;
  }

  getRecentEvents(sinceSequence: number): LiveEvent[] {
    const events: LiveEvent[] = [];
    for (let i = sinceSequence + 1; i <= this.sequence; i++) {
      const event = this.recentEvents.get(i);
      if (event) {
        events.push(event);
      }
    }
    return events;
  }

  getConnectionInfo(): ConnectionInfoEvent {
    const now = new Date().toISOString();
    return {
      type: "connection_info",
      timestamp: now,
      sequence: this.sequence,
      payload: {
        client_id: "",
        server_sequence: this.sequence,
        server_time: now,
      },
    };
  }
}

export const liveEventBus = new LiveEventBus();
