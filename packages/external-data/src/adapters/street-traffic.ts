/**
 * Street Traffic Adapter
 *
 * Fetches traffic data from available sources.
 * Status: DEGRADED
 *
 * Real-time street traffic data requires commercial API access (TomTom, Google Maps, Mapbox).
 * This adapter provides a degraded implementation that:
 * - Returns traffic incident data if API key available
 * - Falls back to placeholder status with honest explanation if not
 */

import { createHttpClient } from "../http-client.js";
import type {
  AdapterConfig,
  ExternalDataEvent,
  ExternalDataSource,
  FetchResult,
} from "../types.js";

/**
 * TomTom Traffic Incident (simplified)
 */
interface TomTomIncident {
  id: string;
  type: string;
  severity: string;
  description: string;
  location: {
    latitude: number;
    longitude: number;
  };
  startTime: string;
  endTime: string;
  delayInSeconds: number;
}

/**
 * Street Traffic Adapter
 */
export class StreetTrafficAdapter {
  readonly source: ExternalDataSource = {
    layerId: "traffic",
    label: "Street Traffic",
    provider: "TomTom/Google Maps API",
    sourceUrl: "https://developer.tomtom.com/",
    license: "Commercial API Key Required",
    status: "degraded",
    updateCadenceSeconds: 300, // 5 minutes
    toggleable: true,
  };

  private httpClient: ReturnType<typeof createHttpClient> | null = null;
  private hasAttemptedFetch = false;

  constructor(private apiKey?: string) {
    if (apiKey) {
      this.httpClient = createHttpClient({
        timeoutMs: 30000,
        rateLimitMs: 10000,
        maxRetries: 2,
        apiKey,
      });
    }
  }

  /**
   * Fetch traffic incidents if API key is available.
   * Otherwise returns degraded status.
   */
  async fetchIncidents(boundingBox?: {
    minLat: number;
    minLon: number;
    maxLat: number;
    maxLon: number;
  }): Promise<FetchResult> {
    const startTime = Date.now();
    this.hasAttemptedFetch = true;

    if (!this.apiKey || !this.httpClient) {
      return {
        success: false,
        events: [],
        error: this.getUnavailabilityReason(),
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // Default bbox for Sydney if not provided
      const bbox = boundingBox || { minLat: -34.1, minLon: 150.8, maxLat: -33.6, maxLon: 151.3 };

      const bboxStr = `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;
      const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${this.apiKey}&bbox=${bboxStr}&fields={incidents{geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delayInSeconds,roadNumbers,timeValidity}}}&language=en-US&timeValidityFilter=present`;

      const response = await this.httpClient.get(url);

      if (!response.ok) {
        // If API fails, switch to degraded mode
        this.source.status = "degraded";

        return {
          success: false,
          events: [],
          error: `TomTom API returned ${response.status}: ${response.statusText}. Traffic data requires a valid API key.`,
          statusCode: response.status,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };
      }

      const data = (await response.json()) as {
        incidents?: Array<{
          geometry: {
            type: "Point" | "LineString";
            coordinates: number[] | number[][];
          };
          properties: TomTomIncident;
        }>;
      };

      const events: ExternalDataEvent[] = [];

      for (const incident of data.incidents || []) {
        const event = this.normalize(incident.properties, incident.geometry);
        if (event) {
          events.push(event);
        }
      }

      return {
        success: true,
        events,
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      this.source.status = "degraded";

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
   * Normalize a traffic incident to our event format.
   */
  private normalize(
    incident: TomTomIncident,
    geometry: { type: "Point" | "LineString"; coordinates: number[] | number[][] },
  ): ExternalDataEvent | null {
    let lat: number;
    let lon: number;

    if (
      geometry.type === "Point" &&
      Array.isArray(geometry.coordinates) &&
      geometry.coordinates.length >= 2
    ) {
      lon = geometry.coordinates[0] as number;
      lat = geometry.coordinates[1] as number;
    } else if (
      geometry.type === "LineString" &&
      Array.isArray(geometry.coordinates) &&
      geometry.coordinates.length > 0
    ) {
      // Use first point of line
      const firstCoord = geometry.coordinates[0];
      if (Array.isArray(firstCoord) && firstCoord.length >= 2) {
        lon = firstCoord[0] as number;
        lat = firstCoord[1] as number;
      } else {
        return null;
      }
    } else {
      return null;
    }

    return {
      eventId: `traffic_${incident.id}`,
      externalId: incident.id,
      layerId: "traffic",
      eventType: "traffic_incident",
      observedAt: incident.startTime,
      lat,
      lon,
      altitudeM: null,
      payload: {
        type: incident.type,
        severity: incident.severity,
        description: incident.description,
        delayInSeconds: incident.delayInSeconds,
        endTime: incident.endTime,
      },
    };
  }

  /**
   * Get explanation for degraded status.
   */
  getUnavailabilityReason(): string {
    return `Street Traffic layer is in DEGRADED mode.

REASON: Real-time traffic data requires a commercial API key.

SUPPORTED PROVIDERS:
- TomTom Traffic API (https://developer.tomtom.com/)
- Google Maps Directions API (https://developers.google.com/maps/)
- Mapbox Directions API (https://docs.mapbox.com/)
- HERE Traffic API (https://developer.here.com/)

FREE TIERS AVAILABLE:
- TomTom: 2,500 transactions/day free
- Mapbox: 100,000 requests/month free
- HERE: 250,000 transactions/month free

To enable real traffic data:
1. Sign up for a traffic API provider
2. Set the API key in environment variables
3. Restart the system

CURRENT STATUS: Traffic data unavailable without API key.
The layer remains toggleable but shows placeholder status.`;
  }

  /**
   * Check if the adapter has been configured with an API key.
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get color for traffic severity.
   */
  static getSeverityColor(severity: string): string {
    switch (severity.toLowerCase()) {
      case "blocking":
        return "#dc2626"; // Red
      case "major":
        return "#ea580c"; // Orange
      case "minor":
        return "#eab308"; // Yellow
      default:
        return "#6b7280"; // Gray
    }
  }
}

/**
 * Create a street traffic adapter instance.
 */
export function createStreetTrafficAdapter(apiKey?: string): StreetTrafficAdapter {
  return new StreetTrafficAdapter(apiKey);
}
