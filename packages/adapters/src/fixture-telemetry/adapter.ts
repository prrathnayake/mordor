import {
  CANONICAL_EVENT_SCHEMA_VERSION,
  type CanonicalEvent,
  type Source,
  validateSource,
} from "../../../contracts/src/index.js";
import type { TrackedObjectSeed } from "../../../ingestion/src/types.js";
import { FixtureTelemetryAdapterError } from "./errors.js";
import type {
  FixtureTelemetryNormalizationContext,
  FixtureTelemetryRecord,
  FixtureTelemetrySource,
  FixtureTelemetrySourceConfig,
} from "./types.js";

export const FIXTURE_TELEMETRY_ADAPTER_NAME = "fixture_telemetry_adapter";
export const FIXTURE_TELEMETRY_ADAPTER_VERSION = "1.0.0";
export const FIXTURE_TELEMETRY_SOURCE_CONFIG_SCHEMA: FixtureTelemetrySourceConfig = Object.freeze({
  source_type: "telemetry_feed",
});

export const FIXTURE_TELEMETRY_RAW_PAYLOAD_EXPECTATIONS = Object.freeze({
  required_fields: ["tracker_id", "lat", "lng", "speed", "heading", "ts"] as const,
});

export interface NormalizedFixtureTelemetryRecord {
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

function normalizeObjectId(trackerId: string): string {
  return trackerId.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function readRequiredString(
  input: Record<string, unknown>,
  key: keyof FixtureTelemetryRecord,
): string {
  const value = input[key];

  if (typeof value !== "string" || value.trim() === "") {
    throw new FixtureTelemetryAdapterError(
      "PayloadMalformed",
      `${String(key)} must be a non-empty string`,
    );
  }

  return value;
}

function readRequiredNumber(
  input: Record<string, unknown>,
  key: keyof FixtureTelemetryRecord,
): number {
  const value = input[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new FixtureTelemetryAdapterError(
      "PayloadMalformed",
      `${String(key)} must be a finite number`,
    );
  }

  return value;
}

export function validateFixtureTelemetrySource(
  input: unknown,
): { ok: true; value: FixtureTelemetrySource } | { ok: false; issues: string[] } {
  const baseValidation = validateSource(input);

  if (!baseValidation.ok) {
    return baseValidation;
  }

  if (baseValidation.value.source_type !== FIXTURE_TELEMETRY_SOURCE_CONFIG_SCHEMA.source_type) {
    return {
      ok: false,
      issues: [`source_type must equal ${FIXTURE_TELEMETRY_SOURCE_CONFIG_SCHEMA.source_type}`],
    };
  }

  return {
    ok: true,
    value: baseValidation.value as FixtureTelemetrySource,
  };
}

export function validateFixtureTelemetryRecord(input: unknown): FixtureTelemetryRecord {
  if (!isRecord(input)) {
    throw new FixtureTelemetryAdapterError(
      "PayloadMalformed",
      "fixture telemetry record must be an object",
    );
  }

  const trackerId = readRequiredString(input, "tracker_id");
  const lat = readRequiredNumber(input, "lat");
  const lng = readRequiredNumber(input, "lng");
  const speed = readRequiredNumber(input, "speed");
  const heading = readRequiredNumber(input, "heading");
  const ts = readRequiredString(input, "ts");
  const receivedAt =
    input.received_at === undefined ? undefined : readRequiredString(input, "received_at");
  const status = input.status === undefined ? undefined : readRequiredString(input, "status");

  if (!isIsoDateTime(ts)) {
    throw new FixtureTelemetryAdapterError(
      "SchemaMismatch",
      "ts must be a valid ISO-8601 date-time string",
    );
  }

  if (receivedAt && !isIsoDateTime(receivedAt)) {
    throw new FixtureTelemetryAdapterError(
      "SchemaMismatch",
      "received_at must be a valid ISO-8601 date-time string when provided",
    );
  }

  if (lat < -90 || lat > 90) {
    throw new FixtureTelemetryAdapterError("NormalizationFailed", "lat must be between -90 and 90");
  }

  if (lng < -180 || lng > 180) {
    throw new FixtureTelemetryAdapterError(
      "NormalizationFailed",
      "lng must be between -180 and 180",
    );
  }

  if (speed < 0) {
    throw new FixtureTelemetryAdapterError(
      "NormalizationFailed",
      "speed must be greater than or equal to 0",
    );
  }

  if (heading < 0 || heading > 360) {
    throw new FixtureTelemetryAdapterError(
      "NormalizationFailed",
      "heading must be between 0 and 360",
    );
  }

  return {
    tracker_id: trackerId,
    lat,
    lng,
    speed,
    heading,
    ts,
    received_at: receivedAt,
    status,
  };
}

export function normalizeFixtureTelemetryRecord(input: {
  source: Source;
  raw_record: unknown;
  context: FixtureTelemetryNormalizationContext;
}): NormalizedFixtureTelemetryRecord {
  const sourceValidation = validateFixtureTelemetrySource(input.source);

  if (!sourceValidation.ok) {
    throw new FixtureTelemetryAdapterError("SchemaMismatch", sourceValidation.issues.join(", "));
  }

  const record = validateFixtureTelemetryRecord(input.raw_record);
  const objectId = normalizeObjectId(record.tracker_id);
  const observedAt = new Date(record.ts).toISOString();
  const ingestedAt = new Date(
    record.received_at ?? input.context.default_received_at,
  ).toISOString();
  const processedAt = new Date(input.context.processed_at).toISOString();
  const eventType = "position_observed";
  const eventId = `evt_${objectId}_${compactTimestamp(observedAt)}_${eventType}`;

  return {
    canonical_event: {
      event_id: eventId,
      event_type: eventType,
      object_id: objectId,
      source_id: sourceValidation.value.source_id,
      observed_at: observedAt,
      ingested_at: ingestedAt,
      processed_at: processedAt,
      schema_version: CANONICAL_EVENT_SCHEMA_VERSION,
      payload: {
        lat: record.lat,
        lon: record.lng,
        speed_mps: record.speed,
        heading_deg: record.heading,
        status: record.status ?? "observed",
      },
      provenance: {
        adapter: FIXTURE_TELEMETRY_ADAPTER_NAME,
        adapter_version: FIXTURE_TELEMETRY_ADAPTER_VERSION,
        raw_ref: "pending_raw_ref",
        transformation_notes: [
          `tracker_id ${record.tracker_id} normalized to object_id ${objectId}`,
        ],
      },
      confidence: 0.99,
      dedupe_key: `${sourceValidation.value.source_id}:${objectId}:${observedAt}:${eventType}`,
      geometry: {
        type: "Point",
        coordinates: [record.lng, record.lat],
      },
      altitude_m: null,
      heading_deg: record.heading,
      speed_mps: record.speed,
      related_object_ids: [],
      parent_event_id: null,
      trace_id: null,
    },
    tracked_object: {
      object_id: objectId,
      object_type: "vehicle",
      display_name: `Vehicle ${objectId}`,
      tags: ["campus", "telemetry_feed"],
    },
  };
}
