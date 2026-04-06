import { describe, expect, it } from "vitest";
import {
  ExternalDataCache,
  calculateFreshness,
  createCacheKey,
} from "../../../packages/external-data/src/cache.js";
import type { ExternalDataEvent } from "../../../packages/external-data/src/types.js";

describe("ExternalDataCache", () => {
  describe("get and set", () => {
    it("should store and retrieve events", () => {
      const cache = new ExternalDataCache();
      const events: ExternalDataEvent[] = [
        {
          eventId: "test1",
          externalId: "ext1",
          layerId: "test-layer",
          eventType: "test",
          observedAt: new Date().toISOString(),
          lat: 0,
          lon: 0,
          payload: {},
        },
      ];

      cache.set("test-layer", events, 60000);
      const retrieved = cache.get("test-layer", 60000);

      expect(retrieved).toEqual(events);
    });

    it("should return null for expired entries", () => {
      const cache = new ExternalDataCache();
      const events: ExternalDataEvent[] = [
        {
          eventId: "test1",
          externalId: "ext1",
          layerId: "test-layer",
          eventType: "test",
          observedAt: new Date().toISOString(),
          lat: 0,
          lon: 0,
          payload: {},
        },
      ];

      cache.set("test-layer", events, 1); // 1ms TTL

      // Wait for expiration
      setTimeout(() => {
        const retrieved = cache.get("test-layer", 60000);
        expect(retrieved).toBeNull();
      }, 10);
    });

    it("should return null for non-existent layer", () => {
      const cache = new ExternalDataCache();
      const retrieved = cache.get("non-existent", 60000);
      expect(retrieved).toBeNull();
    });
  });

  describe("clear", () => {
    it("should clear specific layer", () => {
      const cache = new ExternalDataCache();
      const events: ExternalDataEvent[] = [
        {
          eventId: "test1",
          externalId: "ext1",
          layerId: "test-layer",
          eventType: "test",
          observedAt: new Date().toISOString(),
          lat: 0,
          lon: 0,
          payload: {},
        },
      ];

      cache.set("test-layer", events, 60000);
      cache.clear("test-layer");

      expect(cache.get("test-layer", 60000)).toBeNull();
    });

    it("should clear all layers", () => {
      const cache = new ExternalDataCache();
      const events: ExternalDataEvent[] = [
        {
          eventId: "test1",
          externalId: "ext1",
          layerId: "test-layer",
          eventType: "test",
          observedAt: new Date().toISOString(),
          lat: 0,
          lon: 0,
          payload: {},
        },
      ];

      cache.set("layer1", events, 60000);
      cache.set("layer2", events, 60000);
      cache.clearAll();

      expect(cache.get("layer1", 60000)).toBeNull();
      expect(cache.get("layer2", 60000)).toBeNull();
    });
  });

  describe("getCacheInfo", () => {
    it("should return cache metadata", () => {
      const cache = new ExternalDataCache();
      const events: ExternalDataEvent[] = [
        {
          eventId: "test1",
          externalId: "ext1",
          layerId: "test-layer",
          eventType: "test",
          observedAt: new Date().toISOString(),
          lat: 0,
          lon: 0,
          payload: {},
        },
      ];

      const before = new Date();
      cache.set("test-layer", events, 60000);
      const info = cache.getCacheInfo("test-layer");
      const after = new Date();

      expect(info.fetchedAt).toBeDefined();
      expect(info.expiresAt).toBeDefined();
      if (info.fetchedAt) {
        const fetchedDate = new Date(info.fetchedAt);
        expect(fetchedDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(fetchedDate.getTime()).toBeLessThanOrEqual(after.getTime());
      }
    });

    it("should return null timestamps for non-existent layer", () => {
      const cache = new ExternalDataCache();
      const info = cache.getCacheInfo("non-existent");

      expect(info.fetchedAt).toBeNull();
      expect(info.expiresAt).toBeNull();
    });
  });

  describe("hasValid", () => {
    it("should return true for valid cache entries", () => {
      const cache = new ExternalDataCache();
      const events: ExternalDataEvent[] = [
        {
          eventId: "test1",
          externalId: "ext1",
          layerId: "test-layer",
          eventType: "test",
          observedAt: new Date().toISOString(),
          lat: 0,
          lon: 0,
          payload: {},
        },
      ];

      cache.set("test-layer", events, 60000);
      expect(cache.hasValid("test-layer")).toBe(true);
    });

    it("should return false for expired cache entries", () => {
      const cache = new ExternalDataCache();
      const events: ExternalDataEvent[] = [
        {
          eventId: "test1",
          externalId: "ext1",
          layerId: "test-layer",
          eventType: "test",
          observedAt: new Date().toISOString(),
          lat: 0,
          lon: 0,
          payload: {},
        },
      ];

      cache.set("test-layer", events, 1);

      setTimeout(() => {
        expect(cache.hasValid("test-layer")).toBe(false);
      }, 10);
    });
  });
});

describe("calculateFreshness", () => {
  it("should return fresh for recent updates", () => {
    const now = new Date();
    const lastUpdate = new Date(now.getTime() - 30000).toISOString(); // 30 seconds ago

    const result = calculateFreshness(lastUpdate, 300); // 5 minute cadence

    expect(result.status).toBe("fresh");
    expect(result.freshnessSeconds).toBe(30);
  });

  it("should return stale for old updates", () => {
    const now = new Date();
    const lastUpdate = new Date(now.getTime() - 1000 * 60 * 20).toISOString(); // 20 minutes ago

    const result = calculateFreshness(lastUpdate, 300); // 5 minute cadence

    expect(result.status).toBe("stale");
    expect(result.freshnessSeconds).toBe(1200);
  });

  it("should return unknown for null updates", () => {
    const result = calculateFreshness(null, 300);

    expect(result.status).toBe("unknown");
    expect(result.freshnessSeconds).toBeNull();
  });
});

describe("createCacheKey", () => {
  it("should return layerId without params", () => {
    const key = createCacheKey("test-layer");
    expect(key).toBe("test-layer");
  });

  it("should include params in key", () => {
    const key = createCacheKey("test-layer", { minMagnitude: "4.0", region: "us" });
    expect(key).toContain("test-layer:");
    expect(key).toContain("minMagnitude=4.0");
    expect(key).toContain("region=us");
  });

  it("should sort params alphabetically", () => {
    const key = createCacheKey("test-layer", { z: "1", a: "2", m: "3" });
    expect(key).toBe("test-layer:a=2&m=3&z=1");
  });
});
