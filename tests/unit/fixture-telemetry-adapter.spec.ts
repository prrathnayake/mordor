import {
  normalizeFixtureTelemetryRecord,
  validateFixtureTelemetryRecord,
  validateFixtureTelemetrySource,
} from "../../packages/adapters/src/index.js";
import { validateCanonicalEvent } from "../../packages/contracts/src/index.js";
import { loadJsonFixture } from "../../packages/test-fixtures/src/index.js";

describe("fixture telemetry adapter", () => {
  it("normalizes valid telemetry records into canonical events deterministically", async () => {
    const source = await loadJsonFixture<unknown>("contracts", "source.valid.telemetry.json");
    const batch = await loadJsonFixture<{ records: unknown[] }>(
      "adapters",
      "fixture-telemetry",
      "valid.records.json",
    );
    const expected = await loadJsonFixture<{ events: unknown[] }>(
      "adapters",
      "fixture-telemetry",
      "valid.expected-events.json",
    );

    const sourceValidation = validateFixtureTelemetrySource(source);

    if (!sourceValidation.ok) {
      throw new Error(sourceValidation.issues.join(", "));
    }

    const actualEvents = batch.records.map(
      (record) =>
        normalizeFixtureTelemetryRecord({
          source: sourceValidation.value,
          raw_record: record,
          context: {
            default_received_at: "2026-04-05T10:15:32Z",
            processed_at: "2026-04-05T10:16:00Z",
          },
        }).canonical_event,
    );

    expect(actualEvents).toEqual(expected.events);
    expect(actualEvents.every((event) => validateCanonicalEvent(event).ok)).toBe(true);
  });

  it("rejects malformed records", async () => {
    const batch = await loadJsonFixture<{ records: unknown[] }>(
      "adapters",
      "fixture-telemetry",
      "malformed.records.json",
    );

    expect(() => validateFixtureTelemetryRecord(batch.records[0])).toThrow(
      "tracker_id must be a non-empty string",
    );
  });

  it("preserves duplicate identity through deterministic dedupe keys", async () => {
    const source = await loadJsonFixture<unknown>("contracts", "source.valid.telemetry.json");
    const batch = await loadJsonFixture<{ records: unknown[] }>(
      "adapters",
      "fixture-telemetry",
      "duplicate.records.json",
    );
    const sourceValidation = validateFixtureTelemetrySource(source);

    if (!sourceValidation.ok) {
      throw new Error(sourceValidation.issues.join(", "));
    }

    const [first, second] = batch.records.map(
      (record) =>
        normalizeFixtureTelemetryRecord({
          source: sourceValidation.value,
          raw_record: record,
          context: {
            default_received_at: "2026-04-05T10:15:32Z",
            processed_at: "2026-04-05T10:16:00Z",
          },
        }).canonical_event,
    );

    expect(first.event_id).toBe(second.event_id);
    expect(first.dedupe_key).toBe(second.dedupe_key);
  });

  it("accepts documented boundary values and preserves delayed observation times", async () => {
    const source = await loadJsonFixture<unknown>("contracts", "source.valid.telemetry.json");
    const delayedBatch = await loadJsonFixture<{ records: unknown[] }>(
      "adapters",
      "fixture-telemetry",
      "delayed.records.json",
    );
    const boundaryBatch = await loadJsonFixture<{ records: unknown[] }>(
      "adapters",
      "fixture-telemetry",
      "boundary.records.json",
    );
    const sourceValidation = validateFixtureTelemetrySource(source);

    if (!sourceValidation.ok) {
      throw new Error(sourceValidation.issues.join(", "));
    }

    const delayedRecord = normalizeFixtureTelemetryRecord({
      source: sourceValidation.value,
      raw_record: delayedBatch.records[1],
      context: {
        default_received_at: "2026-04-05T10:16:15Z",
        processed_at: "2026-04-05T10:16:16Z",
      },
    }).canonical_event;
    const boundaryRecord = normalizeFixtureTelemetryRecord({
      source: sourceValidation.value,
      raw_record: boundaryBatch.records[0],
      context: {
        default_received_at: "2026-04-05T10:20:01Z",
        processed_at: "2026-04-05T10:20:02Z",
      },
    }).canonical_event;

    expect(delayedRecord.observed_at).toBe("2026-04-05T10:16:00.000Z");
    expect(delayedRecord.ingested_at).toBe("2026-04-05T10:16:15.000Z");
    expect(boundaryRecord.payload.lat).toBe(90);
    expect(boundaryRecord.payload.lon).toBe(180);
    expect(boundaryRecord.speed_mps).toBe(0);
    expect(boundaryRecord.heading_deg).toBe(0);
  });
});
