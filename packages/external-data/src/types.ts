/**
 * External Data Layer Types
 *
 * Defines the contracts for integrating external data sources into MORDOR.
 * All external data must be explicitly marked as real, degraded, or unavailable.
 */

/**
 * Status of an external data layer.
 * - real: Live data from legitimate API with working data path
 * - degraded: Partial data available, rate limited, or delayed
 * - unavailable: No legitimate source available or source violates terms
 */
export type LayerStatus = "real" | "degraded" | "unavailable";

/**
 * Metadata about an external data layer source.
 */
export interface ExternalDataSource {
  /** Unique identifier for the layer */
  layerId: string;

  /** Display label for the UI */
  label: string;

  /** Provider/organization name */
  provider: string;

  /** URL of the data source (if public) */
  sourceUrl?: string;

  /** License type */
  license: string;

  /** Current status of the layer */
  status: LayerStatus;

  /** Update cadence in seconds */
  updateCadenceSeconds: number;

  /** Whether the layer can be toggled on/off */
  toggleable: boolean;
}

/**
 * Current state of an external data layer.
 */
export interface LayerState extends ExternalDataSource {
  /** Number of records currently available (null if unavailable) */
  count: number | null;

  /** ISO timestamp of last successful fetch */
  lastUpdate: string | null;

  /** Error message if status is unavailable or degraded */
  errorMessage: string | null;

  /** Whether the layer is currently enabled in the UI */
  enabled: boolean;

  /** Data freshness in seconds (null if unavailable) */
  freshnessSeconds: number | null;
}

/**
 * A normalized external data event.
 */
export interface ExternalDataEvent {
  /** Unique identifier for this event */
  eventId: string;

  /** ID from the external source */
  externalId: string;

  /** Layer this event belongs to */
  layerId: string;

  /** Event type */
  eventType: string;

  /** When the event was observed (ISO timestamp) */
  observedAt: string;

  /** Latitude */
  lat: number;

  /** Longitude */
  lon: number;

  /** Altitude in meters (optional) */
  altitudeM?: number | null;

  /** Raw payload from source */
  payload: Record<string, unknown>;
}

/**
 * Result of fetching data from an external source.
 */
export interface FetchResult {
  /** Whether the fetch was successful */
  success: boolean;

  /** Events retrieved (empty if failed) */
  events: ExternalDataEvent[];

  /** Error message if failed */
  error?: string;

  /** HTTP status code if applicable */
  statusCode?: number;

  /** When the fetch completed */
  fetchedAt: string;

  /** Time taken for the fetch in milliseconds */
  durationMs: number;
}

/**
 * Configuration for an external data adapter.
 */
export interface AdapterConfig {
  /** Request timeout in milliseconds */
  timeoutMs: number;

  /** Rate limit - minimum milliseconds between requests */
  rateLimitMs: number;

  /** Maximum retries on failure */
  maxRetries: number;

  /** API key (if required) */
  apiKey?: string;

  /** Base URL for the API */
  baseUrl?: string;
}

/**
 * Default adapter configuration.
 */
export const DEFAULT_ADAPTER_CONFIG: AdapterConfig = {
  timeoutMs: 30000,
  rateLimitMs: 5000,
  maxRetries: 3,
};

/**
 * Cache entry for external data.
 */
export interface CacheEntry {
  layerId: string;
  events: ExternalDataEvent[];
  fetchedAt: string;
  expiresAt: string;
}

/**
 * Health status of an external data source.
 */
export interface SourceHealth {
  layerId: string;
  status: LayerStatus;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
  errorMessage: string | null;
}
