import { beforeEach, describe, expect, it, vi } from "vitest";
import { USGSEarthquakeAdapter } from "../../../packages/external-data/src/adapters/usgs-earthquakes.js";

// Mock the fetch API
global.fetch = vi.fn();

describe("USGS Earthquake Adapter", () => {
  let adapter: USGSEarthquakeAdapter;

  beforeEach(() => {
    vi.useRealTimers();
    (global.fetch as ReturnType<typeof vi.fn>).mockReset();
    adapter = new USGSEarthquakeAdapter();
  });

  describe("source definition", () => {
    it("should have correct source metadata", () => {
      expect(adapter.source).toEqual({
        layerId: "earthquakes",
        label: "Earthquakes (24h)",
        provider: "USGS",
        sourceUrl: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php",
        license: "Public Domain",
        status: "real",
        updateCadenceSeconds: 300,
        toggleable: true,
      });
    });
  });

  describe("fetch", () => {
    it("should return success with normalized events on valid response", async () => {
      const mockResponse = {
        type: "FeatureCollection",
        metadata: {
          generated: Date.now(),
          url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
          title: "USGS Magnitude 2.5+ Earthquakes, Past Day",
          status: 200,
          api: "1.10.3",
          count: 2,
        },
        features: [
          {
            type: "Feature",
            properties: {
              mag: 4.5,
              place: "10 km S of Example City",
              time: 1712345678901,
              updated: 1712345678901,
              tz: null,
              url: "https://earthquake.usgs.gov/earthquakes/eventpage/us1234abcd",
              detail: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/us1234abcd.geojson",
              felt: null,
              cdi: null,
              mmi: null,
              alert: null,
              status: "automatic",
              tsunami: 0,
              sig: 312,
              net: "us",
              code: "1234abcd",
              ids: ",us1234abcd,",
              sources: ",us,",
              types: ",origin,phase-data,",
              nst: 45,
              dmin: 0.456,
              rms: 0.67,
              gap: 78,
              magType: "mb",
              type: "earthquake",
              title: "M 4.5 - 10 km S of Example City",
            },
            geometry: {
              type: "Point",
              coordinates: [-122.123, 37.456, 10.5],
            },
            id: "us1234abcd",
          },
          {
            type: "Feature",
            properties: {
              mag: 6.2,
              place: "50 km NW of Another City",
              time: 1712341234567,
              updated: 1712341234567,
              tz: null,
              url: "https://earthquake.usgs.gov/earthquakes/eventpage/us5678efgh",
              detail: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/us5678efgh.geojson",
              felt: 15,
              cdi: 4.5,
              mmi: null,
              alert: null,
              status: "reviewed",
              tsunami: 0,
              sig: 589,
              net: "us",
              code: "5678efgh",
              ids: ",us5678efgh,",
              sources: ",us,",
              types: ",origin,phase-data,",
              nst: 120,
              dmin: 1.234,
              rms: 0.45,
              gap: 45,
              magType: "mww",
              type: "earthquake",
              title: "M 6.2 - 50 km NW of Another City",
            },
            geometry: {
              type: "Point",
              coordinates: [-150.789, 61.234, 25.0],
            },
            id: "us5678efgh",
          },
        ],
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockResponse),
      });

      const result = await adapter.fetch();

      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(2);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Check first event normalization
      const firstEvent = result.events[0];
      expect(firstEvent.eventId).toBe("eq_us1234abcd");
      expect(firstEvent.externalId).toBe("us1234abcd");
      expect(firstEvent.layerId).toBe("earthquakes");
      expect(firstEvent.eventType).toBe("earthquake_observed");
      expect(firstEvent.lat).toBe(37.456);
      expect(firstEvent.lon).toBe(-122.123);
      expect(firstEvent.altitudeM).toBe(-10.5); // Negative depth
      expect(firstEvent.payload.magnitude).toBe(4.5);
      expect(firstEvent.payload.place).toBe("10 km S of Example City");
      expect(firstEvent.payload.depthKm).toBe(10.5);
      expect(firstEvent.payload.status).toBe("automatic");
      expect(firstEvent.payload.tsunami).toBe(false);

      // Check second event (higher magnitude)
      const secondEvent = result.events[1];
      expect(secondEvent.payload.magnitude).toBe(6.2);
      expect(secondEvent.payload.feltReports).toBe(15);
    });

    it("should return error on failed response", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      const result = await adapter.fetch();

      expect(result.success).toBe(false);
      expect(result.events).toHaveLength(0);
      expect(result.error).toContain("503");
      expect(result.statusCode).toBe(503);
    });

    it("should return error on network failure", async () => {
      vi.useFakeTimers();
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

      const resultPromise = adapter.fetch();
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      vi.useRealTimers();

      expect(result.success).toBe(false);
      expect(result.events).toHaveLength(0);
      expect(result.error).toContain("Network error");
    });
  });

  describe("fetchRange", () => {
    it("should fetch earthquakes for a specific date range", async () => {
      const mockResponse = {
        type: "FeatureCollection",
        metadata: { count: 1 },
        features: [
          {
            type: "Feature",
            properties: {
              mag: 3.0,
              place: "Test Location",
              time: 1712345678901,
              status: "automatic",
              tsunami: 0,
              sig: 100,
              magType: "ml",
              type: "earthquake",
            },
            geometry: {
              type: "Point",
              coordinates: [-120, 35, 5],
            },
            id: "test123",
          },
        ],
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const startTime = new Date("2024-04-01T00:00:00Z");
      const endTime = new Date("2024-04-02T00:00:00Z");

      const result = await adapter.fetchRange(startTime, endTime, 2.5);

      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);

      // Verify URL was constructed correctly
      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = new URL(fetchCall[0]);
      expect(url.searchParams.get("starttime")).toBe("2024-04-01T00:00:00");
      expect(url.searchParams.get("endtime")).toBe("2024-04-02T00:00:00");
      expect(url.searchParams.get("minmagnitude")).toBe("2.5");
    });
  });

  describe("getMagnitudeColor", () => {
    it("should return green for magnitude < 4", () => {
      expect(USGSEarthquakeAdapter.getMagnitudeColor(3.5)).toBe("#4ade80");
    });

    it("should return yellow for magnitude 4-6", () => {
      expect(USGSEarthquakeAdapter.getMagnitudeColor(4.5)).toBe("#facc15");
      expect(USGSEarthquakeAdapter.getMagnitudeColor(5.9)).toBe("#facc15");
    });

    it("should return orange for magnitude 6-7", () => {
      expect(USGSEarthquakeAdapter.getMagnitudeColor(6.5)).toBe("#fb923c");
    });

    it("should return red for magnitude >= 7", () => {
      expect(USGSEarthquakeAdapter.getMagnitudeColor(7.0)).toBe("#ef4444");
      expect(USGSEarthquakeAdapter.getMagnitudeColor(8.5)).toBe("#ef4444");
    });
  });

  describe("getMagnitudeSize", () => {
    it("should return size scaled with magnitude", () => {
      const size3 = USGSEarthquakeAdapter.getMagnitudeSize(3.0);
      const size5 = USGSEarthquakeAdapter.getMagnitudeSize(5.0);
      const size7 = USGSEarthquakeAdapter.getMagnitudeSize(7.0);

      expect(size5).toBeGreaterThan(size3);
      expect(size7).toBeGreaterThan(size5);
    });
  });
});
