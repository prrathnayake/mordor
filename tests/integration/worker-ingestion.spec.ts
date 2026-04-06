import { runFixtureTelemetryWorkerJob } from "../../apps/worker/src/index.js";
import { loadJsonFixture } from "../../packages/test-fixtures/src/index.js";
import { startPostgresTestEnvironment } from "../helpers/postgres-test-environment.js";

describe("fixture telemetry worker ingestion", () => {
  it("applies migrations and persists raw payloads, canonical events, and latest state", async () => {
    const environment = await startPostgresTestEnvironment();

    try {
      const payload = await loadJsonFixture<unknown>(
        "adapters",
        "fixture-telemetry",
        "valid.request.json",
      );
      const result = await runFixtureTelemetryWorkerJob({
        connection_string: environment.connection_string,
        payload,
      });

      expect(result.status).toBe("accepted");

      if ("issues" in result) {
        throw new Error(result.issues.join(", "));
      }

      expect(result.inserted_event_ids).toHaveLength(2);

      const rawPayloadCount = await environment.database.pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM raw_payloads",
      );
      const eventCount = await environment.database.pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM canonical_events",
      );
      const stateCount = await environment.database.pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM latest_object_states",
      );

      expect(rawPayloadCount.rows[0]?.count).toBe("2");
      expect(eventCount.rows[0]?.count).toBe("2");
      expect(stateCount.rows[0]?.count).toBe("1");
    } finally {
      await environment.stop();
    }
  });
});
