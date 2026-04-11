import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getRuntime } from "../test-utils/runtime.js";
import { createApiServer } from "../apps/api/src/server.js";
import type { PostgresPersistenceGateway } from "../packages/persistence/src/index.js";

describe("Source Registry", () => {
  let apiServer;
  let persistence;
  const connectionString = process.env.DATABASE_URL || "postgres://mordor:mordor@localhost/mordor";

  beforeEach(async () => {
    const runtime = await getRuntime({ connectionString });
    apiServer = await runtime.start();
    persistence = apiServer.persistence;
  });

  afterEach(async () => {
    await apiServer.close();
  });

  describe("Source Registry Model", () => {
    it("should support required source fields", async () => {
      const sourceId = `src_test_${Date.now()}`;

      await persistence.upsertSourceRegistry({
        source_id: sourceId,
        source_type: "camera",
        provider: "test-provider",
        label: "Test Camera",
        lat: 40.7128,
        lon: -74.006,
        alt_m: 10,
        heading_deg: 180,
        coverage: {
          type: "cone",
          coordinates: [],
          heading_deg: 180,
          fov_deg: 90,
          range_m: 500,
        },
        status: "active",
        last_update: new Date().toISOString(),
        snapshot_available: true,
        live_available: false,
        linked_object_ids: ["obj_001"],
        linked_alert_ids: ["alert_001"],
        linked_incident_ids: ["incident_001"],
        metadata: { test: true },
      });

      const source = await persistence.getSourceRegistry(sourceId);

      expect(source).not.toBeNull();
      expect(source?.source_id).toBe(sourceId);
      expect(source?.source_type).toBe("camera");
      expect(source?.provider).toBe("test-provider");
      expect(source?.label).toBe("Test Camera");
      expect(source?.lat).toBe(40.7128);
      expect(source?.lon).toBe(-74.006);
      expect(source?.status).toBe("active");
      expect(source?.snapshot_available).toBe(true);
      expect(source?.live_available).toBe(false);
    });

    it("should allow null for optional fields", async () => {
      const sourceId = `src_test_nullable_${Date.now()}`;

      await persistence.upsertSourceRegistry({
        source_id: sourceId,
        source_type: "sensor",
        provider: "test",
        label: "Minimal Source",
        lat: null,
        lon: null,
        alt_m: null,
        heading_deg: null,
        coverage: null,
        status: "inactive",
        last_update: new Date().toISOString(),
        snapshot_available: false,
        live_available: false,
        linked_object_ids: [],
        linked_alert_ids: [],
        linked_incident_ids: [],
        metadata: {},
      });

      const source = await persistence.getSourceRegistry(sourceId);

      expect(source).not.toBeNull();
      expect(source?.lat).toBeNull();
      expect(source?.coverage).toBeNull();
    });
  });

  describe("Source Linking", () => {
    it("should link sources to objects", async () => {
      const sourceId = `src_test_link_${Date.now()}`;
      const objectId = "test_object_001";

      await persistence.upsertSourceRegistry({
        source_id: sourceId,
        source_type: "camera",
        provider: "test",
        label: "Test",
        lat: 40.7128,
        lon: -74.006,
        alt_m: null,
        heading_deg: null,
        coverage: null,
        status: "active",
        last_update: new Date().toISOString(),
        snapshot_available: false,
        live_available: false,
        linked_object_ids: [],
        linked_alert_ids: [],
        linked_incident_ids: [],
        metadata: {},
      });

      await persistence.addSourceLink({
        source_id: sourceId,
        target_type: "object",
        target_id: objectId,
        link_type: "explicit",
        distance_m: 100,
      });

      const links = await persistence.getSourceLinksForTarget({
        target_type: "object",
        target_id: objectId,
      });

      expect(links.length).toBe(1);
      expect(links[0].source_id).toBe(sourceId);
      expect(links[0].link_type).toBe("explicit");
    });

    it("should resolve nearest source to point", async () => {
      await persistence.upsertSourceRegistry({
        source_id: "src_nearest_test",
        source_type: "camera",
        provider: "test",
        label: "Nearest Target",
        lat: 40.7128,
        lon: -74.006,
        alt_m: null,
        heading_deg: null,
        coverage: null,
        status: "active",
        last_update: new Date().toISOString(),
        snapshot_available: false,
        live_available: false,
        linked_object_ids: [],
        linked_alert_ids: [],
        linked_incident_ids: [],
        metadata: {},
      });

      const nearest = await persistence.getNearestSourceToPoint(40.7129, -74.0059);

      expect(nearest).not.toBeNull();
      expect(nearest?.source_id).toBe("src_nearest_test");
      expect(nearest?.distance_m).toBeGreaterThan(0);
    });
  });

  describe("Source API Endpoints", () => {
    it("should list all sources via API", async () => {
      const response = await fetch(`${apiServer.server.url.href}sources`);
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.sources).toBeDefined();
    });

    it("should get source detail via API", async () => {
      const sourceId = `src_api_test_${Date.now()}`;

      await persistence.upsertSourceRegistry({
        source_id: sourceId,
        source_type: "radar",
        provider: "api-test",
        label: "API Test Source",
        lat: 40.7128,
        lon: -74.006,
        alt_m: null,
        heading_deg: null,
        coverage: null,
        status: "active",
        last_update: new Date().toISOString(),
        snapshot_available: false,
        live_available: false,
        linked_object_ids: [],
        linked_alert_ids: [],
        linked_incident_ids: [],
        metadata: {},
      });

      const response = await fetch(`${apiServer.server.url.href}sources/${sourceId}`);
      const source = await response.json();

      expect(response.ok).toBe(true);
      expect(source.source_id).toBe(sourceId);
    });

    it("should return 404 for non-existent source", async () => {
      const response = await fetch(`${apiServer.server.url.href}sources/non_existent_source`);

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    it("should find nearest source via API", async () => {
      await persistence.upsertSourceRegistry({
        source_id: "src_api_nearest",
        source_type: "camera",
        provider: "test",
        label: "API Nearest",
        lat: 40.7128,
        lon: -74.006,
        alt_m: null,
        heading_deg: null,
        coverage: null,
        status: "active",
        last_update: new Date().toISOString(),
        snapshot_available: false,
        live_available: false,
        linked_object_ids: [],
        linked_alert_ids: [],
        linked_incident_ids: [],
        metadata: {},
      });

      const response = await fetch(
        `${apiServer.server.url.href}sources/nearest-to-point?lat=40.7129&lon=-74.0059`,
      );
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.source_id).toBe("src_api_nearest");
    });
  });
});
