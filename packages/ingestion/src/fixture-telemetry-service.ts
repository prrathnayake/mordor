import { randomUUID } from "node:crypto";
import {
  FIXTURE_TELEMETRY_ADAPTER_VERSION,
  normalizeFixtureTelemetryRecord,
  validateFixtureTelemetrySource,
} from "../../adapters/src/index.js";
import { type Source, validateCanonicalEvent, validateSource } from "../../contracts/src/index.js";
import type {
  FixtureTelemetryIngestionCommand,
  FixtureTelemetryIngestionPersistence,
  FixtureTelemetryIngestionResult,
} from "./types.js";
import { type Clock, systemClock } from "./types.js";

export type { Clock };
export { systemClock };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateFixtureTelemetryIngestionInput(
  input: unknown,
): { ok: true; value: FixtureTelemetryIngestionCommand } | { ok: false; issues: string[] } {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: ["fixture telemetry ingestion input must be an object"],
    };
  }

  const sourceValidation = validateSource(input.source);

  if (!sourceValidation.ok) {
    return sourceValidation;
  }

  const adapterSourceValidation = validateFixtureTelemetrySource(sourceValidation.value);

  if (!adapterSourceValidation.ok) {
    return adapterSourceValidation;
  }

  if (!Array.isArray(input.records)) {
    return {
      ok: false,
      issues: ["records must be an array"],
    };
  }

  if (input.records.length === 0) {
    return {
      ok: false,
      issues: ["records must contain at least one entry"],
    };
  }

  const traceId =
    typeof input.trace_id === "string" && input.trace_id.trim() !== ""
      ? input.trace_id
      : `trace_ingest_${randomUUID()}`;

  return {
    ok: true,
    value: {
      source: adapterSourceValidation.value,
      records: input.records,
      trace_id: traceId,
    },
  };
}

async function quarantineRawPayload(input: {
  persistence: FixtureTelemetryIngestionPersistence;
  raw_payload_id: string;
  source: Source;
  trace_id: string;
  failure_code: string;
  failure_reason: string;
  occurred_at: string;
}): Promise<void> {
  await input.persistence.markRawPayloadQuarantined({
    raw_payload_id: input.raw_payload_id,
    failure_code: input.failure_code,
    failure_reason: input.failure_reason,
  });

  await input.persistence.recordAuditLog({
    actor_id: null,
    actor_type: "system",
    operation: "raw_payload_quarantined",
    target_type: "raw_payload",
    target_id: input.raw_payload_id,
    trace_id: input.trace_id,
    occurred_at: input.occurred_at,
    result: input.failure_code,
    metadata: {
      source_id: input.source.source_id,
      reason: input.failure_reason,
    },
  });
}

export async function ingestFixtureTelemetryBatch(input: {
  command: FixtureTelemetryIngestionCommand;
  persistence: FixtureTelemetryIngestionPersistence;
  clock?: Clock;
}): Promise<FixtureTelemetryIngestionResult> {
  const clock = input.clock ?? systemClock;

  await input.persistence.upsertSource(input.command.source);
  await input.persistence.upsertSourceHealth({
    source_id: input.command.source.source_id,
    status: "active",
    last_seen_at: clock.now(),
  });

  const insertedEventIds: string[] = [];
  const duplicateEventIds: string[] = [];
  const latestStateByObjectId: FixtureTelemetryIngestionResult["latest_state_by_object_id"] = {};
  const quarantinedRecords: FixtureTelemetryIngestionResult["quarantined_records"] = [];

  for (const [index, record] of input.command.records.entries()) {
    const receivedAt = clock.now();
    const rawPayloadReceipt = await input.persistence.createRawPayloadReceipt({
      source_id: input.command.source.source_id,
      payload: isRecord(record) ? record : { invalid_payload: record },
      adapter_version: FIXTURE_TELEMETRY_ADAPTER_VERSION,
      trace_id: input.command.trace_id,
      received_at: receivedAt,
    });

    try {
      const normalizedRecord = normalizeFixtureTelemetryRecord({
        source: input.command.source,
        raw_record: record,
        context: {
          default_received_at: rawPayloadReceipt.received_at,
          processed_at: clock.now(),
        },
      });

      normalizedRecord.canonical_event.provenance.raw_ref = rawPayloadReceipt.raw_payload_id;
      normalizedRecord.canonical_event.trace_id = input.command.trace_id;

      const canonicalValidation = validateCanonicalEvent(normalizedRecord.canonical_event);

      if (!canonicalValidation.ok) {
        throw new Error(canonicalValidation.issues.join(", "));
      }

      const persistenceResult = await input.persistence.persistNormalizedRecord({
        normalized_record: {
          canonical_event: canonicalValidation.value,
          tracked_object: normalizedRecord.tracked_object,
        },
        trace_id: input.command.trace_id,
      });

      await input.persistence.markRawPayloadParsed({
        raw_payload_id: rawPayloadReceipt.raw_payload_id,
      });

      if (persistenceResult.status === "duplicate") {
        duplicateEventIds.push(canonicalValidation.value.event_id);
      } else {
        insertedEventIds.push(canonicalValidation.value.event_id);

        if (persistenceResult.latest_state) {
          latestStateByObjectId[persistenceResult.latest_state.object_id] =
            persistenceResult.latest_state;
        }
      }

      await input.persistence.upsertSourceHealth({
        source_id: input.command.source.source_id,
        status: "active",
        last_seen_at: clock.now(),
      });
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : "Unknown ingestion failure";
      const failureCode =
        error instanceof Error && "code" in error && typeof error.code === "string"
          ? error.code
          : "NormalizationFailed";

      await quarantineRawPayload({
        persistence: input.persistence,
        raw_payload_id: rawPayloadReceipt.raw_payload_id,
        source: input.command.source,
        trace_id: input.command.trace_id,
        failure_code: failureCode,
        failure_reason: failureMessage,
        occurred_at: clock.now(),
      });

      quarantinedRecords.push({
        index,
        raw_payload_id: rawPayloadReceipt.raw_payload_id,
        error_code: failureCode,
        error_message: failureMessage,
      });
    }
  }

  const status =
    quarantinedRecords.length > 0 && insertedEventIds.length === 0 && duplicateEventIds.length === 0
      ? "rejected"
      : quarantinedRecords.length > 0
        ? "partial_success"
        : "accepted";

  await input.persistence.recordAuditLog({
    actor_id: null,
    actor_type: "system",
    operation: "fixture_telemetry_ingest_batch",
    target_type: "source",
    target_id: input.command.source.source_id,
    trace_id: input.command.trace_id,
    occurred_at: clock.now(),
    result: status,
    metadata: {
      inserted_event_count: insertedEventIds.length,
      duplicate_event_count: duplicateEventIds.length,
      quarantined_record_count: quarantinedRecords.length,
      total_record_count: input.command.records.length,
    },
  });

  return {
    status,
    trace_id: input.command.trace_id,
    source_id: input.command.source.source_id,
    total_records: input.command.records.length,
    inserted_event_ids: insertedEventIds,
    duplicate_event_ids: duplicateEventIds,
    latest_state_by_object_id: latestStateByObjectId,
    quarantined_records: quarantinedRecords,
  };
}
