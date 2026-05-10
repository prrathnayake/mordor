/**
 * Maritime Traffic Adapter
 *
 * Fetches vessel position data from AIS-based maritime tracking services.
 * Sources: MarineTraffic, VesselFinder (requires API keys)
 */

import { createHttpClient } from "../http-client.js";
import type { ExternalDataEvent, ExternalDataSource, FetchResult } from "../types.js";

export interface VesselPosition {
  vesselId: string;
  source: "marinetraffic" | "vesselfinder";
  imo: string | null;
  vesselName: string;
  vesselType: string;
  flag: string;
  lat: number;
  lon: number;
  speedKnots: number | null;
  headingDeg: number | null;
  destination: string | null;
  eta: string | null;
  observedAt: string;
}

interface MarineTrafficVessel {
  MMSI: string;
  IMO: string;
  NAME: string;
  TYPE: number;
  TYPE_TEXT: string;
  FLAG: string;
  LAT: number;
  LON: number;
  SPEED: number;
  HEADING: number;
  DESTINATION: string;
  ETA: string;
  LAST_UPDATE: string;
}

interface VesselFinderVessel {
  IMO: string;
  NAME: string;
  TYPE: string;
  FLAG: string;
  LAT: number;
  LON: number;
  SPEED: number;
  COURSE: number;
  DESTINATION: string;
  ETA: string;
  TIMESTAMP: string;
}

export class MaritimeTrafficAdapter {
  readonly source: ExternalDataSource = {
    layerId: "maritime",
    label: "Maritime Traffic",
    provider: "AIS Networks",
    sourceUrl: "https://www.marinetraffic.com",
    license: "Proprietary",
    status: "real",
    updateCadenceSeconds: 60,
    toggleable: true,
  };

  private httpClient = createHttpClient({
    timeoutMs: 30000,
    rateLimitMs: 60000,
    maxRetries: 3,
  });

  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async fetchPositions(bounds?: {
    west: number;
    south: number;
    east: number;
    north: number;
  }): Promise<FetchResult> {
    const startTime = Date.now();

    if (!this.apiKey) {
      return {
        success: false,
        events: [],
        error: "MarineTraffic API key not configured",
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const boundsStr = bounds
        ? `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`
        : "-180,-90,180,90";

      const url = `https://services.marinetraffic.com/api/export-vessel-position/vessel-activity/${this.apiKey}/protocol:json/fields:MMSI,IMO,NAME,TYPE,TYPE_TEXT,FLAG,LAT,LON,SPEED,HEADING,DESTINATION,ETA,LAST_UPDATE/result_target:json`;

      const response = await this.httpClient.get(url);

      if (!response.ok) {
        return {
          success: false,
          events: [],
          error: `MarineTraffic API returned ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };
      }

      const data = (await response.json()) as MarineTrafficVessel[];
      const events = data.map((vessel) => this.normalizeMarineTraffic(vessel));

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

  async fetchVesselByIMO(imo: string): Promise<FetchResult> {
    const startTime = Date.now();

    if (!this.apiKey) {
      return {
        success: false,
        events: [],
        error: "MarineTraffic API key not configured",
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const url = `https://services.marinetraffic.com/api/export-vessel-position/vessel-activity/${this.apiKey}/protocol:json/fields:MMSI,IMO,NAME,TYPE,TYPE_TEXT,FLAG,LAT,LON,SPEED,HEADING,DESTINATION,ETA,LAST_UPDATE/result_target:json/IMO:${imo}`;

      const response = await this.httpClient.get(url);

      if (!response.ok) {
        return {
          success: false,
          events: [],
          error: `MarineTraffic API returned ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };
      }

      const data = (await response.json()) as MarineTrafficVessel[];
      const events = data.map((vessel) => this.normalizeMarineTraffic(vessel));

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

  async fetchFromVesselFinder(): Promise<FetchResult> {
    const startTime = Date.now();

    if (!this.apiKey) {
      return {
        success: false,
        events: [],
        error: "VesselFinder API key not configured",
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const url = `https://api.vesselfinder.com/vessels`;

      const response = await this.httpClient.get(url);

      if (!response.ok) {
        return {
          success: false,
          events: [],
          error: `VesselFinder API returned ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };
      }

      const data = (await response.json()) as { vessels: VesselFinderVessel[] };
      const events = (data.vessels || []).map((vessel) => this.normalizeVesselFinder(vessel));

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

  private normalizeMarineTraffic(vessel: MarineTrafficVessel): ExternalDataEvent {
    return {
      eventId: `vessel_${vessel.IMO || vessel.MMSI}`,
      externalId: vessel.IMO || vessel.MMSI,
      layerId: "maritime",
      eventType: "vessel_position_observed",
      observedAt: vessel.LAST_UPDATE,
      lat: vessel.LAT,
      lon: vessel.LON,
      payload: {
        vesselId: `mt_${vessel.MMSI}`,
        source: "marinetraffic",
        imo: vessel.IMO,
        vesselName: vessel.NAME,
        vesselType: vessel.TYPE_TEXT,
        flag: vessel.FLAG,
        speedKnots: vessel.SPEED,
        headingDeg: vessel.HEADING,
        destination: vessel.DESTINATION,
        eta: vessel.ETA,
        mmsi: vessel.MMSI,
      },
    };
  }

  private normalizeVesselFinder(vessel: VesselFinderVessel): ExternalDataEvent {
    return {
      eventId: `vessel_${vessel.IMO}`,
      externalId: vessel.IMO,
      layerId: "maritime",
      eventType: "vessel_position_observed",
      observedAt: vessel.TIMESTAMP,
      lat: vessel.LAT,
      lon: vessel.LON,
      payload: {
        vesselId: `vf_${vessel.IMO}`,
        source: "vesselfinder",
        imo: vessel.IMO,
        vesselName: vessel.NAME,
        vesselType: vessel.TYPE,
        flag: vessel.FLAG,
        speedKnots: vessel.SPEED,
        headingDeg: vessel.COURSE,
        destination: vessel.DESTINATION,
        eta: vessel.ETA,
      },
    };
  }
}

export function createMaritimeTrafficAdapter(apiKey?: string): MaritimeTrafficAdapter {
  return new MaritimeTrafficAdapter(apiKey);
}
