import { describe, expect, it } from "vitest";

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculatePolygonArea(coordinates: Array<[number, number]>): number {
  if (coordinates.length < 3) return 0;
  let area = 0;
  const n = coordinates.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coordinates[i][0] * coordinates[j][1];
    area -= coordinates[j][0] * coordinates[i][1];
  }
  area = Math.abs(area) / 2;
  const avgLat = coordinates.reduce((sum, c) => sum + c[1], 0) / n;
  const latDegToKm = 111.32;
  const lonDegToKm = 111.32 * Math.cos((avgLat * Math.PI) / 180);
  return area * latDegToKm * lonDegToKm;
}

describe("Inference Utilities", () => {
  describe("calculateDistance", () => {
    it("should return 0 for same coordinates", () => {
      const dist = calculateDistance(-33.8688, 151.2093, -33.8688, 151.2093);
      expect(dist).toBeCloseTo(0, 0);
    });

    it("should calculate distance between Sydney and Melbourne (~713km)", () => {
      const dist = calculateDistance(-33.8688, 151.2093, -37.8136, 144.9631);
      expect(dist).toBeGreaterThan(700000);
      expect(dist).toBeLessThan(750000);
    });

    it("should calculate short distance accurately", () => {
      const dist = calculateDistance(-33.8688, 151.2093, -33.87, 151.21);
      expect(dist).toBeGreaterThan(100);
      expect(dist).toBeLessThan(300);
    });

    it("should detect distances over 500 meters", () => {
      const dist = calculateDistance(-33.8688, 151.2093, -33.88, 151.23);
      expect(dist).toBeGreaterThan(2000);
    });

    it("should detect significant deviations over 5km", () => {
      const dist = calculateDistance(-33.8688, 151.2093, -33.92, 151.28);
      expect(dist).toBeGreaterThan(5000);
    });
  });

  describe("calculatePolygonArea", () => {
    it("should return 0 for less than 3 coordinates", () => {
      expect(calculatePolygonArea([])).toBe(0);
      expect(calculatePolygonArea([[0, 0]])).toBe(0);
      expect(
        calculatePolygonArea([
          [0, 0],
          [1, 1],
        ]),
      ).toBe(0);
    });

    it("should calculate area for positive coordinates", () => {
      const coords: Array<[number, number]> = [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ];
      const area = calculatePolygonArea(coords);
      expect(area).toBeGreaterThan(0);
    });
  });

  describe("Degradation Detection Logic", () => {
    it("should classify minor degradation correctly", () => {
      const slowPercent = 0.2;
      const severity = slowPercent >= 0.5 ? "severe" : slowPercent >= 0.3 ? "moderate" : "minor";
      expect(severity).toBe("minor");
    });

    it("should classify moderate degradation correctly", () => {
      const slowPercent = 0.35;
      const severity = slowPercent >= 0.5 ? "severe" : slowPercent >= 0.3 ? "moderate" : "minor";
      expect(severity).toBe("moderate");
    });

    it("should classify severe degradation correctly", () => {
      const slowPercent = 0.6;
      const severity = slowPercent >= 0.5 ? "severe" : slowPercent >= 0.3 ? "moderate" : "minor";
      expect(severity).toBe("severe");
    });

    it("should calculate confidence based on slow percent", () => {
      const slowPercent = 0.4;
      const confidence = Math.min(0.95, 0.3 + slowPercent * 0.6);
      expect(confidence).toBeCloseTo(0.54, 1);
    });
  });

  describe("Route Redirection Logic", () => {
    it("should detect deviation over threshold", () => {
      const deviationThresholdMeters = 500;
      const maxDeviation = 1000;
      const detected = maxDeviation >= deviationThresholdMeters;
      expect(detected).toBe(true);
    });

    it("should not detect deviation below threshold", () => {
      const deviationThresholdMeters = 500;
      const maxDeviation = 200;
      const detected = maxDeviation >= deviationThresholdMeters;
      expect(detected).toBe(false);
    });

    it("should identify significant deviation cause", () => {
      const deviation = 6000;
      const cause =
        deviation > 5000
          ? "Significant route deviation"
          : deviation > 2000
            ? "Moderate route deviation"
            : "Unknown";
      expect(cause).toBe("Significant route deviation");
    });

    it("should calculate confidence based on deviation", () => {
      const maxDeviation = 3000;
      const confidence = Math.min(0.95, 0.4 + (maxDeviation / 10000) * 0.5);
      expect(confidence).toBeCloseTo(0.55, 1);
    });
  });

  describe("Holding Pattern Logic", () => {
    it("should calculate center point correctly", () => {
      const positions = [
        { lat: -33.8688, lon: 151.2093 },
        { lat: -33.87, lon: 151.21 },
        { lat: -33.869, lon: 151.208 },
      ];
      const centerLat = positions.reduce((sum, p) => sum + p.lat, 0) / positions.length;
      const centerLon = positions.reduce((sum, p) => sum + p.lon, 0) / positions.length;
      expect(centerLat).toBeCloseTo(-33.8693, 3);
      expect(centerLon).toBeCloseTo(151.2091, 3);
    });

    it("should identify orbit types correctly", () => {
      const tightOrbit = calculateDistance(-33.8688, 151.2093, -33.8698, 151.2103);
      const orbitType1 =
        tightOrbit < 1000 ? "tight_orbit" : tightOrbit < 3000 ? "standard_holding" : "wide_orbit";
      expect(orbitType1).toBe("tight_orbit");

      const standardOrbit = calculateDistance(-33.8688, 151.2093, -33.8888, 151.2293);
      const orbitType2 =
        standardOrbit < 1000
          ? "tight_orbit"
          : standardOrbit < 3000
            ? "standard_holding"
            : "wide_orbit";
      expect(orbitType2).toBe("standard_holding");
    });

    it("should calculate heading changes correctly", () => {
      const headings = [0, 90, 180, 270, 0, 90, 180, 270];
      let headingChanges = 0;
      for (let i = 0; i < headings.length - 1; i++) {
        let diff = Math.abs(headings[i + 1] - headings[i]);
        if (diff > 180) diff = 360 - diff;
        headingChanges += diff;
      }
      expect(headingChanges).toBe(630);
    });

    it("should calculate confidence based on loops and duration", () => {
      const loopCount = 3;
      const durationSeconds = 1800;
      const confidence = Math.min(0.95, 0.3 + loopCount * 0.15 + (durationSeconds / 3600) * 0.2);
      expect(confidence).toBeCloseTo(0.85, 1);
    });
  });

  describe("Absence Signal Logic", () => {
    it("should calculate thinning percent correctly", () => {
      const expectedCount = 10;
      const observedCount = 2;
      const thinningPercent = Math.max(0, ((expectedCount - observedCount) / expectedCount) * 100);
      expect(thinningPercent).toBe(80);
    });

    it("should identify source blackout when count is zero", () => {
      const observedCount = 0;
      const sourceBlackout = observedCount === 0;
      expect(sourceBlackout).toBe(true);
    });

    it("should calculate confidence for source blackout", () => {
      const sourceBlackout = true;
      const confidence = sourceBlackout ? 0.9 : 0.5;
      expect(confidence).toBe(0.9);
    });

    it("should calculate confidence based on thinning", () => {
      const thinningPercent = 60;
      const sourceBlackout = false;
      const confidence = sourceBlackout
        ? 0.9
        : thinningPercent >= 50
          ? 0.7
          : thinningPercent >= 30
            ? 0.5
            : 0.3;
      expect(confidence).toBe(0.7);
    });
  });

  describe("Confidence Level Classification", () => {
    it("should classify very_high for confidence >= 0.9", () => {
      const level = (c: number) =>
        c >= 0.9 ? "very_high" : c >= 0.7 ? "high" : c >= 0.5 ? "medium" : "low";
      expect(level(0.9)).toBe("very_high");
      expect(level(0.95)).toBe("very_high");
    });

    it("should classify high for confidence >= 0.7 and < 0.9", () => {
      const level = (c: number) =>
        c >= 0.9 ? "very_high" : c >= 0.7 ? "high" : c >= 0.5 ? "medium" : "low";
      expect(level(0.7)).toBe("high");
      expect(level(0.85)).toBe("high");
    });

    it("should classify medium for confidence >= 0.5 and < 0.7", () => {
      const level = (c: number) =>
        c >= 0.9 ? "very_high" : c >= 0.7 ? "high" : c >= 0.5 ? "medium" : "low";
      expect(level(0.5)).toBe("medium");
      expect(level(0.65)).toBe("medium");
    });

    it("should classify low for confidence < 0.5", () => {
      const level = (c: number) =>
        c >= 0.9 ? "very_high" : c >= 0.7 ? "high" : c >= 0.5 ? "medium" : "low";
      expect(level(0.49)).toBe("low");
      expect(level(0.1)).toBe("low");
    });
  });
});
