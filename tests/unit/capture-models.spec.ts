import { describe, expect, it } from "vitest";
import {
  CAPTURE_JOB_STATUSES,
  CAPTURE_SOURCE_TYPES,
  type CaptureJob,
  type CaptureSnapshot,
  type CreateCaptureJobRequest,
  type EvidenceFreeze,
  FREEZE_STATUSES,
} from "../../packages/contracts/src/capture-models.js";

describe("capture models", () => {
  describe("constants", () => {
    it("has valid CAPTURE_JOB_STATUSES", () => {
      expect(CAPTURE_JOB_STATUSES).toContain("pending");
      expect(CAPTURE_JOB_STATUSES).toContain("running");
      expect(CAPTURE_JOB_STATUSES).toContain("completed");
      expect(CAPTURE_JOB_STATUSES).toContain("failed");
      expect(CAPTURE_JOB_STATUSES).toContain("cancelled");
      expect(CAPTURE_JOB_STATUSES).toHaveLength(5);
    });

    it("has valid CAPTURE_SOURCE_TYPES", () => {
      expect(CAPTURE_SOURCE_TYPES).toContain("flights");
      expect(CAPTURE_SOURCE_TYPES).toContain("earthquakes");
      expect(CAPTURE_SOURCE_TYPES).toContain("satellites");
      expect(CAPTURE_SOURCE_TYPES).toContain("weather");
      expect(CAPTURE_SOURCE_TYPES).toContain("bikeshare");
      expect(CAPTURE_SOURCE_TYPES).toContain("traffic");
      expect(CAPTURE_SOURCE_TYPES).toContain("cctv");
      expect(CAPTURE_SOURCE_TYPES).toContain("alerts");
      expect(CAPTURE_SOURCE_TYPES).toContain("events");
      expect(CAPTURE_SOURCE_TYPES).toHaveLength(9);
    });

    it("has valid FREEZE_STATUSES", () => {
      expect(FREEZE_STATUSES).toContain("none");
      expect(FREEZE_STATUSES).toContain("partial");
      expect(FREEZE_STATUSES).toContain("frozen");
      expect(FREEZE_STATUSES).toHaveLength(3);
    });
  });

  describe("CaptureJob interface", () => {
    it("should accept valid capture job", () => {
      const job: CaptureJob = {
        capture_job_id: "cap_test_123",
        incident_id: "inc_test_456",
        source_type: "flights",
        status: "pending",
        started_at: null,
        ended_at: null,
        snapshot_count: 0,
        error_code: null,
        error_message: null,
        freeze_status: "none",
        created_at: "2026-04-06T10:00:00Z",
        created_by: "operator_1",
      };

      expect(job.capture_job_id).toBe("cap_test_123");
      expect(job.source_type).toBe("flights");
      expect(job.status).toBe("pending");
      expect(job.freeze_status).toBe("none");
    });

    it("should accept running capture job with timestamps", () => {
      const job: CaptureJob = {
        capture_job_id: "cap_test_123",
        incident_id: "inc_test_456",
        source_type: "earthquakes",
        status: "running",
        started_at: "2026-04-06T10:05:00Z",
        ended_at: null,
        snapshot_count: 5,
        error_code: null,
        error_message: null,
        freeze_status: "none",
        created_at: "2026-04-06T10:00:00Z",
        created_by: "operator_1",
      };

      expect(job.status).toBe("running");
      expect(job.started_at).toBe("2026-04-06T10:05:00Z");
      expect(job.snapshot_count).toBe(5);
    });

    it("should accept completed capture job", () => {
      const job: CaptureJob = {
        capture_job_id: "cap_test_123",
        incident_id: "inc_test_456",
        source_type: "alerts",
        status: "completed",
        started_at: "2026-04-06T10:05:00Z",
        ended_at: "2026-04-06T10:10:00Z",
        snapshot_count: 12,
        error_code: null,
        error_message: null,
        freeze_status: "frozen",
        created_at: "2026-04-06T10:00:00Z",
        created_by: "operator_1",
      };

      expect(job.status).toBe("completed");
      expect(job.ended_at).toBe("2026-04-06T10:10:00Z");
      expect(job.freeze_status).toBe("frozen");
    });

    it("should accept failed capture job with error", () => {
      const job: CaptureJob = {
        capture_job_id: "cap_test_123",
        incident_id: "inc_test_456",
        source_type: "satellites",
        status: "failed",
        started_at: "2026-04-06T10:05:00Z",
        ended_at: "2026-04-06T10:06:00Z",
        snapshot_count: 2,
        error_code: "SOURCE_UNAVAILABLE",
        error_message: "Failed to fetch from external source",
        freeze_status: "none",
        created_at: "2026-04-06T10:00:00Z",
        created_by: "operator_1",
      };

      expect(job.status).toBe("failed");
      expect(job.error_code).toBe("SOURCE_UNAVAILABLE");
      expect(job.error_message).toBe("Failed to fetch from external source");
    });
  });

  describe("CaptureSnapshot interface", () => {
    it("should accept valid snapshot", () => {
      const snapshot: CaptureSnapshot = {
        snapshot_id: "snap_test_123",
        capture_job_id: "cap_test_456",
        source_type: "flights",
        external_id: "flight_abc123",
        observed_at: "2026-04-06T10:05:00Z",
        captured_at: "2026-04-06T10:06:00Z",
        payload: {
          object_id: "flight_abc123",
          lat: 40.7128,
          lon: -74.006,
          altitude_m: 10000,
        },
        metadata: {
          source_name: "Live Flights",
          record_count: 1,
          source_complete: true,
          raw_ref: null,
          adapter_version: "1.0.0",
        },
        frozen: false,
        frozen_at: null,
      };

      expect(snapshot.snapshot_id).toBe("snap_test_123");
      expect(snapshot.source_type).toBe("flights");
      expect(snapshot.payload.lat).toBe(40.7128);
      expect(snapshot.metadata.source_name).toBe("Live Flights");
      expect(snapshot.frozen).toBe(false);
    });

    it("should accept frozen snapshot", () => {
      const snapshot: CaptureSnapshot = {
        snapshot_id: "snap_test_123",
        capture_job_id: "cap_test_456",
        source_type: "earthquakes",
        external_id: "usgs_12345",
        observed_at: "2026-04-06T10:05:00Z",
        captured_at: "2026-04-06T10:06:00Z",
        payload: {
          magnitude: 5.2,
          place: "Near San Francisco",
        },
        metadata: {
          source_name: "USGS",
          record_count: 1,
          source_complete: true,
          raw_ref: "usgs_12345",
          adapter_version: "1.0.0",
        },
        frozen: true,
        frozen_at: "2026-04-06T11:00:00Z",
      };

      expect(snapshot.frozen).toBe(true);
      expect(snapshot.frozen_at).toBe("2026-04-06T11:00:00Z");
    });
  });

  describe("EvidenceFreeze interface", () => {
    it("should accept valid evidence freeze", () => {
      const freeze: EvidenceFreeze = {
        freeze_id: "frz_test_123",
        capture_job_id: "cap_test_456",
        incident_id: "inc_test_789",
        freeze_status: "frozen",
        total_snapshots: 25,
        frozen_snapshots: 25,
        source_type: "alerts",
        source_name: "Alerts",
        frozen_by: "operator_1",
        frozen_at: "2026-04-06T11:00:00Z",
        notes: "Full capture of all alerts during incident window",
      };

      expect(freeze.freeze_id).toBe("frz_test_123");
      expect(freeze.freeze_status).toBe("frozen");
      expect(freeze.total_snapshots).toBe(25);
      expect(freeze.frozen_snapshots).toBe(25);
      expect(freeze.notes).toBe("Full capture of all alerts during incident window");
    });

    it("should accept partial freeze", () => {
      const freeze: EvidenceFreeze = {
        freeze_id: "frz_test_123",
        capture_job_id: "cap_test_456",
        incident_id: "inc_test_789",
        freeze_status: "partial",
        total_snapshots: 50,
        frozen_snapshots: 30,
        source_type: "events",
        source_name: "Object Events",
        frozen_by: "operator_1",
        frozen_at: null,
        notes: null,
      };

      expect(freeze.freeze_status).toBe("partial");
      expect(freeze.frozen_snapshots).toBeLessThan(freeze.total_snapshots);
    });
  });

  describe("CreateCaptureJobRequest interface", () => {
    it("should accept valid create request", () => {
      const request: CreateCaptureJobRequest = {
        incident_id: "inc_test_123",
        source_type: "flights",
      };

      expect(request.incident_id).toBe("inc_test_123");
      expect(request.source_type).toBe("flights");
    });
  });
});
