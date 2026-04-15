import type {
  SwanNotificationLiveEvent,
  SwanProjectionUpdateLiveEvent,
  SwanSessionUpdateLiveEvent,
  SwanThreadUpdateLiveEvent,
} from "../../../packages/swan/src/index.js";

export interface LiveEvent {
  type:
    | "object_state_update"
    | "source_health_update"
    | "connection_info"
    | "live_snapshot_update"
    | "external_layer_update"
    | "external_layer_snapshot_update"
    | "external_layer_delta_update"
    | "incident_intelligence_update"
    | "swan_session_update"
    | "swan_thread_update"
    | "swan_projection_update"
    | "swan_notification";
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

export interface LiveSnapshotUpdate extends LiveEvent {
  type: "live_snapshot_update";
  payload: {
    generated_at: string;
    object_count: number;
    provider: string;
    status: "real" | "degraded";
    auth_mode: "authenticated" | "anonymous";
  };
}

export interface ExternalLayerUpdate extends LiveEvent {
  type: "external_layer_update";
  payload: {
    layer_id: string;
    status: "real" | "degraded" | "unavailable";
    count: number;
    last_update: string;
    error_message: string | null;
  };
}

export interface ExternalLayerSnapshotUpdate extends LiveEvent {
  type: "external_layer_snapshot_update";
  payload: {
    layer_id: string;
    status: "real" | "degraded" | "unavailable";
    count: number;
    total_count: number;
    last_update: string;
    error_message: string | null;
    events: Array<{
      event_id: string;
      external_id: string;
      event_type: string;
      observed_at: string;
      lat: number;
      lon: number;
      altitude_m: number | null;
      payload: Record<string, unknown>;
    }>;
  };
}

export interface ExternalLayerDeltaUpdate extends LiveEvent {
  type: "external_layer_delta_update";
  payload: {
    layer_id: string;
    status: "real" | "degraded" | "unavailable";
    count: number;
    total_count: number;
    last_update: string;
    error_message: string | null;
    upserts: Array<{
      event_id: string;
      external_id: string;
      event_type: string;
      observed_at: string;
      lat: number;
      lon: number;
      altitude_m: number | null;
      payload: Record<string, unknown>;
    }>;
    removed_external_ids: string[];
  };
}

export interface IncidentIntelligenceUpdate extends LiveEvent {
  type: "incident_intelligence_update";
  payload: {
    incident_id: string;
    artifact_count: number;
    widget_count: number;
    run_count: number;
    updated_at: string;
  };
}

export type SwanSessionUpdate = SwanSessionUpdateLiveEvent & { sequence?: number };

export type SwanThreadUpdate = SwanThreadUpdateLiveEvent & { sequence?: number };

export type SwanProjectionUpdate = SwanProjectionUpdateLiveEvent & { sequence?: number };

export type SwanNotificationUpdate = SwanNotificationLiveEvent & { sequence?: number };

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
