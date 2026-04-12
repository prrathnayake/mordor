import type { SwanFinding, SwanSession, SwanThread } from "../../contracts/src/index.js";

export interface SwanSessionUpdateLiveEvent {
  type: "swan_session_update";
  timestamp: string;
  payload: {
    session_id: string;
    status: SwanSession["status"];
    last_activity_at: string;
    last_projection_at: string | null;
    active_thread_count: number;
  };
}

export interface SwanThreadUpdateLiveEvent {
  type: "swan_thread_update";
  timestamp: string;
  payload: {
    session_id: string;
    thread_id: string;
    recipe: SwanThread["recipe"];
    status: SwanThread["status"];
    target_type: SwanThread["target_type"];
    target_id: string | null;
    updated_at: string;
    error_message: string | null;
  };
}

export interface SwanProjectionUpdateLiveEvent {
  type: "swan_projection_update";
  timestamp: string;
  payload: {
    session_id: string;
    projection: "session" | "panels" | "map" | "notifications" | "thread";
    artifact_key: string;
    generated_at: string;
  };
}

export interface SwanNotificationLiveEvent {
  type: "swan_notification";
  timestamp: string;
  payload: {
    session_id: string;
    notification: {
      finding_id: string;
      target_type: SwanFinding["target_type"];
      target_id: string;
      title: string;
      summary: string;
      verification_status: SwanFinding["verification_status"];
      generated_at: string;
    };
  };
}

export type SwanLiveEvent =
  | SwanSessionUpdateLiveEvent
  | SwanThreadUpdateLiveEvent
  | SwanProjectionUpdateLiveEvent
  | SwanNotificationLiveEvent;
