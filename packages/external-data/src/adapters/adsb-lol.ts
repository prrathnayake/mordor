import { createHttpClient } from "../http-client.js";
import type { AdapterFetchResult, AviationPosition, DataAdapter } from "../universal-types.js";

interface AdsbLolAircraft {
  hex: string;
  flight?: string;
  r?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  squawk?: string;
  category?: number;
  seen?: number;
  messages?: number;
}

interface AdsbLolResponse {
  ac: AdsbLolAircraft[];
  now: number;
  total: number;
  msg: string;
}

export class AdsbLolAdapter implements DataAdapter<AviationPosition> {
  readonly sourceId = "adsb_lol";
  readonly category = "aviation" as const;
  private httpClient;

  constructor(options: { timeoutMs?: number } = {}) {
    this.httpClient = createHttpClient({
      timeoutMs: options.timeoutMs ?? 20000,
      rateLimitMs: 2000,
    });
  }

  async fetch(): Promise<AdapterFetchResult<AviationPosition>> {
    const startedAt = Date.now();
    try {
      const response = await this.httpClient.get("https://api.adsb.lol/v2/mil");
      if (!response.ok) {
        return {
          success: false,
          data: [],
          error: `ADSB.lol returned ${response.status}`,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        };
      }
      const payload = (await response.json()) as AdsbLolResponse;
      const aircraft = payload.ac ?? [];
      const now = payload.now ?? Date.now() / 1000;

      const positions: AviationPosition[] = aircraft
        .filter(
          (a): a is AdsbLolAircraft & { lat: number; lon: number } =>
            typeof a.lat === "number" && typeof a.lon === "number",
        )
        .map((a) => ({
          id: `adsb_${a.hex}_${now}`,
          source: "adsb_lol" as const,
          icao24: a.hex.toLowerCase(),
          callsign: a.flight ? a.flight.trim() : null,
          originCountry: a.r ?? null,
          lat: a.lat,
          lon: a.lon,
          altitudeM: a.alt_baro ?? null,
          velocityMps: a.gs !== undefined ? a.gs * 0.514444 : null,
          headingDeg: a.track ?? null,
          verticalRateMps: a.baro_rate ?? null,
          onGround: a.alt_baro === 0 || (a.alt_baro ?? 0) < 50,
          squawk: a.squawk ?? null,
          category: a.category ?? null,
          observedAt: new Date(now * 1000).toISOString(),
        }));

      return {
        success: true,
        data: positions,
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        error: error instanceof Error ? error.message : String(error),
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      };
    }
  }
}

export function createAdsbLolAdapter(input?: { timeoutMs?: number }): AdsbLolAdapter {
  return new AdsbLolAdapter(input);
}
