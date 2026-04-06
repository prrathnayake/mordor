import type { CanonicalEvent } from "../../contracts/src/index.js";
import type { ObjectState, Source } from "../../contracts/src/models.js";

export interface Clock {
  now(): string;
}

export const systemClock: Clock = {
  now() {
    return new Date().toISOString();
  },
};

export interface TrackedObjectSeed {
  object_id: string;
  object_type: string;
  display_name: string;
  tags: string[];
}

export interface NormalizedAdapterRecord {
  canonical_event: CanonicalEvent;
  tracked_object: TrackedObjectSeed;
}

export interface RawPayloadReceipt {
  raw_payload_id: string;
  received_at: string;
  content_hash: string;
}

export interface AuditLogInput {
  actor_id: string | null;
  actor_type: string;
  operation: string;
  target_type: string;
  target_id: string | null;
  trace_id: string;
  occurred_at: string;
  result: string;
  metadata: Record<string, unknown>;
}

export interface PersistNormalizedRecordResult {
  status: "inserted" | "duplicate";
  latest_state: ObjectState | null;
}

export type ObjectStateUpdateCallback = (state: ObjectState) => void;

export interface FixtureTelemetryIngestionPersistence {
  upsertSource(source: Source): Promise<void>;
  upsertSourceHealth(input: {
    source_id: string;
    status: "active" | "inactive" | "stale" | "error";
    last_seen_at: string;
    error_message?: string;
  }): Promise<void>;
  createRawPayloadReceipt(input: {
    source_id: string;
    payload: Record<string, unknown>;
    adapter_version: string;
    trace_id: string;
    received_at: string;
  }): Promise<RawPayloadReceipt>;
  markRawPayloadParsed(input: { raw_payload_id: string }): Promise<void>;
  markRawPayloadQuarantined(input: {
    raw_payload_id: string;
    failure_code: string;
    failure_reason: string;
  }): Promise<void>;
  persistNormalizedRecord(input: {
    normalized_record: NormalizedAdapterRecord;
    trace_id: string;
  }): Promise<PersistNormalizedRecordResult>;
  recordAuditLog(input: AuditLogInput): Promise<void>;
}

export interface FixtureTelemetryIngestionCommand {
  source: Source;
  records: unknown[];
  trace_id: string;
}

export interface QuarantinedFixtureTelemetryRecord {
  index: number;
  raw_payload_id: string;
  error_code: string;
  error_message: string;
}

export interface FixtureTelemetryIngestionResult {
  status: "accepted" | "partial_success" | "rejected";
  trace_id: string;
  source_id: string;
  total_records: number;
  inserted_event_ids: string[];
  duplicate_event_ids: string[];
  latest_state_by_object_id: Record<string, ObjectState>;
  quarantined_records: QuarantinedFixtureTelemetryRecord[];
}

export interface CameraObservationIngestionCommand {
  source: {
    source_id: string;
    source_type: "camera_feed";
    name: string;
    location_lat: number;
    location_lon: number;
  };
  records: unknown[];
  trace_id: string;
}

export interface QuarantinedCameraObservationRecord {
  index: number;
  raw_payload_id: string;
  error_code: string;
  error_message: string;
}

export interface CameraObservationIngestionResult {
  status: "accepted" | "partial_success" | "rejected";
  trace_id: string;
  source_id: string;
  total_records: number;
  inserted_event_ids: string[];
  duplicate_event_ids: string[];
  latest_state_by_object_id: Record<string, ObjectState>;
  quarantined_records: QuarantinedCameraObservationRecord[];
}
