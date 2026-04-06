import { describe, expect, it } from "vitest";
import { MilitaryFlightsAdapter } from "../../../packages/external-data/src/adapters/military-flights.js";

describe("Military Flights Adapter", () => {
  const adapter = new MilitaryFlightsAdapter();

  describe("source definition", () => {
    it("should have correct source metadata indicating unavailability", () => {
      expect(adapter.source).toEqual({
        layerId: "military",
        label: "Military Flights",
        provider: "N/A",
        license: "N/A",
        status: "unavailable",
        updateCadenceSeconds: 0,
        toggleable: false,
      });
    });
  });

  describe("fetch", () => {
    it("should always return unavailable status", async () => {
      const result = await adapter.fetch();

      expect(result.success).toBe(false);
      expect(result.events).toHaveLength(0);
      expect(result.error).toContain("No legitimate open source available");
      expect(result.fetchedAt).toBeDefined();
      expect(result.durationMs).toBe(0);
    });
  });

  describe("getUnavailabilityReason", () => {
    it("should return detailed explanation for unavailability", () => {
      const reason = adapter.getUnavailabilityReason();

      expect(reason).toContain("Military aircraft tracking is intentionally unavailable");
      expect(reason).toContain("NO LEGITIMATE OPEN SOURCE");
      expect(reason).toContain("LEGAL CONCERNS");
      expect(reason).toContain("ETHICAL CONCERNS");
      expect(reason).toContain("DATA INTEGRITY");
    });
  });
});
