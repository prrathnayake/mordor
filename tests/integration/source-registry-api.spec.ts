import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  setupAuthenticatedApi,
  teardownAuthenticatedApi,
} from "../helpers/authenticated-test-setup.js";

describe("source registry API integration", () => {
  let setup: Awaited<ReturnType<typeof setupAuthenticatedApi>>;

  beforeEach(async () => {
    setup = await setupAuthenticatedApi();

    await setup.api.persistence.upsertSource({
      source_id: "cam_001",
      source_type: "camera",
      name: "Campus Camera 1",
      status: "active",
      owner: "test-provider",
      auth_ref: "test-auth-ref",
      polling_mode: "pull",
      schema_version: "1.0.0",
      created_at: "2026-04-06T10:00:00.000Z",
      updated_at: "2026-04-06T10:00:00.000Z",
    });

    await setup.api.persistence.upsertSource({
      source_id: "cam_002",
      source_type: "camera",
      name: "Campus Camera 2",
      status: "active",
      owner: "test-provider",
      auth_ref: "test-auth-ref",
      polling_mode: "pull",
      schema_version: "1.0.0",
      created_at: "2026-04-06T10:00:00.000Z",
      updated_at: "2026-04-06T10:00:00.000Z",
    });

    await setup.api.persistence.upsertSourceRegistry({
      source_id: "cam_001",
      source_type: "camera",
      provider: "test-provider",
      label: "Campus Camera 1",
      lat: 40.7128,
      lon: -74.006,
      alt_m: 12,
      heading_deg: 180,
      coverage: null,
      status: "active",
      last_update: "2026-04-06T10:00:00.000Z",
      snapshot_available: true,
      live_available: false,
      linked_object_ids: ["veh_42"],
      linked_alert_ids: [],
      linked_incident_ids: [],
      metadata: { zone: "north" },
    });

    await setup.api.persistence.upsertSourceRegistry({
      source_id: "cam_002",
      source_type: "camera",
      provider: "test-provider",
      label: "Campus Camera 2",
      lat: 40.7228,
      lon: -74.016,
      alt_m: 10,
      heading_deg: 90,
      coverage: null,
      status: "active",
      last_update: "2026-04-06T10:00:00.000Z",
      snapshot_available: true,
      live_available: false,
      linked_object_ids: [],
      linked_alert_ids: [],
      linked_incident_ids: [],
      metadata: { zone: "south" },
    });

    await setup.api.persistence.addSourceLink({
      source_id: "cam_001",
      target_type: "object",
      target_id: "veh_42",
      link_type: "explicit",
      distance_m: 15,
    });
  });

  afterEach(async () => {
    await teardownAuthenticatedApi(setup);
  });

  it("returns linked sources without being shadowed by /sources/:sourceId", async () => {
    const response = await fetch(`http://127.0.0.1:${setup.api.port}/sources/linked/object/veh_42`);

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      links: Array<{ source_id: string; link_type: string; distance_m: number | null }>;
    };

    expect(payload.links).toEqual([
      expect.objectContaining({
        source_id: "cam_001",
        link_type: "explicit",
        distance_m: 15,
      }),
    ]);
  });

  it("returns the nearest source without being shadowed by /sources/:sourceId", async () => {
    const response = await fetch(
      `http://127.0.0.1:${setup.api.port}/sources/nearest-to-point?lat=40.71281&lon=-74.00595`,
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      source_id: string;
      distance_m: number;
    };

    expect(payload.source_id).toBe("cam_001");
    expect(payload.distance_m).toBeTypeOf("number");
  });
});
