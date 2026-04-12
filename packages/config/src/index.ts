export interface AppConfig {
  databaseUrl: string;
  apiPort: number;
  webPort: number;
  logLevel: "debug" | "info" | "warn" | "error";
  authEnabled: boolean;
  swanArtifactRoot: string;
  swanMaxThreadsPerSession: number;
  swanMaxGlobalThreads: number;
  swanSessionIdleTtlMs: number;
  swanWatchIntervalMs: number;
  swanProviderAllowlist: string[];
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

  return {
    databaseUrl: databaseUrl ?? "",
    apiPort,
    webPort,
    logLevel,
    authEnabled,
    swanArtifactRoot,
    swanMaxThreadsPerSession,
    swanMaxGlobalThreads,
    swanSessionIdleTtlMs,
    swanWatchIntervalMs,
    swanProviderAllowlist,
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
  if (!value) {
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
