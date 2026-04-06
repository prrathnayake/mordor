/**
 * Inferred Intelligence Models
 *
 * Defines data structures for derived operational intelligence in MORDOR.
 * All inferred outputs are explicitly marked as inferred, scored, and evidence-backed.
 */

import type { Geometry } from "./models.js";

export const INFERENCE_TYPES = [
  "nav_degradation",
  "route_redirection",
  "holding_pattern",
  "absence_signal",
  "anomaly",
] as const;
export type InferenceType = (typeof INFERENCE_TYPES)[number];

export const INFERENCE_STATUSES = ["active", "resolved", "expired", "invalidated"] as const;
export type InferenceStatus = (typeof INFERENCE_STATUSES)[number];

export const CONFIDENCE_LEVELS = ["low", "medium", "high", "very_high"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export interface InferredEvent {
  inference_id: string;
  inference_type: InferenceType;
  confidence: number;
  confidence_level: ConfidenceLevel;
  time_window_start: string;
  time_window_end: string;
  aoi?: Geometry;
  related_source_ids: string[];
  related_object_ids: string[];
  related_event_ids: string[];
  evidence_summary: string;
  inferred_status: InferenceStatus;
  details: InferenceDetails;
  created_at: string;
  updated_at: string;
}

export interface InferenceDetails {
  severity?: string;
  affected_area_sqkm?: number;
  deviation_meters?: number;
  loop_count?: number;
  duration_seconds?: number;
  thinning_percent?: number;
  expected_count?: number;
  observed_count?: number;
  source_blackout?: boolean;
  raw_metrics?: Record<string, number>;
}

export interface NavDegradationDetails extends InferenceDetails {
  severity: "minor" | "moderate" | "severe";
  affected_area_sqkm: number;
  degraded_signals: number;
  total_signals: number;
  primary_cause?: string;
}

export interface RouteRedirectionDetails extends InferenceDetails {
  object_id: string;
  original_path: Array<{ lat: number; lon: number; timestamp: string }>;
  actual_path: Array<{ lat: number; lon: number; timestamp: string }>;
  deviation_meters: number;
  deviation_point: { lat: number; lon: number };
  probable_cause?: string;
}

export interface HoldingPatternDetails extends InferenceDetails {
  object_id: string;
  center_point: { lat: number; lon: number };
  radius_meters: number;
  loop_count: number;
  duration_seconds: number;
  orbit_type?: string;
  heading_changes: number;
}

export interface AbsenceSignalDetails extends InferenceDetails {
  signal_type: string;
  affected_layer: string;
  thinning_percent: number;
  expected_count: number;
  observed_count: number;
  source_blackout: boolean;
  affected_aoi?: Geometry;
  probable_cause?: string;
}

export interface CreateInferenceRequest {
  inference_type: InferenceType;
  time_window_start: string;
  time_window_end: string;
  aoi?: Geometry;
  related_source_ids?: string[];
  related_object_ids?: string[];
  related_event_ids?: string[];
  evidence_summary: string;
  details: InferenceDetails;
}

export interface InferenceFilter {
  inference_type?: InferenceType;
  status?: InferenceStatus;
  confidence_level?: ConfidenceLevel;
  start_time?: string;
  end_time?: string;
  incident_id?: string;
}

export interface HeatmapGrid {
  grid_id: string;
  resolution_meters: number;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  cells: Array<{
    lat: number;
    lon: number;
    value: number;
    confidence: number;
  }>;
  generated_at: string;
}

export interface DegradationZone {
  zone_id: string;
  polygon: Geometry;
  severity: "minor" | "moderate" | "severe";
  confidence: number;
  affected_signals: number;
  estimated_area_sqkm: number;
  inferred_at: string;
  evidence_refs: string[];
}

export interface InferredTimelineMarker {
  marker_id: string;
  inference_id: string;
  type: "inferred";
  subtype: InferenceType;
  timestamp: string;
  title: string;
  description: string;
  confidence: number;
  confidence_level: ConfidenceLevel;
  severity?: string;
  lat?: number;
  lon?: number;
  linked_inference_id?: string;
}

export function calculateConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.9) return "very_high";
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

export function formatEvidenceSummary(type: InferenceType, details: InferenceDetails): string {
  switch (type) {
    case "nav_degradation": {
      const d = details as NavDegradationDetails;
      return `${d.severity} navigation degradation affecting ~${d.affected_area_sqkm.toFixed(1)} sq km (${d.degraded_signals}/${d.total_signals} signals degraded)`;
    }
    case "route_redirection": {
      const d = details as RouteRedirectionDetails;
      return `Route deviation of ${d.deviation_meters.toFixed(0)}m detected for object ${d.object_id}`;
    }
    case "holding_pattern": {
      const d = details as HoldingPatternDetails;
      return `${d.loop_count} orbit loops detected (${d.duration_seconds}s) near (${d.center_point.lat.toFixed(4)}, ${d.center_point.lon.toFixed(4)})`;
    }
    case "absence_signal": {
      const d = details as AbsenceSignalDetails;
      if (d.source_blackout) {
        return `Source blackout detected for ${d.affected_layer}`;
      }
      return `${d.thinning_percent.toFixed(0)}% activity thinning for ${d.affected_layer} (${d.observed_count}/${d.expected_count})`;
    }
    case "anomaly":
      return details.severity ? `Anomaly detected: ${details.severity}` : "Anomaly detected";
    default:
      return "Inferred intelligence event";
  }
}
