import { createClient } from "redis";
import type { ObjectState } from "../../contracts/src/models.js";
import type { Logger } from "../../logging/src/index.js";

export interface LiveTrackPoint {
  lat: number;
  lon: number;
  altitude_m: number | null;
  observed_at: string;
  speed_mps: number | null;
  heading_deg: number | null;
}

export interface LiveWorldSnapshot {
  generated_at: string;
  source: "opensky";
  provider: string;
  status: "real" | "degraded";
  auth_mode: "authenticated" | "anonymous";
  states: ObjectState[];
  tracks: Record<string, LiveTrackPoint[]>;
  metadata: Record<string, unknown>;
}

export interface LiveWorldCache {
  getSnapshot(): Promise<LiveWorldSnapshot | null>;
  setSnapshot(snapshot: LiveWorldSnapshot, ttlMs: number): Promise<void>;
  getTrack(objectId: string, limit?: number): Promise<LiveTrackPoint[]>;
  close(): Promise<void>;
}

const REDIS_SNAPSHOT_KEY = "live-world:flights:snapshot";

class MemoryLiveWorldCache implements LiveWorldCache {
  private snapshot: LiveWorldSnapshot | null = null;

  async getSnapshot(): Promise<LiveWorldSnapshot | null> {
    return this.snapshot;
  }

  async setSnapshot(snapshot: LiveWorldSnapshot): Promise<void> {
    this.snapshot = snapshot;
  }

  async getTrack(objectId: string, limit: number = 24): Promise<LiveTrackPoint[]> {
    const track = this.snapshot?.tracks[objectId] ?? [];
    return track.slice(-limit);
  }

  async close(): Promise<void> {}
}

class RedisLiveWorldCache implements LiveWorldCache {
  constructor(private readonly client: ReturnType<typeof createClient>) {}

  async getSnapshot(): Promise<LiveWorldSnapshot | null> {
    const raw = await this.client.get(REDIS_SNAPSHOT_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as LiveWorldSnapshot;
    } catch {
      return null;
    }
  }

  async setSnapshot(snapshot: LiveWorldSnapshot, ttlMs: number): Promise<void> {
    await this.client.set(REDIS_SNAPSHOT_KEY, JSON.stringify(snapshot), {
      PX: ttlMs,
    });
  }

  async getTrack(objectId: string, limit: number = 24): Promise<LiveTrackPoint[]> {
    const snapshot = await this.getSnapshot();
    const track = snapshot?.tracks[objectId] ?? [];
    return track.slice(-limit);
  }

  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}

export async function createLiveWorldCache(input: {
  redisUrl?: string | null;
  logger: Logger;
}): Promise<LiveWorldCache> {
  if (!input.redisUrl) {
    input.logger.info("Live world cache using in-memory fallback");
    return new MemoryLiveWorldCache();
  }

  try {
    const client = createClient({
      url: input.redisUrl,
      socket: {
        reconnectStrategy: false,
      },
    });

    client.on("error", (error) => {
      input.logger.warn("Redis live world cache client error", {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    await client.connect();
    input.logger.info("Live world cache connected to Redis", {
      redis_url: input.redisUrl.replace(/:[^:@]+@/, ":***@"),
    });
    return new RedisLiveWorldCache(client);
  } catch (error) {
    input.logger.warn("Redis unavailable, falling back to in-memory live world cache", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new MemoryLiveWorldCache();
  }
}
