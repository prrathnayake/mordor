import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ALERT_SCHEMA_VERSION,
  CANONICAL_EVENT_SCHEMA_VERSION,
  OBJECT_STATE_SCHEMA_VERSION,
  SOURCE_SCHEMA_VERSION,
  SWAN_ACTIVITY_SCHEMA_VERSION,
  SWAN_ARTIFACT_PROJECTION_SCHEMA_VERSION,
  SWAN_FINDING_SCHEMA_VERSION,
  TRACKED_OBJECT_SCHEMA_VERSION,
  validateAlert,
  validateCanonicalEvent,
  validateSource,
  validateSwanActivityEvent,
  validateSwanArtifactProjection,
  validateSwanFinding,
  validateTrackedObject,
} from "../packages/contracts/src/index.js";
import { orderEventsForReplay } from "../packages/replay/src/index.js";
import {
  loadJsonFixture,
  type ReplayIncidentFixture,
} from "../packages/test-fixtures/src/index.js";

interface ContractSchemaDocument {
  title: string;
  "x-contract-name": string;
  "x-schema-version": string;
}

const schemaChecks = [
  {
    file: "packages/contracts/schemas/source.schema.json",
    contractName: "source",
    version: SOURCE_SCHEMA_VERSION,
  },
  {
    file: "packages/contracts/schemas/tracked-object.schema.json",
    contractName: "trackedObject",
    version: TRACKED_OBJECT_SCHEMA_VERSION,
  },
  {
    file: "packages/contracts/schemas/canonical-event.schema.json",
    contractName: "canonicalEvent",
    version: CANONICAL_EVENT_SCHEMA_VERSION,
  },
  {
    file: "packages/contracts/schemas/object-state.schema.json",
    contractName: "objectState",
    version: OBJECT_STATE_SCHEMA_VERSION,
  },
  {
    file: "packages/contracts/schemas/alert.schema.json",
    contractName: "alert",
    version: ALERT_SCHEMA_VERSION,
  },
  {
    file: "packages/contracts/schemas/swan-activity-event.schema.json",
    contractName: "swanActivity",
    version: SWAN_ACTIVITY_SCHEMA_VERSION,
  },
  {
    file: "packages/contracts/schemas/swan-finding.schema.json",
    contractName: "swanFinding",
    version: SWAN_FINDING_SCHEMA_VERSION,
  },
  {
    file: "packages/contracts/schemas/swan-artifact-projection.schema.json",
    contractName: "swanArtifactProjection",
    version: SWAN_ARTIFACT_PROJECTION_SCHEMA_VERSION,
  },
] as const;

async function readSchema(relativePath: string): Promise<ContractSchemaDocument> {
  const absolutePath = path.join(process.cwd(), relativePath);
  const raw = await readFile(absolutePath, "utf8");
  return JSON.parse(raw) as ContractSchemaDocument;
}

function requireValidationSuccess<T>(
  label: string,
  result:
    | { ok: true; value: T }
    | {
        ok: false;
        issues: string[];
      },
): T {
  if (result.ok) {
    return result.value;
  }

  throw new Error(`${label} failed validation:\n- ${result.issues.join("\n- ")}`);
}

async function main(): Promise<void> {
  for (const check of schemaChecks) {
    const schema = await readSchema(check.file);

    if (schema["x-contract-name"] !== check.contractName) {
      throw new Error(
        `${check.file} has x-contract-name=${schema["x-contract-name"]}, expected ${check.contractName}`,
      );
    }

    if (schema["x-schema-version"] !== check.version) {
      throw new Error(
        `${check.file} has x-schema-version=${schema["x-schema-version"]}, expected ${check.version}`,
      );
    }
  }

  requireValidationSuccess(
    "source fixture",
    validateSource(await loadJsonFixture<unknown>("contracts", "source.valid.telemetry.json")),
  );
  requireValidationSuccess(
    "tracked object fixture",
    validateTrackedObject(
      await loadJsonFixture<unknown>("contracts", "tracked-object.valid.vehicle.json"),
    ),
  );
  requireValidationSuccess(
    "canonical event fixture",
    validateCanonicalEvent(
      await loadJsonFixture<unknown>("contracts", "canonical-event.valid.position-observed.json"),
    ),
  );
  requireValidationSuccess(
    "alert fixture",
    validateAlert(await loadJsonFixture<unknown>("contracts", "alert.valid.after-hours-zone.json")),
  );
  requireValidationSuccess(
    "swan activity fixture",
    validateSwanActivityEvent(
      await loadJsonFixture<unknown>("contracts", "swan-activity-event.valid.object-selected.json"),
    ),
  );
  requireValidationSuccess(
    "swan finding fixture",
    validateSwanFinding(
      await loadJsonFixture<unknown>("contracts", "swan-finding.valid.object-context.json"),
    ),
  );
  requireValidationSuccess(
    "swan artifact projection fixture",
    validateSwanArtifactProjection(
      await loadJsonFixture<unknown>("contracts", "swan-artifact-projection.valid.panels.json"),
    ),
  );

  const invalidEventResult = validateCanonicalEvent(
    await loadJsonFixture<unknown>("contracts", "canonical-event.invalid.missing-provenance.json"),
  );

  if (invalidEventResult.ok) {
    throw new Error("Invalid canonical event fixture unexpectedly passed validation");
  }

  const replayFixture = await loadJsonFixture<ReplayIncidentFixture>(
    "replay",
    "campus-after-hours-incident.json",
  );
  const replayEvents = replayFixture.events.map((event, index) =>
    requireValidationSuccess(`replay fixture event ${index}`, validateCanonicalEvent(event)),
  );
  const orderedEventIds = orderEventsForReplay(replayEvents).map((event) => event.event_id);

  if (orderedEventIds.join("|") !== replayFixture.expected_event_order.join("|")) {
    throw new Error(
      `Replay fixture ordering drift detected. Expected ${replayFixture.expected_event_order.join(", ")}, received ${orderedEventIds.join(", ")}`,
    );
  }

  console.log("Verified contract artifacts, fixtures, and replay ordering baseline.");
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
