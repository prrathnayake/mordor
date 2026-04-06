/**
 * External Data Cache
 *
 * In-memory cache for external data with TTL support.
 * Provides caching for external data events with expiration.
 */

import type { CacheEntry, ExternalDataEvent } from "./types.js";

export class ExternalDataCache {
  private cache = new Map<string, CacheEntry>();

  /**
   * Get cached events for a layer if not expired.
   */
  get(layerId: string, _maxAgeMs: number): ExternalDataEvent[] | null {
    const entry = this.cache.get(layerId);
    if (!entry) {
      return null;
    }

    const now = new Date().toISOString();
    if (new Date(entry.expiresAt) < new Date(now)) {
      this.cache.delete(layerId);
      return null;
    }

    return entry.events;
  }

  /**
   * Store events in the cache.
   */
  set(layerId: string, events: ExternalDataEvent[], ttlMs: number): void {
    const now = new Date();
    const entry: CacheEntry = {
      layerId,
      events,
      fetchedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    this.cache.set(layerId, entry);
  }

  /**
   * Clear cache for a specific layer.
   */
  clear(layerId: string): void {
    this.cache.delete(layerId);
  }

  /**
   * Clear all cached data.
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Get cache metadata for a layer.
   */
  getCacheInfo(layerId: string): { fetchedAt: string | null; expiresAt: string | null } {
    const entry = this.cache.get(layerId);
    if (!entry) {
      return { fetchedAt: null, expiresAt: null };
    }
    return {
      fetchedAt: entry.fetchedAt,
      expiresAt: entry.expiresAt,
    };
  }

  /**
   * Check if cache has valid data for a layer.
   */
  hasValid(layerId: string): boolean {
    const entry = this.cache.get(layerId);
    if (!entry) {
      return false;
    }
    return new Date(entry.expiresAt) > new Date();
  }

  /**
   * Get all valid layer IDs in cache.
   */
  getValidLayerIds(): string[] {
    const valid: string[] = [];
    const now = new Date();

    for (const [layerId, entry] of this.cache.entries()) {
      if (new Date(entry.expiresAt) > now) {
        valid.push(layerId);
      } else {
        this.cache.delete(layerId);
      }
    }

    return valid;
  }
}

/**
 * Calculate freshness status based on last update time and expected cadence.
 */
export function calculateFreshness(
  lastUpdate: string | null,
  updateCadenceSeconds: number,
): { status: "fresh" | "stale" | "unknown"; freshnessSeconds: number | null } {
  if (!lastUpdate) {
    return { status: "unknown", freshnessSeconds: null };
  }

  const lastUpdateTime = new Date(lastUpdate).getTime();
  const now = Date.now();
  const freshnessSeconds = Math.floor((now - lastUpdateTime) / 1000);

  // Consider stale if more than 2x the update cadence has passed
  const staleThreshold = updateCadenceSeconds * 2;

  if (freshnessSeconds > staleThreshold) {
    return { status: "stale", freshnessSeconds };
  }

  return { status: "fresh", freshnessSeconds };
}

/**
 * Create a cache key for a layer with optional parameters.
 */
export function createCacheKey(layerId: string, params?: Record<string, string>): string {
  if (!params) {
    return layerId;
  }

  const paramString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  return `${layerId}:${paramString}`;
}
