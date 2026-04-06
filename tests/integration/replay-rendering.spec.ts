import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadJsonFixture } from "../../packages/test-fixtures/src/index.js";
import {
  setupAuthenticatedApi,
  teardownAuthenticatedApi,
} from "../helpers/authenticated-test-setup.js";

interface ReplayItem {
  sequence: number;
  event: { object_id: string; event_id: string };
  state_after_event: {
    position: { lat: number; lon: number } | null;
    velocity: { speed_mps: number; heading_deg: number } | null;
    last_event_id: string;
  };
}

interface ReplayResponse {
  items: ReplayItem[];
  item_count: number;
}

describe("replay rendering behavior", () => {
  let setup: Awaited<ReturnType<typeof setupAuthenticatedApi>>;

  beforeEach(async () => {
    setup = await setupAuthenticatedApi();

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
  });

  afterEach(async () => {
    await teardownAuthenticatedApi(setup);
  });

  it("returns objects with valid position data for map rendering", async () => {
    const response = await fetch(`http://127.0.0.1:${setup.api.port}/replay/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        start_at: "2026-04-05T10:15:00Z",
        end_at: "2026-04-05T10:16:00Z",
        object_id: "veh_42",
      }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as ReplayResponse;

    expect(payload.items.length).toBeGreaterThan(0);

    const firstItem = payload.items[0];
    expect(firstItem.state_after_event.position).toBeDefined();
    expect(firstItem.state_after_event.position?.lat).toBeDefined();
    expect(firstItem.state_after_event.position?.lon).toBeDefined();
  });

  it("returns velocity data alongside position", async () => {
    const response = await fetch(`http://127.0.0.1:${setup.api.port}/replay/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        start_at: "2026-04-05T10:15:00Z",
        end_at: "2026-04-05T10:16:00Z",
        object_id: "veh_42",
      }),
    });

    const payload = (await response.json()) as ReplayResponse;

    expect(payload.items[0].state_after_event.velocity).toBeDefined();
    expect(payload.items[0].state_after_event.velocity?.speed_mps).toBeCloseTo(13.4, 1);
    expect(payload.items[0].state_after_event.velocity?.heading_deg).toBeCloseTo(91.2, 1);
  });

  it("maintains object_id traceability through timeline", async () => {
    const response = await fetch(`http://127.0.0.1:${setup.api.port}/replay/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        start_at: "2026-04-05T10:15:00Z",
        end_at: "2026-04-05T10:16:00Z",
        object_id: "veh_42",
      }),
    });

    const payload = (await response.json()) as ReplayResponse;

    for (const item of payload.items) {
      expect(item.event.object_id).toBe("veh_42");
      expect(item.state_after_event.last_event_id).toBeDefined();
    }
  });

  it("provides deterministic state progression through timeline", async () => {
    const response1 = await fetch(`http://127.0.0.1:${setup.api.port}/replay/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        start_at: "2026-04-05T10:15:00Z",
        end_at: "2026-04-05T10:16:00Z",
        object_id: "veh_42",
      }),
    });

    const response2 = await fetch(`http://127.0.0.1:${setup.api.port}/replay/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        start_at: "2026-04-05T10:15:00Z",
        end_at: "2026-04-05T10:16:00Z",
        object_id: "veh_42",
      }),
    });

    const payload1 = (await response1.json()) as ReplayResponse;
    const payload2 = (await response2.json()) as ReplayResponse;

    expect(payload1.items.length).toBe(payload2.items.length);

    for (let i = 0; i < payload1.items.length; i++) {
      expect(payload1.items[i].event.event_id).toBe(payload2.items[i].event.event_id);
      expect(payload1.items[i].state_after_event.last_event_id).toBe(
        payload2.items[i].state_after_event.last_event_id,
      );
    }
  });
});
