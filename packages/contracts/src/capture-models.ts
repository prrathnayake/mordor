/**
 * Capture Job and Evidence Models
 *
 * Defines data structures for incident-linked capture jobs,
 * source snapshotting, and evidence freeze/preservation in MORDOR.
 */

export const CAPTURE_JOB_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type CaptureJobStatus = (typeof CAPTURE_JOB_STATUSES)[number];

export const CAPTURE_SOURCE_TYPES = [
  "flights",
  "earthquakes",
  "satellites",
  "weather",
  "bikeshare",
  "traffic",
  "cctv",
  "alerts",
  "events",
] as const;
export type CaptureSourceType = (typeof CAPTURE_SOURCE_TYPES)[number];

export const FREEZE_STATUSES = ["none", "partial", "frozen"] as const;
export type FreezeStatus = (typeof FREEZE_STATUSES)[number];

export interface CaptureJob {
  capture_job_id: string;
  incident_id: string;
  source_type: CaptureSourceType;
  status: CaptureJobStatus;
  started_at: string | null;
  ended_at: string | null;
  snapshot_count: number;
  error_code: string | null;
  error_message: string | null;
  freeze_status: FreezeStatus;
  created_at: string;
  created_by: string;
}

export interface CaptureSnapshot {
  snapshot_id: string;
  capture_job_id: string;
  source_type: CaptureSourceType;
  external_id: string | null;
  observed_at: string;
  captured_at: string;
  payload: Record<string, unknown>;
  metadata: SnapshotMetadata;
  frozen: boolean;
  frozen_at: string | null;
}

export interface SnapshotMetadata {
  source_name: string;
  record_count: number | null;
  source_complete: boolean;
  raw_ref: string | null;
  adapter_version: string;
}

export interface EvidenceFreeze {
  freeze_id: string;
  capture_job_id: string;
  incident_id: string;
  freeze_status: FreezeStatus;
  total_snapshots: number;
  frozen_snapshots: number;
  source_type: CaptureSourceType;
  source_name: string;
  frozen_by: string;
  frozen_at: string | null;
  notes: string | null;
}

export interface CaptureJobDetail extends CaptureJob {
  snapshots: CaptureSnapshot[];
  evidence_freeze: EvidenceFreeze | null;
}

export interface CaptureProgress {
  capture_job_id: string;
  status: CaptureJobStatus;
  progress_percent: number;
  snapshots_captured: number;
  estimated_total: number;
  elapsed_seconds: number;
  current_phase: string;
}

export interface CreateCaptureJobRequest {
  incident_id: string;
  source_type: CaptureSourceType;
}

export interface StartCaptureJobRequest {
  capture_job_id: string;
}

export interface FreezeEvidenceRequest {
  capture_job_id: string;
  notes?: string;
}

export interface CaptureJobFilter {
  incident_id?: string;
  status?: CaptureJobStatus;
  source_type?: CaptureSourceType;
  freeze_status?: FreezeStatus;
}

export interface CaptureJobSummary {
  total_jobs: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  total_snapshots: number;
  frozen_snapshots: number;
}

export interface IncidentCaptureStatus {
  incident_id: string;
  total_jobs: number;
  completed_jobs: number;
  active_jobs: number;
  failed_jobs: number;
  total_snapshots: number;
  has_frozen_evidence: boolean;
  sources_captured: CaptureSourceType[];
  sources_frozen: CaptureSourceType[];
}
