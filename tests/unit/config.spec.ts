import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getConfigFromEnv,
  isDevelopment,
  isProduction,
  validateConfig,
} from "../../packages/config/src/index.js";

describe("config validation", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getConfigFromEnv", () => {
    it("returns config with defaults when env vars not set", () => {
      delete process.env.DATABASE_URL;
      delete process.env.API_PORT;
      delete process.env.WEB_PORT;
      delete process.env.LOG_LEVEL;
      delete process.env.AUTH_ENABLED;
      delete process.env.REDIS_URL;
      delete process.env.OPENSKY_CLIENT_ID;
      delete process.env.OPENSKY_CLIENT_SECRET;
      delete process.env.LIVE_FLIGHTS_REFRESH_MS;
      delete process.env.LIVE_FLIGHTS_CACHE_TTL_MS;
      delete process.env.LIVE_FLIGHT_HISTORY_POINTS;
      delete process.env.LIVE_FLIGHT_LIMIT;
      delete process.env.AUTO_REFRESH_EXTERNAL_LAYERS;
      delete process.env.AUTO_REFRESH_INCIDENT_INTELLIGENCE;
      delete process.env.INCIDENT_INTELLIGENCE_REFRESH_MS;
      delete process.env.INCIDENT_INTELLIGENCE_MAX_INCIDENTS_PER_SWEEP;
      delete process.env.YOUTUBE_API_KEY;
      delete process.env.SWAN_ARTIFACT_ROOT;
      delete process.env.SWAN_MAX_THREADS_PER_SESSION;
      delete process.env.SWAN_MAX_GLOBAL_THREADS;
      delete process.env.SWAN_SESSION_IDLE_TTL_MS;
      delete process.env.SWAN_WATCH_INTERVAL_MS;
      delete process.env.SWAN_PROVIDER_ALLOWLIST;
      delete process.env.NODE_ENV;

      const config = getConfigFromEnv();

      expect(config.databaseUrl).toBe("");
      expect(config.apiPort).toBe(3000);
      expect(config.webPort).toBe(3001);
      expect(config.logLevel).toBe("info");
      expect(config.authEnabled).toBe(true);
      expect(config.redisUrl).toBe(null);
      expect(config.openSkyClientId).toBe(null);
      expect(config.openSkyClientSecret).toBe(null);
      expect(config.liveFlightsRefreshMs).toBe(900000);
      expect(config.liveFlightsCacheTtlMs).toBe(1800000);
      expect(config.liveFlightHistoryPoints).toBe(18);
      expect(config.liveFlightLimit).toBe(7000);
      expect(config.autoRefreshExternalLayers).toBe(true);
      expect(config.autoRefreshIncidentIntelligence).toBe(false);
      expect(config.incidentIntelligenceRefreshMs).toBe(300000);
      expect(config.incidentIntelligenceMaxIncidentsPerSweep).toBe(10);
      expect(config.youtubeApiKey).toBe(null);
      expect(config.swanArtifactRoot).toBe("./runtime/swan");
      expect(config.swanMaxThreadsPerSession).toBe(5);
      expect(config.swanMaxGlobalThreads).toBe(20);
      expect(config.swanSessionIdleTtlMs).toBe(1800000);
      expect(config.swanWatchIntervalMs).toBe(60000);
      expect(config.swanProviderAllowlist).toEqual([
        "app_context",
        "existing_external_layers",
        "external_research",
      ]);
    });

    it("parses port numbers from environment", () => {
      process.env.API_PORT = "4000";
      process.env.WEB_PORT = "4001";

      const config = getConfigFromEnv();

      expect(config.apiPort).toBe(4000);
      expect(config.webPort).toBe(4001);
    });

    it("parses LOG_LEVEL from environment", () => {
      process.env.LOG_LEVEL = "debug";

      const config = getConfigFromEnv();

      expect(config.logLevel).toBe("debug");
    });

    it("parses AUTH_ENABLED from environment", () => {
      process.env.AUTH_ENABLED = "false";

      const config = getConfigFromEnv();

      expect(config.authEnabled).toBe(false);
    });

    it("parses live world configuration from environment", () => {
      process.env.REDIS_URL = "redis://localhost:6379";
      process.env.OPENSKY_CLIENT_ID = "client";
      process.env.OPENSKY_CLIENT_SECRET = "secret";
      process.env.LIVE_FLIGHTS_REFRESH_MS = "180000";
      process.env.LIVE_FLIGHTS_CACHE_TTL_MS = "600000";
      process.env.LIVE_FLIGHT_HISTORY_POINTS = "24";
      process.env.LIVE_FLIGHT_LIMIT = "5000";
      process.env.AUTO_REFRESH_EXTERNAL_LAYERS = "false";
      process.env.AUTO_REFRESH_INCIDENT_INTELLIGENCE = "true";
      process.env.INCIDENT_INTELLIGENCE_REFRESH_MS = "180000";
      process.env.INCIDENT_INTELLIGENCE_MAX_INCIDENTS_PER_SWEEP = "4";
      process.env.YOUTUBE_API_KEY = "youtube-test-key";

      const config = getConfigFromEnv();

      expect(config.redisUrl).toBe("redis://localhost:6379");
      expect(config.openSkyClientId).toBe("client");
      expect(config.openSkyClientSecret).toBe("secret");
      expect(config.liveFlightsRefreshMs).toBe(180000);
      expect(config.liveFlightsCacheTtlMs).toBe(600000);
      expect(config.liveFlightHistoryPoints).toBe(24);
      expect(config.liveFlightLimit).toBe(5000);
      expect(config.autoRefreshExternalLayers).toBe(false);
      expect(config.autoRefreshIncidentIntelligence).toBe(true);
      expect(config.incidentIntelligenceRefreshMs).toBe(180000);
      expect(config.incidentIntelligenceMaxIncidentsPerSweep).toBe(4);
      expect(config.youtubeApiKey).toBe("youtube-test-key");
    });

    it("parses swan configuration from environment", () => {
      process.env.SWAN_ARTIFACT_ROOT = "./tmp/swan";
      process.env.SWAN_MAX_THREADS_PER_SESSION = "3";
      process.env.SWAN_MAX_GLOBAL_THREADS = "12";
      process.env.SWAN_SESSION_IDLE_TTL_MS = "90000";
      process.env.SWAN_WATCH_INTERVAL_MS = "15000";
      process.env.SWAN_PROVIDER_ALLOWLIST = "app_context,external_research";

      const config = getConfigFromEnv();

      expect(config.swanArtifactRoot).toBe("./tmp/swan");
      expect(config.swanMaxThreadsPerSession).toBe(3);
      expect(config.swanMaxGlobalThreads).toBe(12);
      expect(config.swanSessionIdleTtlMs).toBe(90000);
      expect(config.swanWatchIntervalMs).toBe(15000);
      expect(config.swanProviderAllowlist).toEqual(["app_context", "external_research"]);
    });
  });

  describe("validateConfig", () => {
    it("returns valid for complete config", () => {
      const config = {
        databaseUrl: "postgres://user:pass@localhost:5432/db",
        apiPort: 3000,
        webPort: 3001,
        logLevel: "info" as const,
        authEnabled: true,
        redisUrl: "redis://localhost:6379",
        openSkyClientId: null,
        openSkyClientSecret: null,
        liveFlightsRefreshMs: 900000,
        liveFlightsCacheTtlMs: 1800000,
        liveFlightHistoryPoints: 18,
        liveFlightLimit: 7000,
        autoRefreshExternalLayers: true,
        autoRefreshIncidentIntelligence: false,
        incidentIntelligenceRefreshMs: 300000,
        incidentIntelligenceMaxIncidentsPerSweep: 10,
        autoRefreshRealtimeNews: false,
        realtimeNewsRefreshMs: 60000,
        youtubeApiKey: null,
        swanArtifactRoot: "./runtime/swan",
        swanMaxThreadsPerSession: 5,
        swanMaxGlobalThreads: 20,
        swanSessionIdleTtlMs: 1800000,
        swanWatchIntervalMs: 60000,
        swanProviderAllowlist: ["app_context"],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns error for missing DATABASE_URL", () => {
      const config = {
        databaseUrl: "",
        apiPort: 3000,
        webPort: 3001,
        logLevel: "info" as const,
        authEnabled: true,
        redisUrl: null,
        openSkyClientId: null,
        openSkyClientSecret: null,
        liveFlightsRefreshMs: 900000,
        liveFlightsCacheTtlMs: 1800000,
        liveFlightHistoryPoints: 18,
        liveFlightLimit: 7000,
        autoRefreshExternalLayers: true,
        autoRefreshIncidentIntelligence: false,
        incidentIntelligenceRefreshMs: 300000,
        incidentIntelligenceMaxIncidentsPerSweep: 10,
        autoRefreshRealtimeNews: false,
        realtimeNewsRefreshMs: 60000,
        youtubeApiKey: null,
        swanArtifactRoot: "./runtime/swan",
        swanMaxThreadsPerSession: 5,
        swanMaxGlobalThreads: 20,
        swanSessionIdleTtlMs: 1800000,
        swanWatchIntervalMs: 60000,
        swanProviderAllowlist: ["app_context"],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("DATABASE_URL is required");
    });

    it("returns error for invalid API_PORT", () => {
      const config = {
        databaseUrl: "postgres://user:pass@localhost:5432/db",
        apiPort: 0,
        webPort: 3001,
        logLevel: "info" as const,
        authEnabled: true,
        redisUrl: null,
        openSkyClientId: null,
        openSkyClientSecret: null,
        liveFlightsRefreshMs: 900000,
        liveFlightsCacheTtlMs: 1800000,
        liveFlightHistoryPoints: 18,
        liveFlightLimit: 7000,
        autoRefreshExternalLayers: true,
        autoRefreshIncidentIntelligence: false,
        incidentIntelligenceRefreshMs: 300000,
        incidentIntelligenceMaxIncidentsPerSweep: 10,
        autoRefreshRealtimeNews: false,
        realtimeNewsRefreshMs: 60000,
        youtubeApiKey: null,
        swanArtifactRoot: "./runtime/swan",
        swanMaxThreadsPerSession: 5,
        swanMaxGlobalThreads: 20,
        swanSessionIdleTtlMs: 1800000,
        swanWatchIntervalMs: 60000,
        swanProviderAllowlist: ["app_context"],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("API_PORT must be a valid port number");
    });

    it("returns error for invalid LOG_LEVEL", () => {
      const config = {
        databaseUrl: "postgres://user:pass@localhost:5432/db",
        apiPort: 3000,
        webPort: 3001,
        logLevel: "invalid" as never,
        authEnabled: true,
        redisUrl: null,
        openSkyClientId: null,
        openSkyClientSecret: null,
        liveFlightsRefreshMs: 900000,
        liveFlightsCacheTtlMs: 1800000,
        liveFlightHistoryPoints: 18,
        liveFlightLimit: 7000,
        autoRefreshExternalLayers: true,
        autoRefreshIncidentIntelligence: false,
        incidentIntelligenceRefreshMs: 300000,
        incidentIntelligenceMaxIncidentsPerSweep: 10,
        autoRefreshRealtimeNews: false,
        realtimeNewsRefreshMs: 60000,
        youtubeApiKey: null,
        swanArtifactRoot: "./runtime/swan",
        swanMaxThreadsPerSession: 5,
        swanMaxGlobalThreads: 20,
        swanSessionIdleTtlMs: 1800000,
        swanWatchIntervalMs: 60000,
        swanProviderAllowlist: ["app_context"],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("LOG_LEVEL must be one of: debug, info, warn, error");
    });

    it("returns multiple errors for multiple issues", () => {
      const config = {
        databaseUrl: "",
        apiPort: 0,
        webPort: -1,
        logLevel: "invalid" as never,
        authEnabled: true,
        redisUrl: null,
        openSkyClientId: null,
        openSkyClientSecret: null,
        liveFlightsRefreshMs: 0,
        liveFlightsCacheTtlMs: 0,
        liveFlightHistoryPoints: 0,
        liveFlightLimit: 0,
        autoRefreshExternalLayers: true,
        autoRefreshIncidentIntelligence: false,
        incidentIntelligenceRefreshMs: 0,
        incidentIntelligenceMaxIncidentsPerSweep: 0,
        autoRefreshRealtimeNews: false,
        realtimeNewsRefreshMs: 10000,
        youtubeApiKey: null,
        swanArtifactRoot: "",
        swanMaxThreadsPerSession: 0,
        swanMaxGlobalThreads: 0,
        swanSessionIdleTtlMs: 0,
        swanWatchIntervalMs: 0,
        swanProviderAllowlist: [],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe("isProduction/isDevelopment", () => {
    it("returns false when NODE_ENV is not set", () => {
      delete process.env.NODE_ENV;

      expect(isProduction()).toBe(false);
      expect(isDevelopment()).toBe(false);
    });

    it("returns true for production", () => {
      process.env.NODE_ENV = "production";

      expect(isProduction()).toBe(true);
      expect(isDevelopment()).toBe(false);
    });

    it("returns true for development", () => {
      process.env.NODE_ENV = "development";

      expect(isDevelopment()).toBe(true);
      expect(isProduction()).toBe(false);
    });
  });
});
