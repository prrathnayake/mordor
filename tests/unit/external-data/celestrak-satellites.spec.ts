import { describe, expect, it, vi } from "vitest";
import { CelesTrakAdapter } from "../../../packages/external-data/src/adapters/celestrak-satellites.js";

// Mock the fetch API
global.fetch = vi.fn();

describe("CelesTrak Satellite Adapter", () => {
  const adapter = new CelesTrakAdapter();

  describe("source definition", () => {
    it("should have correct source metadata", () => {
      expect(adapter.source).toEqual({
        layerId: "satellites",
        label: "Satellites",
        provider: "CelesTrak (NASA/DoD)",
        sourceUrl: "https://celestrak.org/",
        license: "Public Domain",
        status: "real",
        updateCadenceSeconds: 3600,
        toggleable: true,
      });
    });
  });

  describe("fetchTLEs", () => {
    it("should return success with normalized satellite events", async () => {
      // Sample TLE data for ISS
      const tleData = `ISS (ZARYA)
1 25544U 98067A   24096.12345678  .00012345  00000-0  23456-3 0  9990
2 25544  51.6416  12.3456 0004567  45.6789  89.0123 15.50995519345678
HUBBLE SPACE TELESCOPE
1 20580U 90037B   24096.23456789  .00001234  00000-0  12345-4 0  9991
2 20580  28.4699  23.4567 0002671  78.9012  34.5678 15.09691045234567`;

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(tleData),
      });

      const result = await adapter.fetchTLEs("visual");

      expect(result.success).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Check first satellite (ISS)
      const issEvent = result.events.find((e) => e.externalId === "25544");
      expect(issEvent).toBeDefined();
      if (issEvent) {
        expect(issEvent.layerId).toBe("satellites");
        expect(issEvent.eventType).toBe("satellite_observed");
        expect(issEvent.payload.name).toBe("ISS (ZARYA)");
        expect(issEvent.payload.noradId).toBe("25544");
        expect(issEvent.payload.inclination).toBe(51.6416);
        expect(issEvent.payload.eccentricity).toBeCloseTo(0.0004567, 7);
        expect(issEvent.altitudeM).toBeGreaterThan(400000); // ISS altitude > 400km
      }

      // Check second satellite (HST)
      const hstEvent = result.events.find((e) => e.externalId === "20580");
      expect(hstEvent).toBeDefined();
      if (hstEvent) {
        expect(hstEvent.payload.name).toBe("HUBBLE SPACE TELESCOPE");
        expect(hstEvent.payload.noradId).toBe("20580");
      }
    });

    it("should return error on failed response", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const result = await adapter.fetchTLEs("visual");

      expect(result.success).toBe(false);
      expect(result.events).toHaveLength(0);
      expect(result.error).toContain("404");
    });

    it("should handle malformed TLE data gracefully", async () => {
      const malformedTleData = `INVALID SATELLITE
THIS IS NOT A VALID TLE
NOR IS THIS
ANOTHER VALID ONE
1 25544U 98067A   24096.12345678  .00012345  00000-0  23456-3 0  9990
2 25544  51.6416  12.3456 0004567  45.6789  89.0123 15.50995519345678`;

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(malformedTleData),
      });

      const result = await adapter.fetchTLEs("visual");

      // Should still parse the valid TLE
      expect(result.success).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);
    });
  });

  describe("getSatelliteStyle", () => {
    it("should return correct style for space_station", () => {
      const style = CelesTrakAdapter.getSatelliteStyle("space_station");
      expect(style.color).toBe("#fbbf24");
      expect(style.pixelSize).toBe(12);
    });

    it("should return correct style for starlink", () => {
      const style = CelesTrakAdapter.getSatelliteStyle("starlink");
      expect(style.color).toBe("#60a5fa");
      expect(style.pixelSize).toBe(6);
    });

    it("should return correct style for geo satellites", () => {
      const style = CelesTrakAdapter.getSatelliteStyle("geo");
      expect(style.color).toBe("#a78bfa");
      expect(style.pixelSize).toBe(8);
    });

    it("should return default style for unknown types", () => {
      const style = CelesTrakAdapter.getSatelliteStyle("unknown");
      expect(style.color).toBe("#9ca3af");
      expect(style.pixelSize).toBe(5);
    });
  });
});
