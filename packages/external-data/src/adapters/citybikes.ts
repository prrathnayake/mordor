/**
 * CityBikes Bikeshare Adapter
 *
 * Fetches bikeshare station data from CityBikes API.
 * Source: https://api.citybik.es/
 * License: Open Data
 *
 * Provides real-time bike availability and station locations
 * for cities worldwide.
 */

import { createHttpClient } from "../http-client.js";
import type { ExternalDataEvent, ExternalDataSource, FetchResult } from "../types.js";

/**
 * CityBikes network info
 */
interface CityBikesNetwork {
  company: string[];
  href: string;
  id: string;
  location: {
    city: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  name: string;
  source?: string;
  gbfs_href?: string;
}

/**
 * CityBikes networks response
 */
interface CityBikesNetworksResponse {
  networks: CityBikesNetwork[];
}

/**
 * CityBikes station
 */
interface CityBikesStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  free_bikes: number;
  empty_slots: number;
  extra?: {
    address?: string;
    status?: string;
    uid?: string;
    last_updated?: number;
    renting?: boolean;
    returning?: boolean;
  };
}

/**
 * CityBikes network response
 */
interface CityBikesNetworkResponse {
  network: {
    company: string[];
    href: string;
    id: string;
    location: {
      city: string;
      country: string;
      latitude: number;
      longitude: number;
    };
    name: string;
    stations: CityBikesStation[];
  };
}

/**
 * CityBikes Bikeshare Adapter
 */
export class CityBikesAdapter {
  readonly source: ExternalDataSource = {
    layerId: "bikeshare",
    label: "Bikeshare",
    provider: "CityBikes",
    sourceUrl: "https://api.citybik.es/",
    license: "Open Data",
    status: "real",
    updateCadenceSeconds: 60,
    toggleable: true,
  };

  private httpClient = createHttpClient({
    timeoutMs: 30000,
    rateLimitMs: 5000,
    maxRetries: 3,
  });

  /**
   * Fetch all available networks.
   */
  async fetchNetworks(): Promise<CityBikesNetwork[]> {
    try {
      const response = await this.httpClient.get("https://api.citybik.es/v2/networks");

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as CityBikesNetworksResponse;
      return data.networks;
    } catch {
      return [];
    }
  }

  /**
   * Fetch stations for a specific network.
   */
  async fetchStations(networkId: string): Promise<FetchResult> {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get(`https://api.citybik.es/v2/networks/${networkId}`);

      if (!response.ok) {
        return {
          success: false,
          events: [],
          error: `CityBikes API returned ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };
      }

      const data = (await response.json()) as CityBikesNetworkResponse;

      const events = data.network.stations.map((station) => this.normalize(station, data.network));

      return {
        success: true,
        events,
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        events: [],
        error: error instanceof Error ? error.message : String(error),
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Fetch stations for major cities (default networks).
   */
  async fetchMajorCities(): Promise<FetchResult> {
    const startTime = Date.now();

    // Default networks for major cities
    const defaultNetworks = [
      "citi-bike-nyc", // New York
      "divvy", // Chicago
      "bixi-montreal", // Montreal
      "capital-bikeshare", // Washington DC
      "bay-wheels", // San Francisco
      "blue-bikes", // Boston
      "bicing", // Barcelona
      "velib", // Paris
      "santander-cycles", // London
      "call-a-bike-berlin", // Berlin
      "tobike-torino", // Turin
      "bicimad", // Madrid
    ];

    const allEvents: ExternalDataEvent[] = [];
    const errors: string[] = [];

    for (const networkId of defaultNetworks) {
      try {
        const result = await this.fetchStations(networkId);
        if (result.success) {
          allEvents.push(...result.events);
        } else {
          errors.push(`${networkId}: ${result.error}`);
        }

        // Small delay between requests
        await this.delay(100);
      } catch (error) {
        errors.push(`${networkId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const success = allEvents.length > 0;

    return {
      success,
      events: allEvents,
      error: success ? undefined : errors.join("; "),
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Normalize a CityBikes station to our event format.
   */
  private normalize(
    station: CityBikesStation,
    network: CityBikesNetworkResponse["network"],
  ): ExternalDataEvent {
    const totalSlots = station.free_bikes + station.empty_slots;
    const availabilityPercent = totalSlots > 0 ? (station.free_bikes / totalSlots) * 100 : 0;

    return {
      eventId: `bike_${station.id.replace(/[^a-zA-Z0-9]/g, "_")}`,
      externalId: station.id,
      layerId: "bikeshare",
      eventType: "bikeshare_station_observed",
      observedAt: new Date(station.timestamp).toISOString(),
      lat: station.latitude,
      lon: station.longitude,
      altitudeM: null,
      payload: {
        name: station.name,
        network: network.name,
        networkId: network.id,
        city: network.location.city,
        country: network.location.country,
        freeBikes: station.free_bikes,
        emptySlots: station.empty_slots,
        totalSlots,
        availabilityPercent: Math.round(availabilityPercent),
        address: station.extra?.address,
        status: station.extra?.status,
        isRenting: station.extra?.renting,
        isReturning: station.extra?.returning,
      },
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get color based on bike availability.
   */
  static getAvailabilityColor(availabilityPercent: number): string {
    if (availabilityPercent >= 50) return "#22c55e"; // Green - plenty of bikes
    if (availabilityPercent >= 25) return "#eab308"; // Yellow - some bikes
    if (availabilityPercent > 0) return "#f97316"; // Orange - few bikes
    return "#ef4444"; // Red - no bikes
  }

  /**
   * Get size based on station capacity.
   */
  static getStationSize(totalSlots: number): number {
    if (totalSlots >= 40) return 12;
    if (totalSlots >= 20) return 10;
    if (totalSlots >= 10) return 8;
    return 6;
  }
}

/**
 * Create a CityBikes adapter instance.
 */
export function createCityBikesAdapter(): CityBikesAdapter {
  return new CityBikesAdapter();
}
