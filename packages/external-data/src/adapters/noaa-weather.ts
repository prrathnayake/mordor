/**
 * NOAA Weather Adapter
 *
 * Fetches weather radar and alert data from NOAA/NWS.
 * Source: https://api.weather.gov/
 * License: Public Domain
 *
 * Provides weather alerts and radar metadata.
 * Note: Radar imagery is provided as tile URLs, not point data.
 * Status: degraded - imagery overlays only
 */

import { createHttpClient } from "../http-client.js";
import type { ExternalDataEvent, ExternalDataSource, FetchResult } from "../types.js";

/**
 * NWS Alert structure
 */
interface NWSAlert {
  id: string;
  areaDesc: string;
  geocode: {
    SAME: string[];
    UGC: string[];
  };
  affectedZones: string[];
  references: unknown[];
  sent: string;
  effective: string;
  onset: string;
  expires: string;
  ends: string;
  status: "Actual" | "Exercise" | "System" | "Test" | "Draft";
  messageType: "Alert" | "Update" | "Cancel" | "Ack" | "Error";
  category:
    | "Geo"
    | "Met"
    | "Safety"
    | "Security"
    | "Rescue"
    | "Fire"
    | "Health"
    | "Env"
    | "Transport"
    | "Infra"
    | "CBRNE"
    | "Other";
  severity: "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
  certainty: "Observed" | "Likely" | "Possible" | "Unlikely" | "Unknown";
  urgency: "Immediate" | "Expected" | "Future" | "Past" | "Unknown";
  event: string;
  sender: string;
  senderName: string;
  headline: string;
  description: string;
  instruction: string;
  response: string;
  parameters: Record<string, unknown>;
}

/**
 * NWS Alert response
 */
interface NWSAlertResponse {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "Polygon";
      coordinates: number[][][];
    } | null;
    properties: NWSAlert;
  }>;
  title: string;
  updated: string;
}

/**
 * Radar station info
 */
interface RadarStation {
  id: string;
  name: string;
  radarType: string;
  latitude: number;
  longitude: number;
  elevation: number;
}

/**
 * NOAA Weather Adapter
 */
export class NOAAWeatherAdapter {
  readonly source: ExternalDataSource = {
    layerId: "weather",
    label: "Weather Radar",
    provider: "NOAA/NWS",
    sourceUrl: "https://api.weather.gov/",
    license: "Public Domain",
    status: "degraded",
    updateCadenceSeconds: 600, // 10 minutes
    toggleable: true,
  };

  private httpClient = createHttpClient({
    timeoutMs: 30000,
    rateLimitMs: 10000, // Be respectful to NWS API
    maxRetries: 3,
  });

