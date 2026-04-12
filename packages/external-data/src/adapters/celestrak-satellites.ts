/**
 * CelesTrak Satellite Adapter
 *
 * Fetches satellite TLE (Two-Line Element) data from CelesTrak.
 * Source: https://celestrak.org/
 * License: Public Domain (NASA/DoD data)
 *
 * Provides TLE data for active satellites, which can be propagated
 * to get current positions using SGP4 orbital mechanics.
 */

import { createHttpClient } from "../http-client.js";
import type { ExternalDataEvent, ExternalDataSource, FetchResult } from "../types.js";

/**
 * TLE (Two-Line Element) set for a satellite.
 */
export interface TLESet {
  /** Satellite name */
  name: string;

  /** NORAD catalog number */
  noradId: string;

  /** Classification (U=unclassified, C=classified, S=secret) */
  classification: string;

  /** International designator */
  intDesignator: string;

  /** Epoch year (last two digits) */
  epochYear: number;

  /** Day of year (fractional) */
  epochDay: number;

  /** First time derivative of mean motion (ballistic coefficient) */
  firstDerivative: number;

  /** Second time derivative of mean motion */
  secondDerivative: number;

  /** BSTAR drag term */
  bstar: number;

  /** Element set type */
  ephemerisType: number;

  /** Element number */
  elementNumber: number;

  /** Inclination (degrees) */
  inclination: number;

  /** Right ascension of ascending node (degrees) */
  raan: number;

  /** Eccentricity */
  eccentricity: number;

  /** Argument of perigee (degrees) */
  argPerigee: number;

  /** Mean anomaly (degrees) */
  meanAnomaly: number;

  /** Mean motion (revs per day) */
  meanMotion: number;

  /** Revolution number at epoch */
  revNumber: number;

  /** Line 1 of TLE */
  line1: string;

  /** Line 2 of TLE */
  line2: string;
}

/**
 * Propagated satellite position.
 */
export interface SatellitePosition {
  lat: number;
  lon: number;
  altitudeKm: number;
  velocityKmS: number;
  timestamp: Date;
}

/**
 * Satellite category from CelesTrak.
 */
export type SatelliteCategory =
  | "visual"
  | "stations"
  | "active"
  | "analyst"
  | "cosmos-1408-debris"
  | "fengyun-1c-debris"
  | "iridium-33-debris"
  | "cosmos-2251-debris"
  | "1999-025-debris"
  | "indian-asat-debris"
  | "russian-asat-debris"
  | " geostationary"
  | "gps-ops"
  | "glonass-ops"
  | "galileo"
  | "beidou"
  | "sbas"
  | "nnss"
  | "musson"
  | "science"
  | "engineering"
  | "education"
  | "military"
  | "radar"
  | "cubesat"
  | "x-comm"
  | "other-comm"
  | " Planet"
  | "spire"
  | " iridium"
  | "orbcomm"
  | "globalstar"
  | "swarm"
  | "amateur"
  | "experimental"
  | "other"
  | "starlink"
  | "oneweb";

/**
 * CelesTrak Satellite Adapter
 */
export class CelesTrakAdapter {
  readonly source: ExternalDataSource = {
    layerId: "satellites",
    label: "Satellites",
    provider: "CelesTrak (NASA/DoD)",
    sourceUrl: "https://celestrak.org/",
    license: "Public Domain",
    status: "real",
    updateCadenceSeconds: 3600, // TLEs updated every few hours
    toggleable: true,
  };

  private httpClient = createHttpClient({
    timeoutMs: 60000, // TLE files can be large
    rateLimitMs: 60000,
    maxRetries: 3,
  });

  /**
   * Fetch TLE data for a satellite category.
   */
  async fetchTLEs(category: SatelliteCategory = "visual"): Promise<FetchResult> {
    const startTime = Date.now();

    try {
      // CelesTrak GP (General Perturbations) data URL
      const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${category}&FORMAT=tle`;

      const response = await this.httpClient.get(url);

      if (!response.ok) {
        return {
          success: false,
          events: [],
          error: `CelesTrak API returned ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };
      }

      const text = await response.text();
      const tles = this.parseTLEs(text);

      // Propagate each satellite to current position
      const events: ExternalDataEvent[] = [];
      const now = new Date();

