export interface AppConfig {
  databaseUrl: string;
  apiPort: number;
  webPort: number;
  logLevel: "debug" | "info" | "warn" | "error";
  authEnabled: boolean;
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

  return {
    databaseUrl: databaseUrl ?? "",
    apiPort,
    webPort,
    logLevel,
    authEnabled,
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
