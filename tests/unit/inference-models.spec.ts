import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_LEVELS,
  calculateConfidenceLevel,
  formatEvidenceSummary,
  INFERENCE_STATUSES,
  INFERENCE_TYPES,
} from "../../packages/contracts/src/inference-models.js";

describe("inference models", () => {
  describe("constants", () => {
    it("has valid INFERENCE_TYPES", () => {
      expect(INFERENCE_TYPES).toContain("nav_degradation");
      expect(INFERENCE_TYPES).toContain("route_redirection");
      expect(INFERENCE_TYPES).toContain("holding_pattern");
      expect(INFERENCE_TYPES).toContain("absence_signal");
      expect(INFERENCE_TYPES).toContain("anomaly");
      expect(INFERENCE_TYPES).toHaveLength(5);
    });

    it("has valid INFERENCE_STATUSES", () => {
      expect(INFERENCE_STATUSES).toContain("active");
      expect(INFERENCE_STATUSES).toContain("resolved");
      expect(INFERENCE_STATUSES).toContain("expired");
      expect(INFERENCE_STATUSES).toContain("invalidated");
      expect(INFERENCE_STATUSES).toHaveLength(4);
    });

    it("has valid CONFIDENCE_LEVELS", () => {
      expect(CONFIDENCE_LEVELS).toContain("very_high");
      expect(CONFIDENCE_LEVELS).toContain("high");
      expect(CONFIDENCE_LEVELS).toContain("medium");
      expect(CONFIDENCE_LEVELS).toContain("low");
      expect(CONFIDENCE_LEVELS).toHaveLength(4);
    });
  });

  describe("calculateConfidenceLevel", () => {
    it("should return very_high for confidence >= 0.9", () => {
      expect(calculateConfidenceLevel(0.9)).toBe("very_high");
      expect(calculateConfidenceLevel(0.95)).toBe("very_high");
      expect(calculateConfidenceLevel(1.0)).toBe("very_high");
    });

    it("should return high for confidence >= 0.7 and < 0.9", () => {
      expect(calculateConfidenceLevel(0.7)).toBe("high");
      expect(calculateConfidenceLevel(0.85)).toBe("high");
    });

    it("should return medium for confidence >= 0.5 and < 0.7", () => {
      expect(calculateConfidenceLevel(0.5)).toBe("medium");
      expect(calculateConfidenceLevel(0.65)).toBe("medium");
    });

    it("should return low for confidence < 0.5", () => {
      expect(calculateConfidenceLevel(0.49)).toBe("low");
      expect(calculateConfidenceLevel(0.0)).toBe("low");
    });
  });

  describe("formatEvidenceSummary", () => {
    it("should format nav_degradation summary", () => {
      const details = {
        severity: "moderate",
        affected_area_sqkm: 50.5,
        degraded_signals: 5,
        total_signals: 10,
      };

      const summary = formatEvidenceSummary("nav_degradation", details);
      expect(summary).toContain("moderate");
      expect(summary).toContain("navigation degradation");
      expect(summary).toContain("50.5");
      expect(summary).toContain("5/10");
    });

    it("should format route_redirection summary", () => {
      const details = {
        object_id: "veh_42",
        original_path: [],
        actual_path: [],
        deviation_meters: 450.7,
        deviation_point: { lat: 0, lon: 0 },
      };

      const summary = formatEvidenceSummary("route_redirection", details);
      expect(summary).toContain("451m");
      expect(summary).toContain("veh_42");
    });

    it("should format holding_pattern summary", () => {
      const details = {
        object_id: "flight_UA123",
        center_point: { lat: -33.8688, lon: 151.2093 },
        radius_meters: 2500,
        loop_count: 4,
        duration_seconds: 240,
        heading_changes: 720,
      };

      const summary = formatEvidenceSummary("holding_pattern", details);
      expect(summary).toContain("4 orbit loops");
      expect(summary).toContain("240s");
      expect(summary).toContain("-33.8688");
    });

    it("should format absence_signal summary with source blackout", () => {
      const details = {
        signal_type: "adsb",
        affected_layer: "flights",
        thinning_percent: 80,
        expected_count: 100,
        observed_count: 20,
        source_blackout: true,
      };

      const summary = formatEvidenceSummary("absence_signal", details);
      expect(summary).toContain("Source blackout");
      expect(summary).toContain("flights");
    });

    it("should format absence_signal summary with thinning", () => {
      const details = {
        signal_type: "adsb",
        affected_layer: "flights",
        thinning_percent: 50,
        expected_count: 100,
        observed_count: 50,
        source_blackout: false,
      };

      const summary = formatEvidenceSummary("absence_signal", details);
      expect(summary).toContain("50%");
      expect(summary).toContain("flights");
      expect(summary).toContain("50/100");
    });

    it("should format anomaly summary", () => {
      const details = {
        severity: "unusual_pattern",
      };

      const summary = formatEvidenceSummary("anomaly", details);
      expect(summary).toContain("Anomaly detected");
      expect(summary).toContain("unusual_pattern");
    });
  });
});
