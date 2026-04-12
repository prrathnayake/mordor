import {
  ALERT_SCHEMA_VERSION,
  CANONICAL_EVENT_SCHEMA_VERSION,
  SOURCE_SCHEMA_VERSION,
  validateAlert,
  validateCanonicalEvent,
  validateSource,
  validateSwanActivityEvent,
  validateSwanArtifactProjection,
  validateSwanFinding,
  validateTrackedObject,
} from "../../packages/contracts/src/index.js";
import { loadJsonFixture } from "../../packages/test-fixtures/src/index.js";

function expectValidationSuccess<T>(
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

  throw new Error(result.issues.join(", "));
}

describe("contract validators", () => {
  it("accepts the baseline source fixture", async () => {
    const fixture = await loadJsonFixture<unknown>("contracts", "source.valid.telemetry.json");
    const source = expectValidationSuccess(validateSource(fixture));

    expect(source.schema_version).toBe(SOURCE_SCHEMA_VERSION);
    expect(source.source_id).toBe("src_campus_gps_1");
  });

  it("accepts the baseline tracked object fixture", async () => {
    const fixture = await loadJsonFixture<unknown>(
      "contracts",
      "tracked-object.valid.vehicle.json",
    );
    const trackedObject = expectValidationSuccess(validateTrackedObject(fixture));

    expect(trackedObject.object_id).toBe("veh_42");
    expect(trackedObject.latest_state_ref).toBeNull();
  });

  it("accepts the baseline canonical event fixture", async () => {
    const fixture = await loadJsonFixture<unknown>(
      "contracts",
      "canonical-event.valid.position-observed.json",
    );
    const canonicalEvent = expectValidationSuccess(validateCanonicalEvent(fixture));

    expect(canonicalEvent.schema_version).toBe(CANONICAL_EVENT_SCHEMA_VERSION);
    expect(canonicalEvent.provenance.raw_ref).toBe("raw_abc123");
    expect(canonicalEvent.processed_at).toBe("2026-04-05T10:15:33Z");
  });

  it("rejects canonical events that omit provenance", async () => {
    const fixture = await loadJsonFixture<unknown>(
      "contracts",
      "canonical-event.invalid.missing-provenance.json",
    );
    const result = validateCanonicalEvent(fixture);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.issues).toContain("provenance must be an object");
    }
  });

  it("accepts the baseline alert fixture", async () => {
    const fixture = await loadJsonFixture<unknown>(
      "contracts",
      "alert.valid.after-hours-zone.json",
    );
    const alert = expectValidationSuccess(validateAlert(fixture));

    expect(alert.schema_version).toBe(ALERT_SCHEMA_VERSION);
    expect(alert.evidence_event_ids).toHaveLength(2);
  });

  it("accepts the baseline swan activity fixture", async () => {
    const fixture = await loadJsonFixture<unknown>(
      "contracts",
      "swan-activity-event.valid.object-selected.json",
    );
    const activity = expectValidationSuccess(validateSwanActivityEvent(fixture));

    expect(activity.activity_type).toBe("object_selected");
    expect(activity.target_id).toBe("veh_42");
  });

  it("accepts the baseline swan finding fixture", async () => {
    const fixture = await loadJsonFixture<unknown>(
      "contracts",
      "swan-finding.valid.object-context.json",
    );
    const finding = expectValidationSuccess(validateSwanFinding(fixture));

    expect(finding.verification_status).toBe("trusted_source");
    expect(finding.media).toHaveLength(1);
  });

  it("accepts the baseline swan artifact projection fixture", async () => {
    const fixture = await loadJsonFixture<unknown>(
      "contracts",
      "swan-artifact-projection.valid.panels.json",
    );
    const projection = expectValidationSuccess(validateSwanArtifactProjection(fixture));

    expect(projection.projection).toBe("panels");
  });
});
