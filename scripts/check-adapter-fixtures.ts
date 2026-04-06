import {
  normalizeFixtureTelemetryRecord,
  validateFixtureTelemetrySource,
} from "../packages/adapters/src/index.js";
import { validateCanonicalEvent } from "../packages/contracts/src/index.js";
import { loadJsonFixture } from "../packages/test-fixtures/src/index.js";

const requiredAdapterFixtures = [
  "valid.records.json",
  "valid.expected-events.json",
  "malformed.records.json",
  "duplicate.records.json",
  "delayed.records.json",
  "boundary.records.json",
  "valid.request.json",
  "malformed.request.json",
] as const;

async function main(): Promise<void> {
  const source = await loadJsonFixture<unknown>("contracts", "source.valid.telemetry.json");
  const sourceValidation = validateFixtureTelemetrySource(source);

  if (!sourceValidation.ok) {
    throw new Error(
      `Fixture telemetry source fixture is invalid: ${sourceValidation.issues.join(", ")}`,
    );
  }

  await Promise.all(
    requiredAdapterFixtures.map((fixtureName) =>
      loadJsonFixture<unknown>("adapters", "fixture-telemetry", fixtureName),
    ),
  );

  const validBatch = await loadJsonFixture<{ records: unknown[] }>(
    "adapters",
    "fixture-telemetry",
    "valid.records.json",
  );
  const expected = await loadJsonFixture<{ events: unknown[] }>(
    "adapters",
    "fixture-telemetry",
    "valid.expected-events.json",
  );

  const actualEvents = validBatch.records.map(
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

  if (JSON.stringify(actualEvents) !== JSON.stringify(expected.events)) {
    throw new Error(
      "Fixture telemetry expected canonical outputs no longer match adapter normalization",
    );
  }

  const invalidExpected = actualEvents.find((event) => !validateCanonicalEvent(event).ok);

  if (invalidExpected) {
    throw new Error(
      `Fixture telemetry expected event failed canonical validation: ${invalidExpected.event_id}`,
    );
  }

  console.log("Verified fixture telemetry adapter fixture completeness and expected outputs.");
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
