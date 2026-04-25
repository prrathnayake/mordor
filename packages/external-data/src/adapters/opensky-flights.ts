import type { ObjectState } from "../../../contracts/src/models.js";

export interface OpenSkyFlightsFetchResult {
  success: boolean;
  states: ObjectState[];
  fetchedAt: string;
  durationMs: number;
  authMode: "authenticated" | "anonymous";
  error?: string;
}

interface OpenSkyStateResponse {
  time: number;
  states: unknown[][];
}

interface OpenSkyTokenResponse {
  access_token: string;
  expires_in: number;
}

export class OpenSkyFlightsAdapter {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(
    private readonly options: {
      clientId?: string;
      clientSecret?: string;
      timeoutMs?: number;
      limit?: number;
    } = {},
  ) {}

  async fetchStates(): Promise<OpenSkyFlightsFetchResult> {
    const startedAt = Date.now();
    const authMode =
      this.options.clientId && this.options.clientSecret ? "authenticated" : "anonymous";

    try {
      const response = await this.fetchStateResponse(authMode === "authenticated");
      if (!response.ok) {
        return {
          success: false,
          states: [],
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          authMode,
          error: `OpenSky returned ${response.status}: ${response.statusText}`,
        };
      }

      const payload = (await response.json()) as OpenSkyStateResponse;
      const observedAt = payload.time
        ? new Date(payload.time * 1000).toISOString()
        : new Date().toISOString();
      const states = (payload.states ?? [])
        .map((vector) => this.normalizeStateVector(vector, observedAt))
        .filter((state): state is ObjectState => state !== null);

      const limit = this.options.limit ?? Number.MAX_SAFE_INTEGER;

      return {
        success: true,
        states: states.slice(0, limit),
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        authMode,
      };
    } catch (error) {
      return {
        success: false,
        states: [],
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        authMode,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async fetchStateResponse(useAuth: boolean): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (useAuth) {
      headers.Authorization = `Bearer ${await this.getAccessToken()}`;
    }

    const response = await this.fetchWithTimeout(
      "https://opensky-network.org/api/states/all?extended=1",
      {
        method: "GET",
        headers,
      },
    );

    if (response.status === 401 && useAuth) {
      this.accessToken = null;
      this.accessTokenExpiresAt = 0;
      headers.Authorization = `Bearer ${await this.getAccessToken()}`;
      return this.fetchWithTimeout("https://opensky-network.org/api/states/all?extended=1", {
        method: "GET",
        headers,
      });
    }

    return response;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 30_000) {
      return this.accessToken;
    }

    if (!this.options.clientId || !this.options.clientSecret) {
      throw new Error("OpenSky client credentials are not configured");
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
    });

    const response = await this.fetchWithTimeout(
      "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );

    if (!response.ok) {
      throw new Error(`OpenSky auth failed with ${response.status}`);
    }

    const tokenResponse = (await response.json()) as OpenSkyTokenResponse;
    this.accessToken = tokenResponse.access_token;
    this.accessTokenExpiresAt = Date.now() + tokenResponse.expires_in * 1000;
    return tokenResponse.access_token;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutMs = this.options.timeoutMs ?? 30000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`OpenSky request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeStateVector(vector: unknown[], observedAt: string): ObjectState | null {
    if (!Array.isArray(vector) || vector.length < 18) {
      return null;
    }

    const icao24 = typeof vector[0] === "string" ? vector[0].trim().toLowerCase() : null;
    const callsign = typeof vector[1] === "string" ? vector[1].trim() : null;
    const originCountry = typeof vector[2] === "string" ? vector[2] : null;
    const lastContact =
      typeof vector[4] === "number" ? new Date(vector[4] * 1000).toISOString() : observedAt;
    const lon = typeof vector[5] === "number" ? vector[5] : null;
    const lat = typeof vector[6] === "number" ? vector[6] : null;
    const baroAltitude = typeof vector[7] === "number" ? vector[7] : null;
    const onGround = typeof vector[8] === "boolean" ? vector[8] : false;
    const velocity = typeof vector[9] === "number" ? vector[9] : null;
    const trueTrack = typeof vector[10] === "number" ? vector[10] : null;
    const verticalRate = typeof vector[11] === "number" ? vector[11] : null;
    const geoAltitude = typeof vector[13] === "number" ? vector[13] : null;
    const squawk = typeof vector[14] === "string" ? vector[14] : null;
    const spi = typeof vector[15] === "boolean" ? vector[15] : false;
    const positionSource = typeof vector[16] === "number" ? vector[16] : null;
    const category = typeof vector[17] === "number" ? vector[17] : null;

    if (!icao24 || lat === null || lon === null) {
      return null;
    }

    const altitude = geoAltitude ?? baroAltitude;

    return {
      object_id: `flt_${icao24}`,
      state_version: String(vector[4] ?? observedAt),
      as_of: lastContact,
      position: {
        lat,
        lon,
        altitude_m: altitude,
      },
      velocity: {
        speed_mps: velocity,
        heading_deg: trueTrack,
      },
      status: onGround ? "ground" : "airborne",
      attributes: {
        provider: "OpenSky Network",
        source_type: "adsb",
        icao24,
        callsign,
        display_name: callsign || icao24.toUpperCase(),
        origin_country: originCountry,
        on_ground: onGround,
        baro_altitude_m: baroAltitude,
        geo_altitude_m: geoAltitude,
        vertical_rate_mps: verticalRate,
        squawk,
        spi,
        position_source: positionSource,
        category,
      },
      last_event_id: `opensky:${icao24}:${vector[4] ?? observedAt}`,
    };
  }
}

export function createOpenSkyFlightsAdapter(input?: {
  clientId?: string;
  clientSecret?: string;
  timeoutMs?: number;
  limit?: number;
}): OpenSkyFlightsAdapter {
  return new OpenSkyFlightsAdapter(input);
}
