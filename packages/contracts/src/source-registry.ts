export const SOURCE_TYPES = [
  "camera",
  "radar",
  "satellite",
  "adsb",
  "ais",
  "sensor",
  "manual",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_STATUSES = ["active", "inactive", "stale", "error", "disconnected"] as const;

export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export interface SourceCoverageGeometry {
  type: "cone" | "polygon" | "circle";
  coordinates: number[];
  heading_deg?: number;
  fov_deg?: number;
  range_m?: number;
}

export interface SourceRegistryEntry {
  source_id: string;
  source_type: SourceType;
  provider: string;
  label: string;
  lat: number | null;
  lon: number | null;
  alt_m: number | null;
  heading_deg: number | null;
  coverage: SourceCoverageGeometry | null;
  status: SourceStatus;
  last_update: string;
  snapshot_available: boolean;
  live_available: boolean;
  linked_object_ids: string[];
  linked_alert_ids: string[];
  linked_incident_ids: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SourceSnapshot {
  snapshot_id: string;
  source_id: string;
  captured_at: string;
  url: string | null;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  format: string | null;
  metadata: Record<string, unknown>;
}

export interface SourceLink {
  source_id: string;
  target_type: "object" | "alert" | "incident";
  target_id: string;
  link_type: "explicit" | "nearest";
  distance_m: number | null;
  created_at: string;
}

export interface NearestSourceResult {
  source: SourceRegistryEntry;
  distance_m: number;
  link_type: "explicit" | "nearest";
}
