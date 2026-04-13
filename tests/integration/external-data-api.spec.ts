import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresPersistenceGateway } from "../../packages/persistence/src/index.js";
import { startPostgresTestEnvironment } from "../helpers/postgres-test-environment.js";

// Skip these tests if running in CI without Docker
const describeIfDocker = process.env.CI && !process.env.DOCKER_HOST ? describe.skip : describe;

describeIfDocker("External Data Layer API Integration", () => {
  let environment: Awaited<ReturnType<typeof startPostgresTestEnvironment>>;
  let persistence: PostgresPersistenceGateway;

  beforeAll(async () => {
    environment = await startPostgresTestEnvironment();
    persistence = PostgresPersistenceGateway.fromConnectionString(environment.connection_string);
  }, 120000);

  afterAll(async () => {
    await persistence?.close();
    await environment?.stop();
  });

  describe("External Data Layer Persistence", () => {
    it("should fetch initial layer definitions from migration", async () => {
      const layers = await persistence.fetchExternalDataLayers();

      expect(layers).toHaveLength(6);

      const earthquakes = layers.find((l) => l.layer_id === "earthquakes");
      expect(earthquakes).toBeDefined();
      expect(earthquakes?.source_name).toBe("USGS");
      expect(earthquakes?.status).toBe("real");

      const satellites = layers.find((l) => l.layer_id === "satellites");
      expect(satellites).toBeDefined();
      expect(satellites?.source_name).toBe("CelesTrak (NASA/DoD)");
      expect(satellites?.status).toBe("real");

      const military = layers.find((l) => l.layer_id === "military");
      expect(military).toBeDefined();
      expect(military?.status).toBe("unavailable");
    });

    it("should update layer metadata", async () => {
      await persistence.updateExternalDataLayer({
        layer_id: "earthquakes",
        status: "real",
        record_count: 42,
        error_message: undefined,
        raw_data: { test: "data" },
      });

      const layer = await persistence.fetchExternalDataLayer("earthquakes");
      expect(layer).toBeDefined();
      expect(layer?.status).toBe("real");
      expect(layer?.record_count).toBe(42);
      expect(layer?.raw_data).toEqual({ test: "data" });
      expect(layer?.last_fetch_at).toBeDefined();
    });

    it("should persist and fetch external data events", async () => {
      const events = [
        {
          event_id: "eq_test_1",
          external_id: "us1234",
          event_type: "earthquake_observed",
          observed_at: new Date().toISOString(),
          lat: 37.7749,
          lon: -122.4194,
          altitude_m: -10.5,
          payload: { magnitude: 4.5, place: "San Francisco" },
        },
        {
          event_id: "eq_test_2",
          external_id: "us5678",
          event_type: "earthquake_observed",
          observed_at: new Date().toISOString(),
          lat: 34.0522,
          lon: -118.2437,
          altitude_m: -5.0,
          payload: { magnitude: 3.2, place: "Los Angeles" },
        },
      ];

      await persistence.persistExternalDataEvents("earthquakes", events);

      const fetched = await persistence.fetchExternalDataEvents("earthquakes");

      expect(fetched).toHaveLength(2);

      const sf = fetched.find((e) => e.external_id === "us1234");
      expect(sf).toBeDefined();
      expect(sf?.lat).toBe(37.7749);
      expect(sf?.lon).toBe(-122.4194);
      expect(sf?.payload.magnitude).toBe(4.5);

      const la = fetched.find((e) => e.external_id === "us5678");
      expect(la).toBeDefined();
      expect(la?.lat).toBe(34.0522);
      expect(la?.lon).toBe(-118.2437);
    });

    it("should clear external data events", async () => {
      await persistence.clearExternalDataEvents("earthquakes");

      const fetched = await persistence.fetchExternalDataEvents("earthquakes");
      expect(fetched).toHaveLength(0);
    });

    it("should handle updates with deduplication", async () => {
      const events = [
        {
          event_id: "eq_dedup_1",
          external_id: "us9999",
          event_type: "earthquake_observed",
          observed_at: new Date().toISOString(),
          lat: 40.7128,
          lon: -74.006,
          payload: { magnitude: 3.0 },
        },
      ];

      // Insert first time
      await persistence.persistExternalDataEvents("earthquakes", events);

      // Update same external ID
      const updatedEvents = [
        {
          ...events[0],
          lat: 41.0, // Changed location
          payload: { magnitude: 3.5 }, // Changed magnitude
        },
      ];

      await persistence.persistExternalDataEvents("earthquakes", updatedEvents);

      const fetched = await persistence.fetchExternalDataEvents("earthquakes");

      // Should only have 1 event (updated)
      expect(fetched).toHaveLength(1);
      expect(fetched[0]?.lat).toBe(41.0);
      expect(fetched[0]?.payload.magnitude).toBe(3.5);
    });
  });
});
