import {
  CANONICAL_EVENT_SCHEMA_VERSION,
  type CanonicalEvent,
} from "../../../contracts/src/index.js";
import type { TrackedObjectSeed } from "../../../ingestion/src/types.js";
import { CameraObservationAdapterError } from "./errors.js";
import type {
  CameraBoundingBox,
  CameraLocation,
  CameraObservationNormalizationContext,
  CameraObservationRecord,
  CameraObservationSource,
  CameraObservationSourceConfig,
} from "./types.js";

export const CAMERA_OBSERVATION_ADAPTER_NAME = "camera_observation_adapter";
export const CAMERA_OBSERVATION_ADAPTER_VERSION = "1.0.0";
export const CAMERA_OBSERVATION_SOURCE_CONFIG_SCHEMA: CameraObservationSourceConfig = Object.freeze(
  {
    source_type: "camera_feed",
  },
);

export const CAMERA_OBSERVATION_RAW_PAYLOAD_EXPECTATIONS = Object.freeze({
  required_fields: [
    "camera_id",
    "timestamp",
    "frame_id",
    "object_detected",
    "object_type",
    "confidence",
  ] as const,
});

export interface NormalizedCameraObservationRecord {
  canonical_event: CanonicalEvent;
  tracked_object: TrackedObjectSeed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDateTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function compactTimestamp(timestamp: string): string {
  return timestamp.replace(/[-:]/g, "").replace(".000", "");
}

function normalizeObjectId(cameraId: string, objectDetected: string): string {
  const cleanCamera = cameraId.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const cleanObject = objectDetected.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${cleanCamera}_${cleanObject}`;
}

function readRequiredString(
  input: Record<string, unknown>,
  key: keyof CameraObservationRecord,
): string {
  const value = input[key];

  if (typeof value !== "string" || value.trim() === "") {
    throw new CameraObservationAdapterError(
      "PayloadMalformed",
      `${String(key)} must be a non-empty string`,
    );
  }

  return value;
}

function readRequiredNumber(
  input: Record<string, unknown>,
  key: keyof CameraObservationRecord,
): number {
  const value = input[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CameraObservationAdapterError(
      "PayloadMalformed",
      `${String(key)} must be a finite number`,
    );
  }

  return value;
}

function readRequiredNumberGeneric(input: Record<string, unknown>, key: string): number {
  const value = input[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CameraObservationAdapterError("PayloadMalformed", `${key} must be a finite number`);
  }

  return value;
}

function readBoundingBox(input: Record<string, unknown>): CameraBoundingBox {
  const x = readRequiredNumberGeneric(input, "x");
  const y = readRequiredNumberGeneric(input, "y");
  const width = readRequiredNumberGeneric(input, "width");
  const height = readRequiredNumberGeneric(input, "height");
  return { x, y, width, height };
}

function readCameraLocation(input: Record<string, unknown>): CameraLocation {
  const lat = readRequiredNumberGeneric(input, "lat");
  const lon = readRequiredNumberGeneric(input, "lon");
  return { lat, lon };
}

export function validateCameraObservationSource(
  input: unknown,
): { ok: true; value: CameraObservationSource } | { ok: false; issues: string[] } {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: ["camera observation source must be an object"],
    };
  }

  const sourceId = input.source_id;
  const sourceType = input.source_type;
  const name = input.name;

  if (typeof sourceId !== "string" || sourceId.trim() === "") {
    return {
      ok: false,
      issues: ["source_id must be a non-empty string"],
    };
  }

  if (sourceType !== CAMERA_OBSERVATION_SOURCE_CONFIG_SCHEMA.source_type) {
    return {
      ok: false,
      issues: [`source_type must equal ${CAMERA_OBSERVATION_SOURCE_CONFIG_SCHEMA.source_type}`],
    };
  }

  if (typeof name !== "string" || name.trim() === "") {
    return {
      ok: false,
      issues: ["name must be a non-empty string"],
    };
  }

  return {
    ok: true,
    value: {
      source_id: sourceId,
      source_type: sourceType as "camera_feed",
      name: name,
      location_lat: typeof input.location_lat === "number" ? input.location_lat : 0,
      location_lon: typeof input.location_lon === "number" ? input.location_lon : 0,
    },
  };
}

export function validateCameraObservationRecord(input: unknown): CameraObservationRecord {
  if (!isRecord(input)) {
    throw new CameraObservationAdapterError(
      "PayloadMalformed",
      "camera observation record must be an object",
    );
  }

  const cameraId = readRequiredString(input, "camera_id");
  const timestamp = readRequiredString(input, "timestamp");
  const frameId = readRequiredString(input, "frame_id");
  const objectDetected = readRequiredString(input, "object_detected");
  const objectType = readRequiredString(input, "object_type");
  const confidence = readRequiredNumber(input, "confidence");

  if (!isIsoDateTime(timestamp)) {
    throw new CameraObservationAdapterError(
      "SchemaMismatch",
      "timestamp must be a valid ISO-8601 date-time string",
    );
  }

  if (confidence < 0 || confidence > 1) {
    throw new CameraObservationAdapterError(
      "NormalizationFailed",
      "confidence must be between 0 and 1",
    );
  }

  let boundingBox: CameraObservationRecord["bounding_box"] | undefined;
  if (input.bounding_box && isRecord(input.bounding_box)) {
    boundingBox = readBoundingBox(input.bounding_box);
  }

  let location: CameraObservationRecord["location"] | undefined;
  if (input.location && isRecord(input.location)) {
    const loc = readCameraLocation(input.location);

    if (loc.lat < -90 || loc.lat > 90) {
      throw new CameraObservationAdapterError(
        "NormalizationFailed",
        "lat must be between -90 and 90",
      );
    }

    if (loc.lon < -180 || loc.lon > 180) {
      throw new CameraObservationAdapterError(
        "NormalizationFailed",
        "lon must be between -180 and 180",
      );
    }

    location = loc;
  }

  return {
    camera_id: cameraId,
    timestamp,
    frame_id: frameId,
    object_detected: objectDetected,
    object_type: objectType,
    confidence,
    bounding_box: boundingBox,
    location,
  };
}

export function normalizeCameraObservationRecord(input: {
  source: CameraObservationSource;
  raw_record: unknown;
  context: CameraObservationNormalizationContext;
}): NormalizedCameraObservationRecord {
  const sourceValidation = validateCameraObservationSource(input.source);

  if (!sourceValidation.ok) {
    throw new CameraObservationAdapterError("SchemaMismatch", sourceValidation.issues.join(", "));
  }

  const record = validateCameraObservationRecord(input.raw_record);
  const objectId = normalizeObjectId(record.camera_id, record.object_detected);
  const observedAt = new Date(record.timestamp).toISOString();
  const processedAt = new Date(input.context.processed_at).toISOString();
  const eventType = "sensor_observed";
  const eventId = `evt_${objectId}_${compactTimestamp(observedAt)}_${eventType}`;

  const payload: Record<string, unknown> = {
    object_detected: record.object_detected,
    object_type: record.object_type,
    confidence: record.confidence,
    frame_id: record.frame_id,
    camera_id: record.camera_id,
  };

  if (record.bounding_box) {
    payload.bounding_box = record.bounding_box;
  }

  let geometry: CanonicalEvent["geometry"];

  if (record.location) {
    geometry = {
      type: "Point",
      coordinates: [record.location.lon, record.location.lat],
    };
  } else if (
    typeof input.source.location_lon === "number" &&
    typeof input.source.location_lat === "number"
  ) {
    geometry = {
      type: "Point",
      coordinates: [input.source.location_lon, input.source.location_lat],
    };
  }

  const canonicalSourceId = `camera_${input.source.source_id}`;

  return {
    canonical_event: {
      event_id: eventId,
      event_type: eventType,
      object_id: objectId,
      source_id: canonicalSourceId,
      observed_at: observedAt,
      ingested_at: observedAt,
      processed_at: processedAt,
      schema_version: CANONICAL_EVENT_SCHEMA_VERSION,
      payload,
      provenance: {
        adapter: CAMERA_OBSERVATION_ADAPTER_NAME,
        adapter_version: CAMERA_OBSERVATION_ADAPTER_VERSION,
        raw_ref: "pending_raw_ref",
        transformation_notes: [
          `camera_id ${record.camera_id}, object ${record.object_detected} normalized to object_id ${objectId}`,
        ],
      },
      confidence: record.confidence,
      dedupe_key: `${canonicalSourceId}:${objectId}:${observedAt}:${eventType}`,
      geometry,
      altitude_m: null,
      heading_deg: null,
      speed_mps: null,
      related_object_ids: [],
      parent_event_id: null,
      trace_id: null,
    },
    tracked_object: {
      object_id: objectId,
      object_type: record.object_type,
      display_name: `${record.object_type} ${record.object_detected}`,
      tags: ["camera", "camera_feed", record.object_type],
    },
  };
}
