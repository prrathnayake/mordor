import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  UniversalDataRegistry,
  UniversalDataRegistryConfig,
} from "../../../packages/external-data/src/services/universal-data-registry.js";
import type { Logger } from "../../../packages/logging/src/index.js";
import type { UniversalDataGateway } from "../../../packages/persistence/src/universal-data-gateway.js";

function writeJson(res: ServerResponse, code: number, data: unknown): void {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function readSearchParams(url: URL, key: string): string | null {
  return url.searchParams.get(key);
}

function parseIntParam(url: URL, key: string, fallback: number): number {
  const v = url.searchParams.get(key);
  return v ? Number.parseInt(v, 10) || fallback : fallback;
}

export function createUniversalDataEnvConfig(): UniversalDataRegistryConfig {
  return {
    newsApiKey: process.env.NEWSAPI_KEY,
    mediaStackApiKey: process.env.MEDIASTACK_KEY,
    openWeatherMapApiKey: process.env.OPENWEATHERMAP_KEY,
    nasaApiKey: process.env.NASA_API_KEY ?? "DEMO_KEY",
    alphaVantageApiKey: process.env.ALPHAVANTAGE_KEY,
    fredApiKey: process.env.FRED_KEY,
    abuseIpDbApiKey: process.env.ABUSEIPDB_KEY,
    otxApiKey: process.env.OTX_KEY,
    shodanApiKey: process.env.SHODAN_KEY,
    ipInfoApiKey: process.env.IPINFO_KEY,
  };
}

export function registerUniversalDataRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  gateway: UniversalDataGateway,
  registry: UniversalDataRegistry | null,
  logger: Logger,
): boolean {
  const method = request.method ?? "GET";
  const pathname = url.pathname;

  // === SOURCE REGISTRY ===
  if (method === "GET" && pathname === "/universal/sources") {
    gateway
      .getDataSourceRegistry()
      .then((sources) => writeJson(response, 200, sources))
      .catch((err) => {
        logger.error("Failed to get source registry", err);
        writeJson(response, 500, { error: "Internal server error" });
      });
    return true;
  }

  // === SOURCE REGISTRY BY CATEGORY ===
  if (method === "GET" && pathname.startsWith("/universal/sources/")) {
    const category = pathname.replace("/universal/sources/", "");
    gateway
      .getDataSourceRegistry()
      .then((sources) => {
        const filtered = sources.filter((s) => s.category === category);
        writeJson(response, 200, filtered);
      })
      .catch((err) => {
        logger.error("Failed to get source registry", err);
        writeJson(response, 500, { error: "Internal server error" });
      });
    return true;
  }

  // === AVIATION ===
  if (method === "GET" && pathname === "/universal/aviation") {
    const west = readSearchParams(url, "west");
    const south = readSearchParams(url, "south");
    const east = readSearchParams(url, "east");
    const north = readSearchParams(url, "north");
    const bounds =
      west && south && east && north
        ? { west: Number(west), south: Number(south), east: Number(east), north: Number(north) }
        : undefined;
    gateway
      .fetchAviationPositions(bounds)
      .then((data) => writeJson(response, 200, data))
      .catch((err) => {
        logger.error("Failed to fetch aviation", err);
        writeJson(response, 500, { error: "Internal server error" });
      });
    return true;
  }

  // === NEWS ===
  if (method === "GET" && pathname === "/universal/news") {
    const category = readSearchParams(url, "category");
    const source = readSearchParams(url, "source");
    const limit = parseIntParam(url, "limit", 50);
    gateway
      .fetchNewsArticles({ category: category ?? undefined, source: source ?? undefined, limit })
      .then((data) => writeJson(response, 200, data))
      .catch((err) => {
        logger.error("Failed to fetch news", err);
        writeJson(response, 500, { error: "Internal server error" });
      });
    return true;
  }

  // === WEATHER ===
  if (method === "GET" && pathname === "/universal/weather") {
    gateway
      .fetchWeatherObservations()
      .then((data) => writeJson(response, 200, data))
      .catch((err) => {
        logger.error("Failed to fetch weather", err);
        writeJson(response, 500, { error: "Internal server error" });
      });
    return true;
  }

  // === SPACE ===
  if (method === "GET" && pathname === "/universal/space") {
    const dataType = readSearchParams(url, "data_type");
    const source = readSearchParams(url, "source");
    const limit = parseIntParam(url, "limit", 50);
    gateway
      .fetchSpaceData({ dataType: dataType ?? undefined, source: source ?? undefined, limit })
      .then((data) => writeJson(response, 200, data))
      .catch((err) => {
        logger.error("Failed to fetch space", err);
        writeJson(response, 500, { error: "Internal server error" });
      });
    return true;
  }

  // === FINANCE ===
  if (method === "GET" && pathname === "/universal/finance") {
    const assetType = readSearchParams(url, "asset_type");
    const symbol = readSearchParams(url, "symbol");
    gateway
      .fetchFinancialData({ assetType: assetType ?? undefined, symbol: symbol ?? undefined })
      .then((data) => writeJson(response, 200, data))
      .catch((err) => {
        logger.error("Failed to fetch finance", err);
        writeJson(response, 500, { error: "Internal server error" });
      });
    return true;
  }

  // === SOCIAL ===
  if (method === "GET" && pathname === "/universal/social") {
    const source = readSearchParams(url, "source");
    const limit = parseIntParam(url, "limit", 50);
    gateway
      .fetchSocialPosts({ source: source ?? undefined, limit })
      .then((data) => writeJson(response, 200, data))
      .catch((err) => {
        logger.error("Failed to fetch social", err);
        writeJson(response, 500, { error: "Internal server error" });
      });
    return true;
  }

  // === SECURITY ===
  if (method === "GET" && pathname === "/universal/security") {
    const severity = readSearchParams(url, "severity");
    const source = readSearchParams(url, "source");
    const limit = parseIntParam(url, "limit", 50);
    gateway
      .fetchThreatIntel({ severity: severity ?? undefined, source: source ?? undefined, limit })
      .then((data) => writeJson(response, 200, data))
      .catch((err) => {
        logger.error("Failed to fetch security", err);
        writeJson(response, 500, { error: "Internal server error" });
      });
    return true;
  }

  // === TRIGGER FETCH (Refresh a specific source via the registry) ===
  if (method === "POST" && pathname.startsWith("/universal/fetch/") && registry) {
    const sourceId = pathname.replace("/universal/fetch/", "");
    registry
      .fetchSource(sourceId)
      .then((result) => {
        writeJson(response, 200, result);
      })
      .catch((err) => {
        logger.error(`Failed to fetch source ${sourceId}`, err);
        writeJson(response, 500, {
          error: `Failed to fetch ${sourceId}: ${err instanceof Error ? err.message : String(err)}`,
        });
      });
    return true;
  }

  // === FETCH ALL (From registry) ===
  if (method === "POST" && pathname === "/universal/fetch-all" && registry) {
    registry
      .fetchAllActive()
      .then((results) => {
        writeJson(response, 200, results);
      })
      .catch((err) => {
        logger.error("Failed to fetch all sources", err);
        writeJson(response, 500, { error: "Internal server error" });
      });
    return true;
  }

  return false;
}
