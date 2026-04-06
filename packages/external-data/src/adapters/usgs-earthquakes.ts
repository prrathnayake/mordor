/**
 * USGS Earthquake Adapter
 *
 * Fetches earthquake data from USGS GeoJSON feed.
 * Source: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
 * License: Public Domain
 *
 * Provides real-time earthquake data for the past 24 hours,
 * magnitude 2.5 and above worldwide.
 */

import { createHttpClient } from "../http-client.js";
import type {
  AdapterConfig,
  ExternalDataEvent,
  ExternalDataSource,
  FetchResult,
} from "../types.js";

/**
 * USGS GeoJSON Feature structure
 */
interface USGSFeature {
  type: "Feature";
  properties: {
    mag: number;
    place: string;
    time: number; // Unix timestamp in milliseconds
    updated: number;
    tz: number | null;
    url: string;
    detail: string;
    felt: number | null;
    cdi: number | null;
    mmi: number | null;
    alert: string | null;
    status: string;
    tsunami: number;
    sig: number;
    net: string;
    code: string;
    ids: string;
    sources: string;
    types: string;
    nst: number | null;
    dmin: number | null;
    rms: number;
    gap: number | null;
    magType: string;
    type: string;
    title: string;
  };
  geometry: {
    type: "Point";
    coordinates: [number, number, number]; // [lon, lat, depth]
  };
  id: string;
}

/**
 * USGS GeoJSON Feed structure
 */
interface USGSFeed {
  type: "FeatureCollection";
  metadata: {
    generated: number;
    url: string;
    title: string;
    status: number;
    api: string;
    count: number;
  };
  features: USGSFeature[];
}

/**
 * USGS Earthquake Adapter
 */
export class USGSEarthquakeAdapter {
  readonly source: ExternalDataSource = {
    layerId: "earthquakes",
    label: "Earthquakes (24h)",
    provider: "USGS",
    sourceUrl: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php",
    license: "Public Domain",
    status: "real",
    updateCadenceSeconds: 300, // 5 minutes
    toggleable: true,
  };

  private httpClient = createHttpClient({
    timeoutMs: 30000,
    rateLimitMs: 60000, // USGS requests no more than frequent polling
    maxRetries: 3,
  });

  /**
   * Fetch earthquakes from USGS feed.
   * Defaults to M2.5+ earthquakes in the past 24 hours.
   */
  async fetch(minMagnitude = 2.5): Promise<FetchResult> {
    const startTime = Date.now();

    try {
      // USGS feed URL for significant earthquakes (M2.5+) in past 24 hours
      const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson`;

      const response = await this.httpClient.get(url);

      if (!response.ok) {
        return {
          success: false,
          events: [],
          error: `USGS API returned ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };
      }

      const data = (await response.json()) as USGSFeed;

      // Filter by minimum magnitude if specified
      const features =
        minMagnitude > 2.5
          ? data.features.filter((f) => f.properties.mag >= minMagnitude)
          : data.features;

      const events = features.map((feature) => this.normalize(feature));

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
   * Fetch earthquakes for a specific time range.
   * Uses USGS FDSNWS event query API.
   */
  async fetchRange(startTime: Date, endTime: Date, minMagnitude = 2.5): Promise<FetchResult> {
    const fetchStartTime = Date.now();

    try {
      const formatDate = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "");

      const url = new URL("https://earthquake.usgs.gov/fdsnws/event/1/query");
      url.searchParams.set("format", "geojson");
      url.searchParams.set("starttime", formatDate(startTime));
      url.searchParams.set("endtime", formatDate(endTime));
      url.searchParams.set("minmagnitude", String(minMagnitude));
      url.searchParams.set("orderby", "time");
      url.searchParams.set("limit", "1000");

      const response = await this.httpClient.get(url.toString());

      if (!response.ok) {
        return {
          success: false,
          events: [],
          error: `USGS API returned ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - fetchStartTime,
        };
      }

      const data = (await response.json()) as USGSFeed;
      const events = data.features.map((feature) => this.normalize(feature));

      return {
        success: true,
        events,
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - fetchStartTime,
      };
    } catch (error) {
      return {
        success: false,
        events: [],
        error: error instanceof Error ? error.message : String(error),
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - fetchStartTime,
      };
    }
  }

  /**
   * Normalize a USGS feature to our canonical event format.
   */
  private normalize(feature: USGSFeature): ExternalDataEvent {
    const [lon, lat, depth] = feature.geometry.coordinates;

    return {
      eventId: `eq_${feature.id}`,
      externalId: feature.id,
      layerId: "earthquakes",
      eventType: "earthquake_observed",
      observedAt: new Date(feature.properties.time).toISOString(),
      lat,
      lon,
      altitudeM: -depth, // Negative altitude for depth below surface
      payload: {
        magnitude: feature.properties.mag,
        magnitudeType: feature.properties.magType,
        place: feature.properties.place,
        depthKm: depth,
        status: feature.properties.status,
        tsunami: feature.properties.tsunami === 1,
        significance: feature.properties.sig,
        url: feature.properties.url,
        feltReports: feature.properties.felt,
        alert: feature.properties.alert,
      },
    };
  }

  /**
   * Get color for earthquake based on magnitude.
   */
  static getMagnitudeColor(magnitude: number): string {
    if (magnitude < 4.0) return "#4ade80"; // Green
    if (magnitude < 6.0) return "#facc15"; // Yellow
    if (magnitude < 7.0) return "#fb923c"; // Orange
    return "#ef4444"; // Red
  }

  /**
   * Get size for earthquake marker based on magnitude.
   */
  static getMagnitudeSize(magnitude: number): number {
    // Base size + scale with magnitude
    return 10 + magnitude * 5;
  }
}

/**
 * Create a USGS earthquake adapter instance.
 */
export function createUSGSEarthquakeAdapter(): USGSEarthquakeAdapter {
  return new USGSEarthquakeAdapter();
}