  /**
   * Fetch active weather alerts.
   */
  async fetchAlerts(): Promise<FetchResult> {
    const startTime = Date.now();

    try {
      // Fetch active alerts
      const url = "https://api.weather.gov/alerts/active";

      const response = await this.httpClient.get(url, {
        Accept: "application/geo+json",
        "User-Agent": "(ChronaTwin, contact@example.com)", // Required by NWS
      });

      if (!response.ok) {
        return {
          success: false,
          events: [],
          error: `NWS API returned ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };
      }

      const data = (await response.json()) as NWSAlertResponse;

      // Convert alerts to events (using centroid of polygon for point representation)
      const events: ExternalDataEvent[] = [];

      for (const feature of data.features.slice(0, 50)) {
        // Limit for performance
        const event = this.normalizeAlert(feature.properties, feature.geometry);
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
   * Fetch radar station locations.
   */
  async fetchRadarStations(): Promise<FetchResult> {
    const startTime = Date.now();

    try {
      // Fetch radar stations
      const url = "https://api.weather.gov/radar/stations";

      const response = await this.httpClient.get(url, {
        Accept: "application/geo+json",
        "User-Agent": "(ChronaTwin, contact@example.com)",
      });

      if (!response.ok) {
        return {
          success: false,
          events: [],
          error: `NWS API returned ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };
      }

      const data = (await response.json()) as {
        type: "FeatureCollection";
        features: Array<{
          type: "Feature";
          geometry: {
            type: "Point";
            coordinates: [number, number];
          };
          properties: RadarStation;
        }>;
      };

      const events = data.features.map((feature) =>
        this.normalizeRadarStation(feature.properties, feature.geometry.coordinates),
      );

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
   * Get radar imagery URL for a station.
   * Returns tile URL template for overlay.
   */
  getRadarImageryUrl(stationId: string): { baseUrl: string; status: string } {
    // Iowa State Mesonet provides public NEXRAD imagery
    // These are base reflectivity images
    return {
      baseUrl: `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-${stationId.toLowerCase()}/{z}/{x}/{y}.png`,
      status: "degraded", // Imagery only, not point data
    };
  }

  /**
   * Normalize an NWS alert to our event format.
   */
  private normalizeAlert(
    alert: NWSAlert,
    geometry: { type: "Polygon"; coordinates: number[][][] } | null,
  ): ExternalDataEvent | null {
    // Calculate centroid from polygon for point representation
    let lat = 0;
    let lon = 0;

    if (geometry && geometry.coordinates.length > 0) {
      const coords = geometry.coordinates[0][0]; // First ring, first point as approximation
      if (coords && coords.length >= 2) {
        lon = coords[0];
        lat = coords[1];
      }
    } else {
      // Skip alerts without geometry
      return null;
    }

    return {
      eventId: `wx_alert_${alert.id}`,
      externalId: alert.id,
      layerId: "weather",
      eventType: "weather_alert",
      observedAt: alert.sent,
      lat,
      lon,
      altitudeM: null,
      payload: {
        event: alert.event,
        severity: alert.severity,
        certainty: alert.certainty,
        urgency: alert.urgency,
        headline: alert.headline,
        description: alert.description,
        instruction: alert.instruction,
        area: alert.areaDesc,
        effective: alert.effective,
        expires: alert.expires,
        sender: alert.senderName,
      },
    };
  }

  /**
   * Normalize radar station to our event format.
   */
  private normalizeRadarStation(
    station: RadarStation,
    coords: [number, number],
  ): ExternalDataEvent {
    return {
      eventId: `wx_radar_${station.id}`,
      externalId: station.id,
      layerId: "weather",
      eventType: "radar_station",
      observedAt: new Date().toISOString(),
      lat: coords[1],
      lon: coords[0],
      altitudeM: station.elevation,
      payload: {
        name: station.name,
        radarType: station.radarType,
        coverageRadius: station.radarType === "NEXRAD" ? 460 : 250, // km
        imageryUrl: this.getRadarImageryUrl(station.id).baseUrl,
      },
    };
  }

  /**
   * Get color for weather alert based on severity.
   */
  static getAlertColor(severity: string): string {
    switch (severity) {
      case "Extreme":
        return "#dc2626"; // Red
      case "Severe":
        return "#ea580c"; // Orange
      case "Moderate":
        return "#ca8a04"; // Yellow
      case "Minor":
        return "#3b82f6"; // Blue
      default:
        return "#6b7280"; // Gray
    }
  }

  /**
   * Get icon for weather event type.
   */
  static getWeatherIcon(eventType: string): string {
    const eventLower = eventType.toLowerCase();
    if (eventLower.includes("tornado")) return "🌪️";
    if (eventLower.includes("thunderstorm")) return "⛈️";
    if (eventLower.includes("flood")) return "🌊";
    if (eventLower.includes("winter") || eventLower.includes("snow")) return "❄️";
    if (eventLower.includes("hurricane") || eventLower.includes("tropical")) return "🌀";
    if (eventLower.includes("fire") || eventLower.includes("red flag")) return "🔥";
    if (eventLower.includes("wind")) return "💨";
    return "⚠️";
  }
}

/**
 * Create a NOAA weather adapter instance.
 */
export function createNOAAWeatherAdapter(): NOAAWeatherAdapter {
  return new NOAAWeatherAdapter();
}
