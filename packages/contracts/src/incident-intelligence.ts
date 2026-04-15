export const INCIDENT_INTELLIGENCE_ARTIFACT_TYPES = [
  "article",
  "image",
  "video",
  "report",
] as const;

export const INCIDENT_INTELLIGENCE_VERIFICATION_STATUSES = [
  "unverified",
  "single_source",
  "cross_checked",
  "trusted_source",
] as const;

export const INCIDENT_WIDGET_TYPES = [
  "summary",
  "map_context",
  "related_articles",
  "media_gallery",
  "source_provenance",
  "pattern_brief",
] as const;

export const INCIDENT_WIDGET_LAYOUTS = ["primary", "secondary", "context"] as const;

export const INCIDENT_WIDGET_STATUSES = ["active", "hidden"] as const;

export const INCIDENT_INTELLIGENCE_RUN_TYPES = ["articles", "images", "videos", "fusion"] as const;

export const INCIDENT_INTELLIGENCE_RUN_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
] as const;

export type IncidentIntelligenceArtifactType =
  (typeof INCIDENT_INTELLIGENCE_ARTIFACT_TYPES)[number];
export type IncidentIntelligenceVerificationStatus =
  (typeof INCIDENT_INTELLIGENCE_VERIFICATION_STATUSES)[number];
export type IncidentWidgetType = (typeof INCIDENT_WIDGET_TYPES)[number];
export type IncidentWidgetLayout = (typeof INCIDENT_WIDGET_LAYOUTS)[number];
export type IncidentWidgetStatus = (typeof INCIDENT_WIDGET_STATUSES)[number];
export type IncidentIntelligenceRunType = (typeof INCIDENT_INTELLIGENCE_RUN_TYPES)[number];
export type IncidentIntelligenceRunStatus = (typeof INCIDENT_INTELLIGENCE_RUN_STATUSES)[number];

export interface IncidentIntelligenceArtifact {
  artifact_id: string;
  incident_id: string;
  dedupe_key: string;
  artifact_type: IncidentIntelligenceArtifactType;
  provider: string;
  title: string;
  summary: string;
  url: string;
  thumbnail_url: string | null;
  author: string | null;
  published_at: string | null;
  captured_at: string;
  lat: number | null;
  lon: number | null;
  verification_status: IncidentIntelligenceVerificationStatus;
  confidence: number;
  source_urls: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface IncidentWidgetManifest {
  widget_id: string;
  incident_id: string;
  widget_key: string;
  widget_type: IncidentWidgetType;
  title: string;
  layout: IncidentWidgetLayout;
  priority: number;
  status: IncidentWidgetStatus;
  generated_by: string;
  spec: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface IncidentIntelligenceRun {
  run_id: string;
  incident_id: string;
  provider: string;
  run_type: IncidentIntelligenceRunType;
  status: IncidentIntelligenceRunStatus;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  stats: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface IncidentIntelligenceBundle {
  incident_id: string;
  artifacts: IncidentIntelligenceArtifact[];
  widgets: IncidentWidgetManifest[];
  runs: IncidentIntelligenceRun[];
}

export interface UpsertIncidentIntelligenceArtifactInput {
  incident_id: string;
  dedupe_key: string;
  artifact_type: IncidentIntelligenceArtifactType;
  provider: string;
  title: string;
  summary?: string;
  url: string;
  thumbnail_url?: string | null;
  author?: string | null;
  published_at?: string | null;
  captured_at?: string;
  lat?: number | null;
  lon?: number | null;
  verification_status: IncidentIntelligenceVerificationStatus;
  confidence: number;
  source_urls?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpsertIncidentWidgetManifestInput {
  incident_id: string;
  widget_key: string;
  widget_type: IncidentWidgetType;
  title: string;
  layout: IncidentWidgetLayout;
  priority?: number;
  status?: IncidentWidgetStatus;
  generated_by: string;
  spec: Record<string, unknown>;
}

export interface CreateIncidentIntelligenceRunInput {
  run_id: string;
  incident_id: string;
  provider: string;
  run_type: IncidentIntelligenceRunType;
  status: IncidentIntelligenceRunStatus;
  started_at: string;
  completed_at?: string | null;
  error_message?: string | null;
  stats?: Record<string, unknown>;
}
