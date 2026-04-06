export const CANONICAL_EVENT_TYPES = [
  "position_observed",
  "state_observed",
  "camera_observed",
  "sensor_observed",
  "source_connected",
  "source_disconnected",
  "source_error",
  "normalization_failed",
  "zone_entered",
  "zone_exited",
  "route_deviation_detected",
  "alert_opened",
  "alert_closed",
] as const;

export type CanonicalEventType = (typeof CANONICAL_EVENT_TYPES)[number];

export interface GeoJsonPoint {
  type: "Point";
  coordinates: [number, number] | [number, number, number];
}

export interface GeoJsonLineString {
  type: "LineString";
  coordinates: Array<[number, number] | [number, number, number]>;
}

export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: Array<Array<[number, number] | [number, number, number]>>;
}

export type Geometry = GeoJsonPoint | GeoJsonLineString | GeoJsonPolygon;

export interface Source {
  source_id: string;
  source_type: string;
  name: string;
  status: string;
  owner: string;
  auth_ref: string;
  polling_mode: string;
  schema_version: string;
  created_at: string;
  updated_at: string;
}

export interface TrackedObject {
  object_id: string;
  object_type: string;
  display_name: string;
  source_primary: string;
  latest_state_ref: string | null;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface EventProvenance {
  adapter: string;
  adapter_version: string;
  raw_ref: string;
  transformation_notes?: string[];
  trust_notes?: string[];
}

export interface CanonicalEvent {
  event_id: string;
  event_type: CanonicalEventType;
  object_id: string;
  source_id: string;
  observed_at: string;
  ingested_at: string;
  processed_at: string;
  schema_version: string;
  payload: Record<string, unknown>;
  provenance: EventProvenance;
  confidence: number;
  dedupe_key: string;
  geometry?: Geometry;
  altitude_m?: number | null;
  heading_deg?: number | null;
  speed_mps?: number | null;
  related_object_ids?: string[];
  parent_event_id?: string | null;
  trace_id?: string | null;
}

export interface PositionSnapshot {
  lat: number;
  lon: number;
  altitude_m?: number | null;
  geometry?: Geometry;
}

export interface VelocitySnapshot {
  speed_mps?: number | null;
  heading_deg?: number | null;
}

export interface ObjectState {
  object_id: string;
  state_version: string;
  as_of: string;
  position: PositionSnapshot | null;
  velocity: VelocitySnapshot | null;
  status: string | null;
  attributes: Record<string, unknown>;
  last_event_id: string;
}

export interface Alert {
  alert_id: string;
  rule_id: string;
  severity: string;
  status: string;
  opened_at: string;
  updated_at: string;
  closed_at: string | null;
  schema_version: string;
  evidence_event_ids: string[];
  evidence_object_ids: string[];
  summary: string;
  explanation: string;
  confidence: number;
}
