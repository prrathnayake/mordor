import { createCacheKey } from "./cache.js";

interface DataSourceCacheEntry<T> {
  data: T[];
  fetchedAt: number;
  expiresAt: number;
  etag: string | null;
  hitCount: number;
}

export class DataSourceCache {
  private store = new Map<string, DataSourceCacheEntry<unknown>>();
  private staleStore = new Map<string, DataSourceCacheEntry<unknown>>();
  private readonly defaultTtlMs: number;
  private readonly staleTtlMs: number;

  constructor(options: { defaultTtlMs?: number; staleTtlMs?: number } = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 60000;
    this.staleTtlMs = options.staleTtlMs ?? 300000;
    this.startEvictionLoop();
  }

  private startEvictionLoop(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (now > entry.expiresAt + this.staleTtlMs) {
          this.store.delete(key);
        }
      }
      for (const [key, entry] of this.staleStore) {
        if (now > entry.expiresAt + this.staleTtlMs) {
          this.staleStore.delete(key);
        }
      }
    }, 30000);
  }

  get<T>(key: string): { data: T[]; stale: boolean } | null {
    const entry = this.store.get(key);
    if (!entry) {
      const stale = this.staleStore.get(key);
      if (stale) {
        return { data: stale.data as T[], stale: true };
      }
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.staleStore.set(key, entry);
      this.store.delete(key);
      return { data: entry.data as T[], stale: true };
    }
    entry.hitCount++;
    return { data: entry.data as T[], stale: false };
  }

  set<T>(key: string, data: T[], etag?: string | null, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    const now = Date.now();
    this.store.set(key, {
      data,
      fetchedAt: now,
      expiresAt: now + ttl,
      etag: etag ?? null,
      hitCount: 0,
    });
  }

  invalidate(key: string): void {
    this.store.delete(key);
    this.staleStore.delete(key);
  }

  invalidatePattern(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
    for (const key of this.staleStore.keys()) {
      if (key.startsWith(prefix)) this.staleStore.delete(key);
    }
  }

  getStats(key: string): {
    cached: boolean;
    stale: boolean;
    ageMs: number | null;
    hitCount: number;
  } {
    const entry = this.store.get(key);
    if (entry) {
      return {
        cached: true,
        stale: false,
        ageMs: Date.now() - entry.fetchedAt,
        hitCount: entry.hitCount,
      };
    }
    const stale = this.staleStore.get(key);
    if (stale) {
      return {
        cached: true,
        stale: true,
        ageMs: Date.now() - stale.fetchedAt,
        hitCount: stale.hitCount,
      };
    }
    return { cached: false, stale: false, ageMs: null, hitCount: 0 };
  }

  get size(): number {
    return this.store.size + this.staleStore.size;
  }

  clear(): void {
    this.store.clear();
    this.staleStore.clear();
  }
}

let globalCache: DataSourceCache | null = null;

export function getGlobalDataSourceCache(): DataSourceCache {
  if (!globalCache) {
    globalCache = new DataSourceCache({
      defaultTtlMs: Number(process.env.UNIVERSAL_DATA_CACHE_TTL_MS) || 60000,
      staleTtlMs: Number(process.env.UNIVERSAL_DATA_STALE_TTL_MS) || 300000,
    });
  }
  return globalCache;
}

export function createDataSourceCacheKey(layerId: string, params?: Record<string, string>): string {
  return createCacheKey(layerId, params);
}