      for (const tle of tles.slice(0, 100)) {
        // Limit to first 100 for performance
        const position = this.propagateSGP4(tle, now);
        if (position) {
          events.push(this.normalize(tle, position));
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
   * Parse TLE text into structured format.
   */
  private parseTLEs(text: string): TLESet[] {
    const lines = text.trim().split("\n");
    const tles: TLESet[] = [];

    for (let i = 0; i < lines.length; i += 3) {
      if (i + 2 >= lines.length) break;

      const name = lines[i].trim();
      const line1 = lines[i + 1].trim();
      const line2 = lines[i + 2].trim();

      // Validate TLE format
      if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) {
        continue;
      }

      tles.push(this.parseTLELines(name, line1, line2));
    }

    return tles;
  }

  /**
   * Parse individual TLE lines.
   */
  private parseTLELines(name: string, line1: string, line2: string): TLESet {
    // Parse line 1
    const noradId = line1.substring(2, 7).trim();
    const classification = line1.substring(7, 8).trim() || "U";
    const intDesignator = line1.substring(9, 17).trim();
    const epochYear = Number.parseInt(line1.substring(18, 20), 10);
    const epochDay = Number.parseFloat(line1.substring(20, 32));
    const firstDerivative = Number.parseFloat(line1.substring(33, 43));
    const secondDerivative = this.parseScientific(line1.substring(44, 52));
    const bstar = this.parseScientific(line1.substring(53, 61));
    const ephemerisType = Number.parseInt(line1.substring(62, 63), 10);
    const elementNumber = Number.parseInt(line1.substring(64, 68), 10);

    // Parse line 2
    const inclination = Number.parseFloat(line2.substring(8, 16));
    const raan = Number.parseFloat(line2.substring(17, 25));
    const eccentricity = Number.parseFloat(`0.${line2.substring(26, 33).trim()}`);
    const argPerigee = Number.parseFloat(line2.substring(34, 42));
    const meanAnomaly = Number.parseFloat(line2.substring(43, 51));
    const meanMotion = Number.parseFloat(line2.substring(52, 63));
    const revNumber = Number.parseInt(line2.substring(63, 68), 10);

    return {
      name,
      noradId,
      classification,
      intDesignator,
      epochYear,
      epochDay,
      firstDerivative,
      secondDerivative,
      bstar,
      ephemerisType,
      elementNumber,
      inclination,
      raan,
      eccentricity,
      argPerigee,
      meanAnomaly,
      meanMotion,
      revNumber,
      line1,
      line2,
    };
  }

  /**
   * Parse scientific notation from TLE (e.g., "+12345-4" -> 1.2345e-4).
   */
  private parseScientific(str: string): number {
    const mantissa = str.substring(0, 6);
    const exponent = str.substring(6, 8);
    const value = Number.parseFloat(mantissa) * 10 ** Number.parseInt(exponent, 10);
    return value;
  }

  /**
   * Simplified SGP4 propagation (placeholder for actual SGP4 implementation).
   * Returns approximate position for visualization purposes.
   */
  private propagateSGP4(tle: TLESet, date: Date): SatellitePosition | null {
    try {
      // Calculate time since epoch in minutes
      const epochDate = this.epochToDate(tle.epochYear, tle.epochDay);
      const minutesSinceEpoch = (date.getTime() - epochDate.getTime()) / 60000;

      // Simple circular orbit approximation (NOT for precise tracking)
      // For production, use a proper SGP4 implementation like satellite.js
      const meanAnomalyRad =
        ((tle.meanAnomaly + (tle.meanMotion * minutesSinceEpoch * 360) / 1440) % 360) *
        (Math.PI / 180);

      // Semi-major axis from mean motion (simplified)
      const mu = 398600.4418; // Earth's gravitational parameter km^3/s^2
      const n = (tle.meanMotion * 2 * Math.PI) / 86400; // Convert to rad/s
      const a = (mu / (n * n)) ** (1 / 3); // Semi-major axis in km

      // Position in orbital plane
      const r = a * (1 - tle.eccentricity * Math.cos(meanAnomalyRad));
      const xOrbital = r * Math.cos(meanAnomalyRad);
      const yOrbital = r * Math.sin(meanAnomalyRad);

      // Transform to ECI (simplified - ignoring inclination, RAAN, argument of perigee for demo)
      // For accurate tracking, full rotation matrices are needed
      const incRad = tle.inclination * (Math.PI / 180);
      const raanRad = tle.raan * (Math.PI / 180);

      // Simplified ECI position
      const xECI = xOrbital * Math.cos(raanRad) - yOrbital * Math.cos(incRad) * Math.sin(raanRad);
      const yECI = xOrbital * Math.sin(raanRad) + yOrbital * Math.cos(incRad) * Math.cos(raanRad);
      const zECI = yOrbital * Math.sin(incRad);

      // Convert ECI to lat/lon (simplified, ignoring Earth's rotation for short time spans)
      const lat = Math.asin(zECI / r) * (180 / Math.PI);
      const lon = Math.atan2(yECI, xECI) * (180 / Math.PI);

      // Altitude
      const earthRadiusKm = 6378.137;
      const altitudeKm = r - earthRadiusKm;

      // Velocity (circular orbit approximation)
      const velocityKmS = Math.sqrt(mu / r);

      return {
        lat,
        lon,
        altitudeKm,
        velocityKmS,
        timestamp: date,
      };
    } catch {
      return null;
    }
  }

  /**
   * Convert TLE epoch to JavaScript Date.
   */
  private epochToDate(year: number, day: number): Date {
    const fullYear = year < 57 ? 2000 + year : 1900 + year; // 1957 was first satellite
    const date = new Date(Date.UTC(fullYear, 0, 1));
    date.setUTCDate(1 + Math.floor(day - 1));
    date.setUTCHours(0, 0, 0, 0);
    const fractionalDay = day % 1;
    date.setTime(date.getTime() + fractionalDay * 24 * 60 * 60 * 1000);
    return date;
  }

  /**
   * Normalize TLE and position to our canonical event format.
   */
  private normalize(tle: TLESet, position: SatellitePosition): ExternalDataEvent {
    // Determine satellite type based on name/ID patterns
    let satType = "unknown";
    const nameLower = tle.name.toLowerCase();

    if (nameLower.includes("iss") || nameLower.includes("space station")) {
      satType = "space_station";
    } else if (nameLower.includes("starlink")) {
      satType = "starlink";
    } else if (tle.meanMotion > 11) {
      satType = "leo"; // Low Earth Orbit
    } else if (tle.meanMotion > 1.5) {
      satType = "meo"; // Medium Earth Orbit
    } else if (tle.meanMotion > 0.9 && tle.meanMotion < 1.1) {
      satType = "geo"; // Geostationary
    } else {
      satType = "heo"; // Highly Elliptical Orbit
    }

    return {
      eventId: `sat_${tle.noradId}`,
      externalId: tle.noradId,
      layerId: "satellites",
      eventType: "satellite_observed",
      observedAt: position.timestamp.toISOString(),
      lat: position.lat,
      lon: position.lon,
      altitudeM: position.altitudeKm * 1000,
      payload: {
        name: tle.name,
        noradId: tle.noradId,
        intDesignator: tle.intDesignator,
        line1: tle.line1,
        line2: tle.line2,
        type: satType,
        inclination: tle.inclination,
        eccentricity: tle.eccentricity,
        period: tle.meanMotion > 0 ? 1440 / tle.meanMotion : null, // minutes
        velocity: position.velocityKmS,
        epoch: this.epochToDate(tle.epochYear, tle.epochDay).toISOString(),
        orbit_path: this.buildOrbitPath(tle, position.timestamp),
      },
    };
  }

  private buildOrbitPath(
    tle: TLESet,
    centerTime: Date,
  ): Array<{ lat: number; lon: number; altitude_m: number | null; observed_at: string }> {
    const points: Array<{
      lat: number;
      lon: number;
      altitude_m: number | null;
      observed_at: string;
    }> = [];
    const periodMinutes = tle.meanMotion > 0 ? 1440 / tle.meanMotion : 90;
    const stepMinutes = Math.max(2, Math.round(periodMinutes / 24));

    for (let offset = -12; offset <= 12; offset += 1) {
      const sampleTime = new Date(centerTime.getTime() + offset * stepMinutes * 60_000);
      const sample = this.propagateSGP4(tle, sampleTime);
      if (!sample) {
        continue;
      }

      points.push({
        lat: sample.lat,
        lon: sample.lon,
        altitude_m: sample.altitudeKm * 1000,
        observed_at: sample.timestamp.toISOString(),
      });
    }

    return points;
  }

  /**
   * Get icon/color for satellite based on type.
   */
  static getSatelliteStyle(type: string): { color: string; pixelSize: number } {
    switch (type) {
      case "space_station":
        return { color: "#fbbf24", pixelSize: 12 }; // Amber, larger
      case "starlink":
        return { color: "#60a5fa", pixelSize: 6 }; // Blue
      case "geo":
        return { color: "#a78bfa", pixelSize: 8 }; // Purple
      case "leo":
        return { color: "#34d399", pixelSize: 6 }; // Green
      case "meo":
        return { color: "#f472b6", pixelSize: 7 }; // Pink
      default:
        return { color: "#9ca3af", pixelSize: 5 }; // Gray
    }
  }
}

/**
 * Create a CelesTrak satellite adapter instance.
 */
export function createCelesTrakAdapter(): CelesTrakAdapter {
  return new CelesTrakAdapter();
}
