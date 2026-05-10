export type DataSourceCategory =
  | "aviation"
  | "news"
  | "weather"
  | "space"
  | "maps"
  | "finance"
  | "social"
  | "security"
  | "utility"
  | "intelligence";

export type DataSourceStatus = "active" | "inactive" | "error";

export interface DataSourceConfig {
  sourceId: string;
  category: DataSourceCategory;
  displayName: string;
  description: string;
  provider: string;
  baseUrl: string | null;
  apiKeyRequired: boolean;
  rateLimitRequestsPerMin: number;
  updateCadenceSeconds: number;
  status: DataSourceStatus;
  config: Record<string, unknown>;
}

export interface DataSourceRegistryEntry extends DataSourceConfig {
  lastFetchAt: string | null;
  lastError: string | null;
}

export interface AviationPosition {
  id: string;
  source: "opensky" | "adsb_lol";
  icao24: string;
  callsign: string | null;
  originCountry: string | null;
  lat: number;
  lon: number;
  altitudeM: number | null;
  velocityMps: number | null;
  headingDeg: number | null;
  verticalRateMps: number | null;
  onGround: boolean;
  squawk: string | null;
  category: number | null;
  observedAt: string;
}

export interface NewsArticle {
  articleId: string;
  source: "newsapi" | "mediastack" | "gdelt";
  sourceName: string;
  author: string | null;
  title: string;
  description: string;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
  category: string | null;
  country: string | null;
  language: string | null;
  lat: number | null;
  lon: number | null;
  rawTags: string[];
}

export interface WeatherObservation {
  observationId: string;
  source: "openweathermap" | "noaa";
  stationId: string | null;
  lat: number;
  lon: number;
  observedAt: string;
  temperatureC: number | null;
  feelsLikeC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  windSpeedMps: number | null;
  windDeg: number | null;
  windGustMps: number | null;
  visibilityM: number | null;
  cloudCoverPct: number | null;
  weatherCondition: string | null;
  weatherIcon: string | null;
  precipitation1hMm: number | null;
  precipitation3hMm: number | null;
  uvIndex: number | null;
  airQualityIndex: number | null;
}

export interface WeatherAlert {
  alertId: string;
  source: "noaa" | "openweathermap";
  eventType: string;
  headline: string;
  description: string;
  severity: string | null;
  urgency: string | null;
  areaDesc: string | null;
  lat: number | null;
  lon: number | null;
  radiusKm: number | null;
  polygonGeojson: Record<string, unknown> | null;
  effectiveAt: string | null;
  expiresAt: string | null;
  issuedAt: string;
}

export interface SpaceData {
  id: string;
  source: "nasa" | "sentinel_hub" | "celestrak";
  dataType: string;
  title: string;
  description: string;
  url: string | null;
  thumbnailUrl: string | null;
  lat: number | null;
  lon: number | null;
  observedAt: string | null;
  satelliteId: string | null;
  satelliteName: string | null;
  instrument: string | null;
  resolutionM: number | null;
  cloudCoverPct: number | null;
  caption: string | null;
  mediaType: "image" | "video" | "dataset" | "event" | "near_earth_object" | "mars_photo" | null;
  payload: Record<string, unknown>;
}

export interface FinancialData {
  id: string;
  source: "alpha_vantage" | "fred" | "coingecko";
  symbol: string;
  name: string;
  assetType: "stock" | "crypto" | "economic_indicator" | "exchange_rate" | "commodity";
  priceUsd: number | null;
  marketCapUsd: number | null;
  volume24h: number | null;
  change24hPct: number | null;
  high24h: number | null;
  low24h: number | null;
  timestamp: string;
  currency: string;
  metadata: Record<string, unknown>;
}

export interface SocialPost {
  postId: string;
  source: "reddit" | "bluesky";
  externalId: string;
  author: string;
  authorDisplayName: string | null;
  subreddit: string | null;
  title: string;
  body: string;
  url: string | null;
  score: number;
  numComments: number;
  upvoteRatio: number | null;
  createdUtc: string;
  permalink: string | null;
  thumbnail: string | null;
  lat: number | null;
  lon: number | null;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface ThreatIntel {
  id: string;
  source: "abuseipdb" | "otx" | "shodan";
  ipAddress: string | null;
  domain: string | null;
  port: number | null;
  protocol: string | null;
  threatType: string | null;
  threatCategory: string[];
  confidence: number;
  severity: "low" | "medium" | "high" | "critical" | null;
  isWhitelisted: boolean;
  countryCode: string | null;
  lat: number | null;
  lon: number | null;
  isp: string | null;
  org: string | null;
  abuseConfidence: number | null;
  lastReportedAt: string | null;
  totalReports: number | null;
  description: string | null;
  tags: string[];
  firstSeen: string | null;
  lastSeen: string;
}

export interface UtilityData {
  id: string;
  source: "rest_countries" | "ipinfo";
  dataType: string;
  queryKey: string;
  value: Record<string, unknown>;
  lat: number | null;
  lon: number | null;
  observedAt: string;
}

export interface SeismicEvent {
  eventId: string;
  source: "usgs" | "emsc";
  externalId: string;
  magnitude: number;
  magnitudeType: "ml" | "mw" | "mb" | "md";
  depthKm: number;
  lat: number;
  lon: number;
  locationName: string;
  country: string;
  observedAt: string;
  tsunamiWarning: boolean;
  feltReports: number;
  significant: boolean;
  dataType: "earthquake" | "explosion" | "quarry";
}

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

export interface CustomIntel {
  intelId: string;
  sourceId: string;
  sourceName: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  lat: number | null;
  lon: number | null;
  tags: string[];
  metadata: Record<string, unknown>;
  receivedAt: string;
}

export interface AdapterFetchResult<T> {
  success: boolean;
  data: T[];
  error?: string;
  fetchedAt: string;
  durationMs: number;
}

export interface DataAdapter<T> {
  readonly sourceId: string;
  readonly category: DataSourceCategory;
  fetch(): Promise<AdapterFetchResult<T>>;
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
