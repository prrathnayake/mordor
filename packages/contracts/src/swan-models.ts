export const SWAN_ACTIVITY_TYPES = [
  "object_selected",
  "alert_opened",
  "incident_opened",
  "mode_switched",
  "replay_query_submitted",
  "layer_toggled",
  "map_selection_changed",
  "zoom_level_changed",
  "widget_interacted",
  "data_threshold_crossed",
  "geofence_entered",
  "time_window_elapsed",
  "session_enabled",
  "session_disabled",
  "session_restored",
  "auth_changed",
] as const;

export const SWAN_TARGET_TYPES = [
  "object",
  "alert",
  "incident",
  "mode",
  "replay_window",
  "layer",
  "session",
  "map_selection",
  "system",
  "unknown",
] as const;

export const SWAN_THREAD_RECIPES = [
  "context",
  "verify",
  "research",
  "watch",
  "window_watch",
  "layer_watch",
] as const;

export const SWAN_THREAD_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export const SWAN_SESSION_STATUSES = ["active", "disabled", "expired"] as const;

export const SWAN_FINDING_VERIFICATION_STATUSES = [
  "unverified",
  "single_source",
  "cross_checked",
  "trusted_source",
] as const;

export const SWAN_PROJECTION_TARGETS = ["panel", "map", "notification"] as const;

export const SWAN_ARTIFACT_PROJECTIONS = [
  "session",
  "panels",
  "map",
  "notifications",
  "zoom",
] as const;

export type SwanActivityType = (typeof SWAN_ACTIVITY_TYPES)[number];
export type SwanTargetType = (typeof SWAN_TARGET_TYPES)[number];
export type SwanThreadRecipe = (typeof SWAN_THREAD_RECIPES)[number];
export type SwanThreadStatus = (typeof SWAN_THREAD_STATUSES)[number];
export type SwanSessionStatus = (typeof SWAN_SESSION_STATUSES)[number];
export type SwanFindingVerificationStatus = (typeof SWAN_FINDING_VERIFICATION_STATUSES)[number];
export type SwanProjectionTarget = (typeof SWAN_PROJECTION_TARGETS)[number];
export type SwanArtifactProjectionType = (typeof SWAN_ARTIFACT_PROJECTIONS)[number];

export interface SwanSession {
  schema_version: string;
  session_id: string;
  client_session_id: string;
  user_id: string;
  status: SwanSessionStatus;
  current_context: Record<string, unknown>;
  last_activity_at: string;
  last_projection_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SwanActivityEvent {
  schema_version: string;
  activity_id: string;
  session_id: string;
  client_session_id: string;
  user_id: string;
  activity_type: SwanActivityType;
  target_type: SwanTargetType | null;
  target_id: string | null;
  route: string | null;
  mode: "live" | "replay" | null;
  activity_key: string;
  context: Record<string, unknown>;
  occurred_at: string;
}

export interface SwanThread {
  schema_version: string;
  thread_id: string;
  session_id: string;
  recipe: SwanThreadRecipe;
  target_type: SwanTargetType | null;
  target_id: string | null;
  status: SwanThreadStatus;
  priority: number;
  dedupe_key: string;
  is_recurring: boolean;
  recurrence_interval_ms: number | null;
  run_count: number;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  error_message: string | null;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SwanMediaReference {
  media_type: "image" | "video";
  url: string;
  thumbnail_url: string | null;
  title: string | null;
}

export interface SwanFinding {
  schema_version: string;
  finding_id: string;
  session_id: string;
  thread_id: string;
  provider: string;
  target_type: SwanTargetType;
  target_id: string;
  finding_kind: string;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  verification_status: SwanFindingVerificationStatus;
  confidence: number;
  projection_targets: SwanProjectionTarget[];
  source_urls: string[];
  media: SwanMediaReference[];
  lat: number | null;
  lon: number | null;
  generated_at: string;
  updated_at: string;
}

export interface SwanArtifact {
  session_id: string;
  artifact_key: string;
  projection: SwanArtifactProjectionType | "thread";
  file_path: string;
  checksum: string;
  generated_at: string;
}

export interface SwanMapOverlay {
  finding_id: string;
  target_type: SwanTargetType;
  target_id: string;
  kind: string;
  title: string;
  verification_status: SwanFindingVerificationStatus;
  lat: number;
  lon: number;
}

export interface SwanNotificationItem {
  finding_id: string;
  target_type: SwanTargetType;
  target_id: string;
  title: string;
  summary: string;
  verification_status: SwanFindingVerificationStatus;
  generated_at: string;
}

export interface SwanArtifactProjection {
  schema_version: string;
  session_id: string;
  projection: SwanArtifactProjectionType;
  generated_at: string;
  data:
    | {
        session: SwanSession | null;
        thread_counts: Record<string, number>;
      }
    | {
        objects: Record<string, SwanFinding[]>;
        alerts: Record<string, SwanFinding[]>;
        incidents: Record<string, SwanFinding[]>;
      }
    | {
        overlays: SwanMapOverlay[];
      }
    | {
        unread_count: number;
        items: SwanNotificationItem[];
      }
    | {
        zoom_findings: SwanFinding[];
      };
}
