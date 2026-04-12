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
