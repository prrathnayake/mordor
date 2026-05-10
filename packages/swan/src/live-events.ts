import type { SwanFinding, SwanSession, SwanThread } from "../../contracts/src/index.js";

export type SwanTriggerEvent =
  | "object_selected"
  | "alert_opened"
  | "layer_toggled"
  | "map_selection_changed"
  | "zoom_level_changed"
  | "widget_interacted"
  | "data_threshold_crossed"
  | "geofence_entered"
  | "time_window_elapsed";

export interface SwanZoomLevelEvent {
  targetType: "zoom_level";
  targetId: string;
  context: {
    zoomLevel: number;
    centerLat: number;
    centerLon: number;
    visibleBounds: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
  };
}

export interface SwanWidgetInteractionEvent {
  targetType: "widget";
  targetId: string;
  context: {
    widgetType: "tooltip" | "info_card" | "cluster" | "badge" | "route";
    action: "hover" | "click" | "expand" | "collapse";
    layerId: string;
    entityId: string;
  };
}

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
    projection: "session" | "panels" | "map" | "notifications" | "thread" | "zoom";
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
