/**
 * Custom Intel Adapter
 *
 * Manages custom intelligence sources and observations.
 * Provides a flexible framework for adding external intelligence data.
 */

import type { ExternalDataEvent, ExternalDataSource, FetchResult } from "../types.js";

export interface CustomIntelSource {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  provider: string;
  license: string;
  status: "active" | "inactive" | "error";
  updateCadenceSeconds: number;
}

export interface CustomIntelObservation {
  intelId: string;
  sourceId: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  lat: number | null;
  lon: number | null;
  tags: string[];
  metadata: Record<string, unknown>;
  receivedAt: string;
}

/**
 * Adapter for custom intelligence data.
 * Fetches from internal API endpoint /api/custom-intel
 */
export class CustomIntelAdapter {
  readonly source: ExternalDataSource = {
    layerId: "custom_intel",
    label: "Custom Intelligence",
    provider: "Internal",
    license: "Proprietary",
    status: "real",
    updateCadenceSeconds: 300,
    toggleable: true,
  };

  private apiBaseUrl: string;

  constructor(apiBaseUrl = "/api") {
    this.apiBaseUrl = apiBaseUrl;
  }

  async fetchSources(): Promise<FetchResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.apiBaseUrl}/custom-intel/sources`);
      if (!response.ok) {
        return {
          success: false,
          events: [],
          error: `HTTP ${response.status}: ${response.statusText}`,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };
      }

      const sources: CustomIntelSource[] = await response.json();
      const events: ExternalDataEvent[] = sources.map((s) => ({
        eventId: `source_${s.sourceId}`,
        externalId: s.sourceId,
        layerId: "custom_intel",
        eventType: "intel_source_registered",
        observedAt: new Date().toISOString(),
        lat: 0,
        lon: 0,
        payload: s as unknown as Record<string, unknown>,
      }));

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

  async fetchIntel(sourceId?: string): Promise<FetchResult> {
    const startTime = Date.now();

    try {
      const url = sourceId
        ? `${this.apiBaseUrl}/custom-intel?sourceId=${encodeURIComponent(sourceId)}`
        : `${this.apiBaseUrl}/custom-intel`;

      const response = await fetch(url);
      if (!response.ok) {
        return {
          success: false,
          events: [],
          error: `HTTP ${response.status}: ${response.statusText}`,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };
      }

      const observations: CustomIntelObservation[] = await response.json();
      const events: ExternalDataEvent[] = observations.map((obs) => ({
        eventId: obs.intelId,
        externalId: obs.intelId,
        layerId: "custom_intel",
        eventType: "intel_observation_received",
        observedAt: obs.receivedAt,
        lat: obs.lat ?? 0,
        lon: obs.lon ?? 0,
        payload: obs as unknown as Record<string, unknown>,
      }));

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

  async fetch(): Promise<FetchResult> {
    return this.fetchIntel();
  }
}

export function createCustomIntelAdapter(apiBaseUrl?: string): CustomIntelAdapter {
  return new CustomIntelAdapter(apiBaseUrl);
}
