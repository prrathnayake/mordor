import type { ObjectState, Source } from "../../../packages/contracts/src/models.js";
import {
  createCelesTrakAdapter,
  createCityBikesAdapter,
  createNOAAWeatherAdapter,
  createOpenSkyFlightsAdapter,
  createStreetTrafficAdapter,
  createUSGSEarthquakeAdapter,
  type ExternalDataEvent,
} from "../../../packages/external-data/src/index.js";
import {
  createLiveWorldCache,
  type LiveTrackPoint,
  type LiveWorldSnapshot,
} from "../../../packages/live-world/src/index.js";
import type { Logger } from "../../../packages/logging/src/index.js";
import type { PostgresPersistenceGateway } from "../../../packages/persistence/src/index.js";
import type { LiveEvent } from "./live-event-bus.js";

const LIVE_FLIGHTS_SOURCE_ID = "src_live_flights_opensky";

export async function refreshExternalDataLayer(
  layerId: string,
  persistence: PostgresPersistenceGateway,
  logger: Logger,
  publishLiveEvent?: (event: LiveEvent) => void,
): Promise<{ success: boolean; message: string; count?: number; error?: string }> {
  const startTime = Date.now();
  logger.info("Refreshing external data layer", { layer_id: layerId });

  function publishLayerUpdate(
    status: "real" | "degraded" | "unavailable",
    count: number,
    errorMessage?: string,
  ): void {
    publishLiveEvent?.({
      type: "external_layer_update",
      timestamp: new Date().toISOString(),
      payload: {
        layer_id: layerId,
        status,
        count,
        last_update: new Date().toISOString(),
        error_message: errorMessage ?? null,
      },
    });
  }

  try {
    let result: { success: boolean; events: ExternalDataEvent[]; error?: string };

    switch (layerId) {
      case "earthquakes":
        result = await createUSGSEarthquakeAdapter().fetch();
        break;
      case "satellites":
        result = await createCelesTrakAdapter().fetchTLEs("active");
        break;
      case "weather":
        result = await createNOAAWeatherAdapter().fetchAlerts();
        break;
      case "bikeshare":
        result = await createCityBikesAdapter().fetchMajorCities();
        break;
      case "traffic":
        result = await createStreetTrafficAdapter(process.env.TRAFFIC_API_KEY).fetchIncidents();
        break;
      default:
        return { success: false, message: "Unknown layer", error: `Unknown layer_id: ${layerId}` };
    }

    const duration = Date.now() - startTime;

    if (result.success) {
      await persistence.persistExternalDataEvents(
        layerId,
        result.events.map((event) => ({
          event_id: event.eventId,
          external_id: event.externalId,
          event_type: event.eventType,
          observed_at: event.observedAt,
          lat: event.lat,
          lon: event.lon,
          altitude_m: event.altitudeM,
          payload: event.payload,
        })),
      );

      await persistence.updateExternalDataLayer({
        layer_id: layerId,
        status: result.events.length > 0 ? "real" : "degraded",
        record_count: result.events.length,
        error_message: undefined,
        raw_data: {
          refreshed_at: new Date().toISOString(),
          duration_ms: duration,
        },
      });

      publishLayerUpdate(result.events.length > 0 ? "real" : "degraded", result.events.length);

      return {
        success: true,
        message: `Layer ${layerId} refreshed successfully`,
        count: result.events.length,
      };
    }

    await persistence.updateExternalDataLayer({
      layer_id: layerId,
      status: "degraded",
      record_count: 0,
      error_message: result.error,
      raw_data: {
        error_at: new Date().toISOString(),
        duration_ms: duration,
      },
    });

    publishLayerUpdate("degraded", 0, result.error);

    return {
      success: false,
      message: `Layer ${layerId} refresh failed`,
      error: result.error,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await persistence.updateExternalDataLayer({
      layer_id: layerId,
      status: "degraded",
      record_count: 0,
      error_message: errorMessage,
      raw_data: {
        error_at: new Date().toISOString(),
      },
    });

    publishLayerUpdate("degraded", 0, errorMessage);

    logger.warn("External data layer refresh error", {
      layer_id: layerId,
      error: errorMessage,
    });

    return {
      success: false,
      message: `Layer ${layerId} refresh error`,
      error: errorMessage,
    };
  }
}

export interface LiveWorldService {
  start(): Promise<void>;
  close(): Promise<void>;
  getLatestStates(): Promise<{
    states: ObjectState[];
    generated_at: string | null;
    source: "live_world_cache" | "database";
    status: "real" | "degraded" | null;
    auth_mode: "authenticated" | "anonymous" | null;
  }>;
  getTrack(
    objectId: string,
    limit?: number,
  ): Promise<{
    source: "live_world_cache" | "database";
    points: LiveTrackPoint[];
  }>;
}

export async function createLiveWorldService(input: {
  persistence: PostgresPersistenceGateway;
  logger: Logger;
  publishLiveEvent: (event: LiveEvent) => void;
  redisUrl?: string | null;
  openSkyClientId?: string | null;
  openSkyClientSecret?: string | null;
  flightsRefreshMs: number;
  flightsCacheTtlMs: number;
  flightHistoryPoints: number;
  flightLimit: number;
  autoRefreshExternalLayers: boolean;
}): Promise<LiveWorldService> {
  const cache = await createLiveWorldCache({
    redisUrl: input.redisUrl,
    logger: input.logger,
  });

  const openSky = createOpenSkyFlightsAdapter({
    clientId: input.openSkyClientId ?? undefined,
    clientSecret: input.openSkyClientSecret ?? undefined,
    limit: input.flightLimit,
    timeoutMs: 30000,
  });

  let closed = false;
  let flightsTimeout: NodeJS.Timeout | null = null;
  const externalLayerTimeouts = new Map<string, NodeJS.Timeout>();

  async function getSnapshot() {
    return cache.getSnapshot();
  }

  async function persistFlightSource(
    status: "active" | "error",
    timestamp: string,
    error?: string,
  ) {
    const canonicalSource: Source = {
      source_id: LIVE_FLIGHTS_SOURCE_ID,
      source_type: "adsb",
      name: "Live Flights",
      status,
      owner: "OpenSky Network",
      auth_ref: input.openSkyClientId && input.openSkyClientSecret ? "oauth2" : "anonymous",
      polling_mode: "pull",
      schema_version: "1.0.0",
      created_at: timestamp,
      updated_at: timestamp,
    };

    await input.persistence.upsertSource(canonicalSource);

    await input.persistence.upsertSourceHealth({
      source_id: LIVE_FLIGHTS_SOURCE_ID,
      status,
      last_seen_at: timestamp,
      error_message: error,
    });

    await input.persistence.upsertSourceRegistry({
      source_id: LIVE_FLIGHTS_SOURCE_ID,
      source_type: "adsb",
      provider: "OpenSky Network",
      label: "Live Flights",
      lat: null,
      lon: null,
      alt_m: null,
      heading_deg: null,
      coverage: null,
      status,
      last_update: timestamp,
      snapshot_available: false,
      live_available: true,
      linked_object_ids: [],
      linked_alert_ids: [],
      linked_incident_ids: [],
      metadata: {
        auth_mode:
          input.openSkyClientId && input.openSkyClientSecret ? "authenticated" : "anonymous",
        error_message: error ?? null,
      },
    });
  }

  function buildTrackPoint(state: ObjectState): LiveTrackPoint | null {
    if (!state.position) {
      return null;
    }

    return {
      lat: state.position.lat,
      lon: state.position.lon,
      altitude_m: state.position.altitude_m ?? null,
      observed_at: state.as_of,
      speed_mps: state.velocity?.speed_mps ?? null,
      heading_deg: state.velocity?.heading_deg ?? null,
    };
  }

  function mergeTracks(
    previousTracks: Record<string, LiveTrackPoint[]>,
    states: ObjectState[],
  ): Record<string, LiveTrackPoint[]> {
    const nextTracks: Record<string, LiveTrackPoint[]> = {};

    for (const state of states) {
      const nextPoint = buildTrackPoint(state);
      if (!nextPoint) {
        continue;
      }

      const existing = previousTracks[state.object_id] ?? [];
      const lastPoint = existing[existing.length - 1];
      const changed =
        !lastPoint ||
        lastPoint.observed_at !== nextPoint.observed_at ||
        lastPoint.lat !== nextPoint.lat ||
        lastPoint.lon !== nextPoint.lon;

      const merged = changed ? [...existing, nextPoint] : [...existing];
      nextTracks[state.object_id] = merged.slice(-input.flightHistoryPoints);
    }

    return nextTracks;
  }

  async function refreshFlights(): Promise<void> {
    try {
      const result = await openSky.fetchStates();
      if (!result.success) {
        input.logger.warn("Live flight refresh failed", {
          error: result.error,
          auth_mode: result.authMode,
        });
        await persistFlightSource("error", new Date().toISOString(), result.error);
        return;
      }

      const previous = await getSnapshot();
      const tracks = mergeTracks(previous?.tracks ?? {}, result.states);
      const snapshot: LiveWorldSnapshot = {
        generated_at: result.fetchedAt,
        source: "opensky" as const,
        provider: "OpenSky Network",
        status: result.authMode === "authenticated" ? "real" : "degraded",
        auth_mode: result.authMode,
        states: result.states,
        tracks,
        metadata: {
          object_count: result.states.length,
          refresh_duration_ms: result.durationMs,
        },
      };

      await cache.setSnapshot(snapshot, input.flightsCacheTtlMs);
      await persistFlightSource("active", result.fetchedAt);

      input.publishLiveEvent({
        type: "live_snapshot_update",
        timestamp: result.fetchedAt,
        payload: {
          generated_at: result.fetchedAt,
          object_count: result.states.length,
          provider: "OpenSky Network",
          status: snapshot.status,
          auth_mode: result.authMode,
        },
      });

      input.logger.info("Live flights cache refreshed", {
        object_count: result.states.length,
        auth_mode: result.authMode,
        duration_ms: result.durationMs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      input.logger.warn("Unexpected live flight refresh error", {
        error: message,
      });
      await persistFlightSource("error", new Date().toISOString(), message);
    }
  }

  function scheduleFlights(delayMs: number): void {
    if (closed) {
      return;
    }

    if (flightsTimeout) {
      clearTimeout(flightsTimeout);
    }

    flightsTimeout = setTimeout(async () => {
      await refreshFlights();
      scheduleFlights(input.flightsRefreshMs);
    }, delayMs);
  }

  async function scheduleExternalLayerRefreshes(): Promise<void> {
    if (!input.autoRefreshExternalLayers) {
      return;
    }

    const layers = await input.persistence.fetchExternalDataLayers();

    for (const layer of layers) {
      if (layer.layer_id === "traffic" && !process.env.TRAFFIC_API_KEY) {
        continue;
      }

      if (layer.status === "unavailable" || layer.update_cadence_seconds <= 0) {
        continue;
      }

      await refreshExternalDataLayer(
        layer.layer_id,
        input.persistence,
        input.logger,
        input.publishLiveEvent,
      );

      const intervalMs = Math.max(layer.update_cadence_seconds * 1000, 60_000);
      const timeout = setInterval(() => {
        void refreshExternalDataLayer(
          layer.layer_id,
          input.persistence,
          input.logger,
          input.publishLiveEvent,
        );
      }, intervalMs);
      externalLayerTimeouts.set(layer.layer_id, timeout);
    }
  }

  return {
    async start(): Promise<void> {
      await refreshFlights();
      scheduleFlights(input.flightsRefreshMs);
      void scheduleExternalLayerRefreshes().catch((error) => {
        input.logger.warn("Failed to schedule external layer refreshes", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    },

    async close(): Promise<void> {
      closed = true;
      if (flightsTimeout) {
        clearTimeout(flightsTimeout);
      }
      for (const timeout of externalLayerTimeouts.values()) {
        clearInterval(timeout);
      }
      externalLayerTimeouts.clear();
      await cache.close();
    },

    async getLatestStates() {
      const snapshot = await getSnapshot();
      if (!snapshot) {
        const states = await input.persistence.fetchLatestStateForAllObjects();
        return {
          states,
          generated_at: null,
          source: "database" as const,
          status: null,
          auth_mode: null,
        };
      }

      return {
        states: snapshot.states,
        generated_at: snapshot.generated_at,
        source: "live_world_cache" as const,
        status: snapshot.status,
        auth_mode: snapshot.auth_mode,
      };
    },

    async getTrack(objectId: string, limit: number = 24) {
      const points = await cache.getTrack(objectId, limit);
      if (points.length > 0) {
        return {
          source: "live_world_cache" as const,
          points,
        };
      }

      return {
        source: "database" as const,
        points: await input.persistence.fetchRecentTrackForObject(objectId, limit),
      };
    },
  };
}
