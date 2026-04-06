import type { Source } from "../../../contracts/src/models.js";

export interface FixtureTelemetryRecord {
  tracker_id: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  ts: string;
  received_at?: string;
  status?: string;
}

export interface FixtureTelemetrySourceConfig {
  source_type: "telemetry_feed";
}

export interface FixtureTelemetryNormalizationContext {
  default_received_at: string;
  processed_at: string;
}

export interface FixtureTelemetrySource extends Source {
  source_type: "telemetry_feed";
}
