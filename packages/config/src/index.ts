export interface AppConfig {
  databaseUrl: string;
  apiPort: number;
  webPort: number;
  logLevel: "debug" | "info" | "warn" | "error";
  authEnabled: boolean;
  redisUrl: string | null;
  openSkyClientId: string | null;
  openSkyClientSecret: string | null;
  liveFlightsRefreshMs: number;
  liveFlightsCacheTtlMs: number;
  liveFlightHistoryPoints: number;
  liveFlightLimit: number;
  autoRefreshExternalLayers: boolean;
  autoRefreshIncidentIntelligence: boolean;
  incidentIntelligenceRefreshMs: number;
  incidentIntelligenceMaxIncidentsPerSweep: number;
  autoRefreshRealtimeNews: boolean;
  realtimeNewsRefreshMs: number;
  youtubeApiKey: string | null;
  swanArtifactRoot: string;
  swanMaxThreadsPerSession: number;
  swanMaxGlobalThreads: number;
  swanSessionIdleTtlMs: number;
  swanWatchIntervalMs: number;
  swanProviderAllowlist: string[];
  openrouterApiKey: string;
  openrouterBaseUrl: string;
  openrouterDefaultModel: string;
  openrouterLightModel: string;
  neo4jUri: string;
  neo4jUser: string;
  neo4jPassword: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

export function getConfigFromEnv(): AppConfig {
  const databaseUrl = process.env.DATABASE_URL;
  const apiPort = process.env.API_PORT ? Number.parseInt(process.env.API_PORT, 10) : 3000;
  const webPort = process.env.WEB_PORT ? Number.parseInt(process.env.WEB_PORT, 10) : 3001;
  const logLevel = (process.env.LOG_LEVEL as AppConfig["logLevel"]) || "info";
  const authEnabled = process.env.AUTH_ENABLED !== "false";
  const redisUrl = process.env.REDIS_URL || null;
  const openSkyClientId = process.env.OPENSKY_CLIENT_ID || null;
  const openSkyClientSecret = process.env.OPENSKY_CLIENT_SECRET || null;
  const liveFlightsRefreshMs = process.env.LIVE_FLIGHTS_REFRESH_MS
    ? Number.parseInt(process.env.LIVE_FLIGHTS_REFRESH_MS, 10)
    : openSkyClientId && openSkyClientSecret
      ? 120000
      : 900000;
  const liveFlightsCacheTtlMs = process.env.LIVE_FLIGHTS_CACHE_TTL_MS
    ? Number.parseInt(process.env.LIVE_FLIGHTS_CACHE_TTL_MS, 10)
    : Math.max(liveFlightsRefreshMs * 2, 300000);
  const liveFlightHistoryPoints = process.env.LIVE_FLIGHT_HISTORY_POINTS
    ? Number.parseInt(process.env.LIVE_FLIGHT_HISTORY_POINTS, 10)
    : 18;
  const liveFlightLimit = process.env.LIVE_FLIGHT_LIMIT
    ? Number.parseInt(process.env.LIVE_FLIGHT_LIMIT, 10)
    : 7000;
  const autoRefreshExternalLayers = process.env.AUTO_REFRESH_EXTERNAL_LAYERS !== "false";
  const autoRefreshIncidentIntelligence = process.env.AUTO_REFRESH_INCIDENT_INTELLIGENCE === "true";
  const incidentIntelligenceRefreshMs = process.env.INCIDENT_INTELLIGENCE_REFRESH_MS
    ? Number.parseInt(process.env.INCIDENT_INTELLIGENCE_REFRESH_MS, 10)
    : 300000;
  const incidentIntelligenceMaxIncidentsPerSweep = process.env
    .INCIDENT_INTELLIGENCE_MAX_INCIDENTS_PER_SWEEP
    ? Number.parseInt(process.env.INCIDENT_INTELLIGENCE_MAX_INCIDENTS_PER_SWEEP, 10)
    : 10;
  const autoRefreshRealtimeNews = process.env.AUTO_REFRESH_REALTIME_NEWS === "true";
  const realtimeNewsRefreshMs = process.env.REALTIME_NEWS_REFRESH_MS
    ? Number.parseInt(process.env.REALTIME_NEWS_REFRESH_MS, 10)
    : 60000;
  const youtubeApiKey = process.env.YOUTUBE_API_KEY || null;
  const swanArtifactRoot = process.env.SWAN_ARTIFACT_ROOT || "./runtime/swan";
  const swanMaxThreadsPerSession = process.env.SWAN_MAX_THREADS_PER_SESSION
    ? Number.parseInt(process.env.SWAN_MAX_THREADS_PER_SESSION, 10)
    : 5;
  const swanMaxGlobalThreads = process.env.SWAN_MAX_GLOBAL_THREADS
    ? Number.parseInt(process.env.SWAN_MAX_GLOBAL_THREADS, 10)
    : 20;
  const swanSessionIdleTtlMs = process.env.SWAN_SESSION_IDLE_TTL_MS
    ? Number.parseInt(process.env.SWAN_SESSION_IDLE_TTL_MS, 10)
    : 1800000;
  const swanWatchIntervalMs = process.env.SWAN_WATCH_INTERVAL_MS
    ? Number.parseInt(process.env.SWAN_WATCH_INTERVAL_MS, 10)
    : 60000;
  const swanProviderAllowlist = (
    process.env.SWAN_PROVIDER_ALLOWLIST || "app_context,existing_external_layers,external_research"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const neo4jUri = process.env.NEO4J_URI || "bolt://127.0.0.1:7687";
  const neo4jUser = process.env.NEO4J_USER || "neo4j";
  const neo4jPassword = process.env.NEO4J_PASSWORD || "password";

  const openrouterApiKey = process.env.OPENROUTER_API_KEY || "";
  const openrouterBaseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  const openrouterDefaultModel =
    process.env.OPENROUTER_DEFAULT_MODEL || "anthropic/claude-3.5-sonnet";
  const openrouterLightModel = process.env.OPENROUTER_LIGHT_MODEL || "openai/gpt-4o-mini";

  return {
    databaseUrl: databaseUrl ?? "",
    apiPort,
    webPort,
    logLevel,
    authEnabled,
    redisUrl,
    openSkyClientId,
    openSkyClientSecret,
    liveFlightsRefreshMs,
    liveFlightsCacheTtlMs,
    liveFlightHistoryPoints,
    liveFlightLimit,
    autoRefreshExternalLayers,
    autoRefreshIncidentIntelligence,
    incidentIntelligenceRefreshMs,
    incidentIntelligenceMaxIncidentsPerSweep,
    autoRefreshRealtimeNews,
    realtimeNewsRefreshMs,
    youtubeApiKey,
    swanArtifactRoot,
    swanMaxThreadsPerSession,
    swanMaxGlobalThreads,
    swanSessionIdleTtlMs,
    swanWatchIntervalMs,
    swanProviderAllowlist,
    openrouterApiKey,
    openrouterBaseUrl,
    openrouterDefaultModel,
    openrouterLightModel,
    neo4jUri,
    neo4jUser,
    neo4jPassword,
  };
}

export function validateConfig(config: AppConfig): ConfigValidationResult {
  const errors: string[] = [];

  if (!config.databaseUrl) {
    errors.push("DATABASE_URL is required");
  }

  if (!config.apiPort || config.apiPort < 1 || config.apiPort > 65535) {
    errors.push("API_PORT must be a valid port number");
  }

  if (!config.webPort || config.webPort < 1 || config.webPort > 65535) {
    errors.push("WEB_PORT must be a valid port number");
  }

  if (!["debug", "info", "warn", "error"].includes(config.logLevel)) {
    errors.push("LOG_LEVEL must be one of: debug, info, warn, error");
  }

  if (!Number.isInteger(config.liveFlightsRefreshMs) || config.liveFlightsRefreshMs < 60000) {
    errors.push("LIVE_FLIGHTS_REFRESH_MS must be at least 60000");
  }

  if (!Number.isInteger(config.liveFlightsCacheTtlMs) || config.liveFlightsCacheTtlMs < 60000) {
    errors.push("LIVE_FLIGHTS_CACHE_TTL_MS must be at least 60000");
  }

  if (!Number.isInteger(config.liveFlightHistoryPoints) || config.liveFlightHistoryPoints < 2) {
    errors.push("LIVE_FLIGHT_HISTORY_POINTS must be at least 2");
  }

  if (!Number.isInteger(config.liveFlightLimit) || config.liveFlightLimit < 100) {
    errors.push("LIVE_FLIGHT_LIMIT must be at least 100");
  }

  if (
    !Number.isInteger(config.incidentIntelligenceRefreshMs) ||
    config.incidentIntelligenceRefreshMs < 60000
  ) {
    errors.push("INCIDENT_INTELLIGENCE_REFRESH_MS must be at least 60000");
  }

  if (
    !Number.isInteger(config.incidentIntelligenceMaxIncidentsPerSweep) ||
    config.incidentIntelligenceMaxIncidentsPerSweep < 1
  ) {
    errors.push("INCIDENT_INTELLIGENCE_MAX_INCIDENTS_PER_SWEEP must be at least 1");
  }

  if (!Number.isInteger(config.realtimeNewsRefreshMs) || config.realtimeNewsRefreshMs < 10000) {
    errors.push("REALTIME_NEWS_REFRESH_MS must be at least 10000");
  }

  if (!config.swanArtifactRoot) {
    errors.push("SWAN_ARTIFACT_ROOT is required");
  }

  if (!Number.isInteger(config.swanMaxThreadsPerSession) || config.swanMaxThreadsPerSession < 1) {
    errors.push("SWAN_MAX_THREADS_PER_SESSION must be a positive integer");
  }

  if (!Number.isInteger(config.swanMaxGlobalThreads) || config.swanMaxGlobalThreads < 1) {
    errors.push("SWAN_MAX_GLOBAL_THREADS must be a positive integer");
  }

  if (!Number.isInteger(config.swanSessionIdleTtlMs) || config.swanSessionIdleTtlMs < 1000) {
    errors.push("SWAN_SESSION_IDLE_TTL_MS must be at least 1000");
  }

  if (!Number.isInteger(config.swanWatchIntervalMs) || config.swanWatchIntervalMs < 1000) {
    errors.push("SWAN_WATCH_INTERVAL_MS must be at least 1000");
  }

  if (config.swanProviderAllowlist.length === 0) {
    errors.push("SWAN_PROVIDER_ALLOWLIST must contain at least one provider");
  }

  if (!config.neo4jUri) {
    errors.push("NEO4J_URI is required");
  }

  if (!config.neo4jUser) {
    errors.push("NEO4J_USER is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function requireConfig(): AppConfig {
  const config = getConfigFromEnv();
  const result = validateConfig(config);

  if (!result.valid) {
    console.error("Configuration validation failed:");
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  return config;
}

export function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}
