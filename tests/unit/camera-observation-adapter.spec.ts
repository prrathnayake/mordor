import { describe, expect, it } from "vitest";
import {
  normalizeCameraObservationRecord,
  validateCameraObservationRecord,
  validateCameraObservationSource,
} from "../../packages/adapters/src/camera-observation/index.js";
import type { CameraObservationSource } from "../../packages/adapters/src/camera-observation/types.js";

describe("camera observation adapter", () => {
  describe("validateCameraObservationSource", () => {
    it("validates a valid camera source", () => {
      const input: CameraObservationSource = {
        source_id: "cam_entrance_1",
        source_type: "camera_feed",
        name: "Entrance Camera 1",
        location_lat: -33.8688,
        location_lon: 151.2093,
      };

      const result = validateCameraObservationSource(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.source_id).toBe("cam_entrance_1");
        expect(result.value.source_type).toBe("camera_feed");
      }
    });

    it("rejects missing source_id", () => {
      const input = {
        source_type: "camera_feed",
        name: "Test Camera",
      };

      const result = validateCameraObservationSource(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toContain("source_id must be a non-empty string");
      }
    });

    it("rejects invalid source_type", () => {
      const input = {
        source_id: "cam_1",
        source_type: "invalid_type",
        name: "Test Camera",
      };

      const result = validateCameraObservationSource(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues[0]).toContain("source_type must equal camera_feed");
      }
    });
  });

  describe("validateCameraObservationRecord", () => {
    it("validates a valid record", () => {
      const input = {
        camera_id: "cam_entrance_1",
        timestamp: "2026-04-05T10:20:00Z",
        frame_id: "frame_001",
        object_detected: "person_001",
        object_type: "person",
        confidence: 0.95,
      };

      const result = validateCameraObservationRecord(input);

      expect(result.camera_id).toBe("cam_entrance_1");
      expect(result.confidence).toBe(0.95);
    });

    it("rejects invalid timestamp", () => {
      const input = {
        camera_id: "cam_entrance_1",
        timestamp: "not-a-timestamp",
        frame_id: "frame_001",
        object_detected: "person_001",
        object_type: "person",
        confidence: 0.95,
      };

      expect(() => validateCameraObservationRecord(input)).toThrow(
        "timestamp must be a valid ISO-8601 date-time string",
      );
    });

    it("rejects confidence out of range", () => {
      const input = {
        camera_id: "cam_entrance_1",
        timestamp: "2026-04-05T10:20:00Z",
        frame_id: "frame_001",
        object_detected: "person_001",
        object_type: "person",
        confidence: 1.5,
      };

      expect(() => validateCameraObservationRecord(input)).toThrow(
        "confidence must be between 0 and 1",
      );
    });

    it("validates optional bounding_box", () => {
      const input = {
        camera_id: "cam_entrance_1",
        timestamp: "2026-04-05T10:20:00Z",
        frame_id: "frame_001",
        object_detected: "person_001",
        object_type: "person",
        confidence: 0.95,
        bounding_box: {
          x: 120,
          y: 80,
          width: 60,
          height: 180,
        },
      };

      const result = validateCameraObservationRecord(input);

      expect(result.bounding_box).toEqual({
        x: 120,
        y: 80,
        width: 60,
        height: 180,
      });
    });

    it("validates optional location", () => {
      const input = {
        camera_id: "cam_entrance_1",
        timestamp: "2026-04-05T10:20:00Z",
        frame_id: "frame_001",
        object_detected: "person_001",
        object_type: "person",
        confidence: 0.95,
        location: {
          lat: -33.8688,
          lon: 151.2093,
        },
      };

      const result = validateCameraObservationRecord(input);

      expect(result.location).toEqual({
        lat: -33.8688,
        lon: 151.2093,
      });
    });
  });

  describe("normalizeCameraObservationRecord", () => {
    it("normalizes a valid record", () => {
      const source: CameraObservationSource = {
        source_id: "cam_entrance_1",
        source_type: "camera_feed",
        name: "Entrance Camera 1",
        location_lat: -33.8688,
        location_lon: 151.2093,
      };

      const rawRecord = {
        camera_id: "cam_entrance_1",
        timestamp: "2026-04-05T10:20:00Z",
        frame_id: "frame_001",
        object_detected: "person_001",
        object_type: "person",
        confidence: 0.95,
      };

      const result = normalizeCameraObservationRecord({
        source,
        raw_record: rawRecord,
        context: {
          default_timestamp: "2026-04-05T10:20:00Z",
          processed_at: "2026-04-05T10:20:01Z",
        },
      });

      expect(result.canonical_event.event_type).toBe("sensor_observed");
      expect(result.canonical_event.object_id).toBe("cam_entrance_1_person_001");
      expect(result.canonical_event.confidence).toBe(0.95);
      expect(result.tracked_object.object_type).toBe("person");
    });

    it("includes geometry when location is present", () => {
      const source: CameraObservationSource = {
        source_id: "cam_entrance_1",
        source_type: "camera_feed",
        name: "Entrance Camera 1",
        location_lat: -33.8688,
        location_lon: 151.2093,
      };

      const rawRecord = {
        camera_id: "cam_entrance_1",
        timestamp: "2026-04-05T10:20:00Z",
        frame_id: "frame_001",
        object_detected: "person_001",
        object_type: "person",
        confidence: 0.95,
        location: {
          lat: -33.8689,
          lon: 151.2094,
        },
      };

      const result = normalizeCameraObservationRecord({
        source,
        raw_record: rawRecord,
        context: {
          default_timestamp: "2026-04-05T10:20:00Z",
          processed_at: "2026-04-05T10:20:01Z",
        },
      });

      expect(result.canonical_event.geometry?.type).toBe("Point");
      expect(result.canonical_event.geometry?.coordinates).toEqual([151.2094, -33.8689]);
    });
  });
});
