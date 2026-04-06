/**
 * Incident Models
 *
 * Defines the data structures for incident management, correlation timeline,
 * and multi-layer event reconstruction in MORDOR.
 */

import type { Geometry } from "./models.js";

export const INCIDENT_STATUSES = ["open", "investigating", "resolved", "closed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export interface Incident {
  incident_id: string;
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  aoi?: Geometry;
  status: IncidentStatus;
  severity: IncidentSeverity;
  created_at: string;
  updated_at: string;
  created_by: string;
  tags: string[];
}

export interface IncidentChapter {
  chapter_id: string;
  incident_id: string;
  title: string;
  timestamp: string;
  description?: string;
  event_ids: string[];
  alert_ids: string[];
  lat?: number;
  lon?: number;
  created_at: string;
}

export interface IncidentLink {
  incident_id: string;
  event_id?: string;
  alert_id?: string;
  external_event_id?: string;
  layer_id?: string;
  linked_at: string;
  linked_by: string;
}

export interface TimelineMarker {
  marker_id: string;
  incident_id?: string;
  timestamp: string;
  type:
    | "alert"
    | "earthquake"
    | "satellite"
    | "weather"
    | "traffic"
    | "bikeshare"
    | "source_health"
    | "chapter"
    | "object_event";
  title: string;
  description?: string;
  severity?: IncidentSeverity;
  layer_id?: string;
  event_id?: string;
  alert_id?: string;
  external_id?: string;
  lat?: number;
  lon?: number;
  linked_chapter_id?: string;
}

export interface IncidentTimeline {
  incident: Incident;
  markers: TimelineMarker[];
  chapters: IncidentChapter[];
  before_count: number;
  during_count: number;
  after_count: number;
}

export interface CorrelationData {
  time_range: {
    start_at: string;
    end_at: string;
  };
  alerts: Array<{
    alert_id: string;
    severity: string;
    summary: string;
    opened_at: string;
    lat?: number;
    lon?: number;
  }>;
  earthquakes: Array<{
    event_id: string;
    external_id: string;
    magnitude: number;
    place: string;
    observed_at: string;
    lat: number;
    lon: number;
  }>;
  satellites: Array<{
    event_id: string;
    external_id: string;
    name: string;
    type: string;
    observed_at: string;
    lat: number;
    lon: number;
  }>;
  weather: Array<{
    event_id: string;
    external_id: string;
    event: string;
    severity: string;
    observed_at: string;
    lat: number;
    lon: number;
  }>;
  objects: Array<{
    object_id: string;
    event_id: string;
    event_type: string;
    observed_at: string;
    lat?: number;
    lon?: number;
  }>;
}

export interface IncidentPlaybackState {
  incident_id: string;
  mode: "incident";
  current_time: string;
  is_playing: boolean;
  speed: number;
  current_chapter_id?: string;
  visible_markers: TimelineMarker[];
}

export interface CreateIncidentRequest {
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  aoi?: Geometry;
  severity: IncidentSeverity;
  tags?: string[];
}

export interface UpdateIncidentRequest {
  title?: string;
  description?: string;
  start_at?: string;
  end_at?: string;
  aoi?: Geometry;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  tags?: string[];
}

export interface CreateChapterRequest {
  title: string;
  timestamp: string;
  description?: string;
  event_ids?: string[];
  alert_ids?: string[];
  lat?: number;
  lon?: number;
}

export interface LinkToIncidentRequest {
  event_id?: string;
  alert_id?: string;
  external_event_id?: string;
  layer_id?: string;
}
