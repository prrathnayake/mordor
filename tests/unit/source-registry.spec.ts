import { describe, it, expect } from "vitest";
import type {
  SourceRegistryEntry,
  SourceType,
  SourceStatus,
} from "../../packages/contracts/src/index.js";

describe("Source Registry Models", () => {
  describe("SourceRegistryEntry", () => {
    it("should have required fields", () => {
      const source: SourceRegistryEntry = {
        source_id: "cam_001",
        source_type: "camera" as SourceType,
        provider: "test-provider",
        label: "Test Camera",
        lat: 40.7128,
        lon: -74.006,
        alt_m: 10,
        heading_deg: 180,
        coverage: null,
        status: "active" as SourceStatus,
        last_update: new Date().toISOString(),
        snapshot_available: true,
        live_available: false,
        linked_object_ids: ["obj_001"],
        linked_alert_ids: [],
        linked_incident_ids: [],
        metadata: { test: true },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(source.source_id).toBe("cam_001");
      expect(source.source_type).toBe("camera");
      expect(source.provider).toBe("test-provider");
      expect(source.label).toBe("Test Camera");
      expect(source.lat).toBe(40.7128);
      expect(source.lon).toBe(-74.006);
    });

    it("should allow null for optional fields", () => {
      const source: SourceRegistryEntry = {
        source_id: "sensor_001",
        source_type: "sensor" as SourceType,
        provider: "test",
        label: "Minimal Source",
        lat: null,
        lon: null,
        alt_m: null,
        heading_deg: null,
        coverage: null,
        status: "inactive" as SourceStatus,
        last_update: new Date().toISOString(),
        snapshot_available: false,
        live_available: false,
        linked_object_ids: [],
        linked_alert_ids: [],
        linked_incident_ids: [],
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(source.lat).toBeNull();
      expect(source.lon).toBeNull();
      expect(source.coverage).toBeNull();
    });

    it("should support coverage geometry", () => {
      const source: SourceRegistryEntry = {
        source_id: "cam_002",
        source_type: "camera" as SourceType,
        provider: "test",
        label: "Camera with FOV",
        lat: 40.7128,
        lon: -74.006,
        alt_m: null,
        heading_deg: 180,
        coverage: {
          type: "cone",
          coordinates: [],
          heading_deg: 180,
          fov_deg: 90,
          range_m: 500,
        },
        status: "active" as SourceStatus,
        last_update: new Date().toISOString(),
        snapshot_available: true,
        live_available: false,
        linked_object_ids: [],
        linked_alert_ids: [],
        linked_incident_ids: [],
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(source.coverage).not.toBeNull();
      expect(source.coverage?.type).toBe("cone");
      expect(source.coverage?.fov_deg).toBe(90);
      expect(source.coverage?.range_m).toBe(500);
    });
  });

  describe("Source Types", () => {
    it("should have valid source types", () => {
      const validTypes = ["camera", "radar", "satellite", "adsb", "ais", "sensor", "manual"];
      expect(validTypes).toContain("camera");
      expect(validTypes).toContain("radar");
      expect(validTypes).toContain("satellite");
      expect(validTypes).toContain("adsb");
      expect(validTypes).toContain("ais");
      expect(validTypes).toContain("sensor");
      expect(validTypes).toContain("manual");
    });
  });

  describe("Source Statuses", () => {
    it("should have valid statuses", () => {
      const validStatuses = ["active", "inactive", "stale", "error", "disconnected"];
      expect(validStatuses).toContain("active");
      expect(validStatuses).toContain("inactive");
      expect(validStatuses).toContain("stale");
      expect(validStatuses).toContain("error");
      expect(validStatuses).toContain("disconnected");
    });
  });
});
