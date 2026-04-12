/**
 * External Data Package
 *
 * Provides adapters and utilities for integrating external data sources
 * into the MORDOR tactical UI. All data sources are explicitly marked as
 * real, degraded, or unavailable.
 */

export {
  CelesTrakAdapter,
  createCelesTrakAdapter,
  type SatelliteCategory,
  type SatellitePosition,
  type TLESet,
} from "./adapters/celestrak-satellites.js";
export { CityBikesAdapter, createCityBikesAdapter } from "./adapters/citybikes.js";
export {
  createMilitaryFlightsAdapter,
  MilitaryFlightsAdapter,
} from "./adapters/military-flights.js";
export { createNOAAWeatherAdapter, NOAAWeatherAdapter } from "./adapters/noaa-weather.js";
export { createStreetTrafficAdapter, StreetTrafficAdapter } from "./adapters/street-traffic.js";
// Adapters
export {
  createOpenSkyFlightsAdapter,
  OpenSkyFlightsAdapter,
  type OpenSkyFlightsFetchResult,
} from "./adapters/opensky-flights.js";
export {
  createUSGSEarthquakeAdapter,
  USGSEarthquakeAdapter,
} from "./adapters/usgs-earthquakes.js";
export { calculateFreshness, createCacheKey, ExternalDataCache } from "./cache.js";
// Core utilities
export { createHttpClient, RateLimitedHttpClient } from "./http-client.js";
// Types
export type {
  AdapterConfig,
  CacheEntry,
  ExternalDataEvent,
  ExternalDataSource,
  FetchResult,
  LayerState,
  LayerStatus,
  SourceHealth,
} from "./types.js";

// Default configurations
export { DEFAULT_ADAPTER_CONFIG } from "./types.js";

import { CelesTrakAdapter } from "./adapters/celestrak-satellites.js";
import { CityBikesAdapter } from "./adapters/citybikes.js";
import { MilitaryFlightsAdapter } from "./adapters/military-flights.js";
import { NOAAWeatherAdapter } from "./adapters/noaa-weather.js";
import { StreetTrafficAdapter } from "./adapters/street-traffic.js";
import { USGSEarthquakeAdapter } from "./adapters/usgs-earthquakes.js";
import type { ExternalDataEvent, LayerState } from "./types.js";

/**
 * Registry of all external data adapters.
 */
export class ExternalDataRegistry {
  private adapters = {
    earthquakes: new USGSEarthquakeAdapter(),
    satellites: new CelesTrakAdapter(),
    weather: new NOAAWeatherAdapter(),
    bikeshare: new CityBikesAdapter(),
    military: new MilitaryFlightsAdapter(),
    traffic: new StreetTrafficAdapter(),
  };

  /**
   * Get all adapter source definitions.
   */
  getSources() {
    return Object.values(this.adapters).map((adapter) => adapter.source);
  }

  /**
   * Get an adapter by layer ID.
   */
  getAdapter(layerId: keyof typeof this.adapters) {
    return this.adapters[layerId];
  }

  /**
   * Fetch data for a specific layer.
   */
  async fetchLayer(layerId: keyof typeof this.adapters): Promise<LayerState> {
    const adapter = this.adapters[layerId];
    const source = adapter.source;

    let result: {
      success: boolean;
      events: ExternalDataEvent[];
      error?: string;
      fetchedAt: string;
      durationMs: number;
    };
    switch (layerId) {
      case "earthquakes":
        result = await (adapter as USGSEarthquakeAdapter).fetch();
        break;
      case "satellites":
        result = await (adapter as CelesTrakAdapter).fetchTLEs("visual");
        break;
      case "weather":
        result = await (adapter as NOAAWeatherAdapter).fetchAlerts();
        break;
      case "bikeshare":
        result = await (adapter as CityBikesAdapter).fetchMajorCities();
        break;
      case "traffic":
        result = await (adapter as StreetTrafficAdapter).fetchIncidents();
        break;
      default:
        result = await (adapter as MilitaryFlightsAdapter).fetch();
        break;
    }

    return {
      ...source,
      count: result.success ? result.events.length : null,
      lastUpdate: result.fetchedAt,
      errorMessage: result.error || null,
      enabled: false,
      freshnessSeconds: result.success ? Math.floor(result.durationMs / 1000) : null,
    };
  }

  /**
   * Fetch all layers.
   */
  async fetchAll(): Promise<LayerState[]> {
    const layerIds = Object.keys(this.adapters) as Array<keyof typeof this.adapters>;
    const results: LayerState[] = [];

    for (const layerId of layerIds) {
      try {
        const state = await this.fetchLayer(layerId);
        results.push(state);
      } catch (error) {
        const adapter = this.adapters[layerId];
        results.push({
          ...adapter.source,
          count: null,
          lastUpdate: new Date().toISOString(),
          errorMessage: error instanceof Error ? error.message : String(error),
          enabled: false,
          freshnessSeconds: null,
        });
      }
    }

    return results;
  }
}

/**
 * Create a new external data registry.
 */
export function createExternalDataRegistry(): ExternalDataRegistry {
  return new ExternalDataRegistry();
}

// Singleton instance
let globalRegistry: ExternalDataRegistry | null = null;

/**
 * Get the global external data registry (creates if needed).
 */
export function getExternalDataRegistry(): ExternalDataRegistry {
  if (!globalRegistry) {
    globalRegistry = new ExternalDataRegistry();
  }
  return globalRegistry;
}
