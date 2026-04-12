import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadJsonFixture } from "../../packages/test-fixtures/src/index.js";
import {
  setupAuthenticatedApi,
  teardownAuthenticatedApi,
} from "../helpers/authenticated-test-setup.js";

interface SourceHealth {
  source_id: string;
  status: string;
  last_seen_at: string;
  error_message: string | null;
  updated_at: string;
}

interface LatestStateResponse {
  states: Array<{
    object_id: string;
    as_of: string;
  }>;
}

interface TrackResponse {
  object_id: string;
  source: string;
  points: Array<{
    lat: number;
    lon: number;
    observed_at: string;
  }>;
}

describe("source health tracking", () => {
  let setup: Awaited<ReturnType<typeof setupAuthenticatedApi>>;

  beforeEach(async () => {
    setup = await setupAuthenticatedApi();
  });

  afterEach(async () => {
    await teardownAuthenticatedApi(setup);
  });

  it("tracks source health after camera observation ingestion", async () => {
    const ingestPayload = await loadJsonFixture<unknown>(
      "adapters",
      "camera-observation",
      "valid.request.json",
    );

    const response = await fetch(`http://127.0.0.1:${setup.api.port}/ingest/camera-observation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify(ingestPayload),
    });

    expect(response.status).toBe(200);

    const healthResponse = await fetch(`http://127.0.0.1:${setup.api.port}/health/sources`, {
      headers: { Authorization: `Bearer ${setup.operatorToken}` },
    });
    const healthPayload = (await healthResponse.json()) as { sources: SourceHealth[] };

    expect(healthPayload.sources).toBeDefined();
    expect(healthPayload.sources.length).toBeGreaterThan(0);

    const cameraSource = healthPayload.sources.find((s) => s.source_id.startsWith("camera_"));
    expect(cameraSource).toBeDefined();
    expect(cameraSource?.status).toBe("active");
  });

  it("returns source health for specific source", async () => {
    const ingestPayload = await loadJsonFixture<unknown>(
      "adapters",
      "camera-observation",
      "valid.request.json",
    );

    await fetch(`http://127.0.0.1:${setup.api.port}/ingest/camera-observation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify(ingestPayload),
    });

    const healthResponse = await fetch(`http://127.0.0.1:${setup.api.port}/health/sources`, {
      headers: { Authorization: `Bearer ${setup.operatorToken}` },
    });
    const healthPayload = (await healthResponse.json()) as { sources: SourceHealth[] };

    const cameraSourceId = healthPayload.sources[0]?.source_id;

    if (cameraSourceId) {
      const specificHealthResponse = await fetch(
        `http://127.0.0.1:${setup.api.port}/health/sources/${cameraSourceId}`,
        {
          headers: { Authorization: `Bearer ${setup.operatorToken}` },
        },
      );
      const specificHealth = (await specificHealthResponse.json()) as SourceHealth;

      expect(specificHealth.source_id).toBe(cameraSourceId);
      expect(specificHealth.status).toBe("active");
    }
  });
});

describe("latest state API", () => {
  let setup: Awaited<ReturnType<typeof setupAuthenticatedApi>>;

  beforeEach(async () => {
    setup = await setupAuthenticatedApi();
  });

  afterEach(async () => {
    await teardownAuthenticatedApi(setup);
  });

  it("marks telemetry sources active after fixture ingestion", async () => {
    const ingestPayload = await loadJsonFixture<unknown>(
      "adapters",
      "fixture-telemetry",
      "valid.request.json",
    );

    await fetch(`http://127.0.0.1:${setup.api.port}/ingest/fixture-telemetry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify(ingestPayload),
    });

    const response = await fetch(`http://127.0.0.1:${setup.api.port}/health/sources`, {
      headers: { Authorization: `Bearer ${setup.operatorToken}` },
    });
    const payload = (await response.json()) as { sources: SourceHealth[] };

    expect(response.status).toBe(200);
    expect(payload.sources.some((source) => source.source_id === "src_campus_gps_1")).toBe(true);
  });

  it("returns latest state for all objects", async () => {
    const ingestPayload = await loadJsonFixture<unknown>(
      "adapters",
      "fixture-telemetry",
      "valid.request.json",
    );

    await fetch(`http://127.0.0.1:${setup.api.port}/ingest/fixture-telemetry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify(ingestPayload),
    });

    const response = await fetch(`http://127.0.0.1:${setup.api.port}/state/latest`, {
      headers: { Authorization: `Bearer ${setup.operatorToken}` },
    });
    const payload = (await response.json()) as LatestStateResponse;

    expect(response.status).toBe(200);
    expect(payload.states).toBeDefined();
    expect(Array.isArray(payload.states)).toBe(true);
  });

  it("returns recent track points for an object", async () => {
    const ingestPayload = await loadJsonFixture<unknown>(
      "adapters",
      "fixture-telemetry",
      "valid.request.json",
    );

    await fetch(`http://127.0.0.1:${setup.api.port}/ingest/fixture-telemetry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify(ingestPayload),
    });

    const response = await fetch(
      `http://127.0.0.1:${setup.api.port}/state/tracks/veh_42?limit=10`,
      {
        headers: { Authorization: `Bearer ${setup.operatorToken}` },
      },
    );
    const payload = (await response.json()) as TrackResponse;

    expect(response.status).toBe(200);
    expect(payload.object_id).toBe("veh_42");
    expect(Array.isArray(payload.points)).toBe(true);
    expect(payload.points.length).toBeGreaterThan(0);
    expect(payload.source).toBe("database");
  });
});
