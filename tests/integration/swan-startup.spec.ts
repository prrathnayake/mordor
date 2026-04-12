import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../../apps/api/src/index.js";
import { authenticate } from "../../packages/auth/src/index.js";
import { startPostgresTestEnvironment } from "../helpers/postgres-test-environment.js";

describe("API startup without SWAN schema", () => {
  let environment: Awaited<ReturnType<typeof startPostgresTestEnvironment>>;
  let api: Awaited<ReturnType<typeof startApiServer>>;

  beforeAll(async () => {
    environment = await startPostgresTestEnvironment();

    await environment.database.pool.query(`
      DROP TABLE IF EXISTS swan_findings CASCADE;
      DROP TABLE IF EXISTS swan_artifacts CASCADE;
      DROP TABLE IF EXISTS swan_threads CASCADE;
      DROP TABLE IF EXISTS swan_activity_events CASCADE;
      DROP TABLE IF EXISTS swan_sessions CASCADE;
    `);

    api = await startApiServer({
      connection_string: environment.connection_string,
      skipConfigValidation: true,
    });
  });

  afterAll(async () => {
    await api.close();
    await environment.stop();
  });

  it("keeps core routes available and degrades SWAN routes to 503", async () => {
    const healthResponse = await fetch(`http://127.0.0.1:${api.port}/health`);
    const healthPayload = (await healthResponse.json()) as { status: string };

    const token = authenticate("operator", "operator123").token ?? "";
    const swanResponse = await fetch(
      `http://127.0.0.1:${api.port}/swan/session?client_session_id=test-client`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const swanPayload = (await swanResponse.json()) as {
      error: string;
      missing_tables: string[];
    };

    expect(healthResponse.status).toBe(200);
    expect(healthPayload.status).toBe("ok");
    expect(swanResponse.status).toBe(503);
    expect(swanPayload.error).toBe("swan_unavailable");
    expect(swanPayload.missing_tables).toContain("swan_threads");
  });
});
