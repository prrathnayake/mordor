import { createServer, IncomingMessage, type Server, ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { createAlertRuleId, evaluateEventForAlerts } from "../../../packages/alerts/src/index.js";
import { authenticate, logout, validateToken } from "../../../packages/auth/src/index.js";
import { getConfigFromEnv, validateConfig } from "../../../packages/config/src/index.js";
import { applyCanonicalEventToObjectState } from "../../../packages/domain/src/index.js";
import { UniversalDataRegistry } from "../../../packages/external-data/src/services/universal-data-registry.js";
import {
  type Clock,
  ingestCameraObservationBatch,
  ingestFixtureTelemetryBatch,
  systemClock,
  validateCameraObservationIngestionInput,
  validateFixtureTelemetryIngestionInput,
} from "../../../packages/ingestion/src/index.js";
import {
  DEFAULT_NEWS_FEEDS,
  fetchAllNewsIntelligence,
  getIntelligenceSourceCatalog,
  type IncidentIntelligenceCollector,
  refreshIncidentIntelligence,
  refreshOpenIncidentIntelligence,
} from "../../../packages/intelligence/src/index.js";
import {
  getTVChannelsByRegion,
  getTVChannelsByTag,
  NEWS_NETWORK_FEEDS,
  TV_NEWS_CHANNELS,
} from "../../../packages/intelligence/src/tv-channels.js";
import {
  GEOPOLITICAL_WEBCAM_CHANNELS,
  getWebcamChannelsByRegion,
  getWebcamChannelsByTag,
} from "../../../packages/intelligence/src/webcam-registry.js";
import type { Logger } from "../../../packages/logging/src/index.js";
import { createLogger } from "../../../packages/logging/src/index.js";
import {
  PostgresPersistenceGateway,
  setObjectStateUpdateCallback,
} from "../../../packages/persistence/src/index.js";
import { UniversalDataGateway } from "../../../packages/persistence/src/universal-data-gateway.js";
import { validateReplayQueryRequest } from "../../../packages/replay/src/index.js";
import {
  type SwanActivityEvent,
  type SwanFinding,
  SwanProtocolService,
} from "../../../packages/swan/src/index.js";
import { loadJsonFixture } from "../../../packages/test-fixtures/src/index.js";
import { runCaptureJob } from "./capture-service.js";
import { type LiveEvent, liveEventBus } from "./live-event-bus.js";
import { createLiveWorldService, refreshExternalDataLayer } from "./live-world-service.js";
import {
  createUniversalDataEnvConfig,
  registerUniversalDataRoutes,
} from "./universal-data-routes.js";

// Layer ID to display label mapping
function getLayerLabel(layerId: string): string {
  const labels: Record<string, string> = {
    earthquakes: "Earthquakes (24h)",
    satellites: "Satellites",
    weather: "Weather Radar",
    bikeshare: "Bikeshare",
    traffic: "Street Traffic",
    military: "Military Flights",
  };
  return labels[layerId] || layerId;
}

// Source type to display name mapping
function getSourceDisplayName(sourceType: string): string {
  const names: Record<string, string> = {
    flights: "Live Flights",
    earthquakes: "Earthquakes (24h)",
    satellites: "Satellites",
    weather: "Weather Radar",
    bikeshare: "Bikeshare",
    traffic: "Street Traffic",
    cctv: "CCTV Mesh",
    alerts: "Alerts",
    events: "Object Events",
  };
  return names[sourceType] || sourceType;
}

interface ApiServerOptions {
  connection_string: string;
  clock?: Clock;
  disableLiveWorldService?: boolean;
  incidentIntelligenceCollectors?: IncidentIntelligenceCollector[];
}

class InvalidJsonBodyError extends Error {
  constructor() {
    super("Request body must be valid JSON");
    this.name = "InvalidJsonBodyError";
  }
}

export interface RunningApiServer {
  readonly server: Server;
  readonly persistence: PostgresPersistenceGateway;
  close(): Promise<void>;
}

async function maybeBootstrapDevelopmentDemoData(input: {
  persistence: PostgresPersistenceGateway;
  logger: Logger;
  clock: Clock;
}): Promise<void> {
  if (process.env.NODE_ENV === "production" || process.env.AUTO_BOOTSTRAP_DEMO_DATA === "false") {
    return;
  }

  const existingEventCount = await input.persistence.countTableRows("canonical_events");
  if (existingEventCount > 0) {
    return;
  }

  const payload = await loadJsonFixture<unknown>(
    "adapters",
    "fixture-telemetry",
    "valid.request.json",
  );
  const validation = validateFixtureTelemetryIngestionInput(payload);

  if (!validation.ok) {
    input.logger.warn("Development demo bootstrap skipped due to invalid fixture", {
      issues: validation.issues,
    });
    return;
  }

  const result = await ingestFixtureTelemetryBatch({
    command: validation.value,
    persistence: input.persistence,
    clock: input.clock,
  });

  input.logger.info("Bootstrapped development demo telemetry", {
    status: result.status,
    inserted_event_count: result.inserted_event_ids.length,
    duplicate_event_count: result.duplicate_event_ids.length,
    quarantined_record_count: result.quarantined_records.length,
  });
}

function addCorsHeaders(response: ServerResponse): void {
  const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN ?? "*";
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader(
    "Access-Control-Allow-Headers",
    "content-type,authorization,x-client-session-id",
  );
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,PATCH,DELETE");
  response.setHeader("Access-Control-Max-Age", "86400");
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  addCorsHeaders(response);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function fnv1aHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function writeJsonWithEtag(
  response: ServerResponse,
  request: IncomingMessage,
  statusCode: number,
  payload: unknown,
): void {
  const body = JSON.stringify(payload);
  const etag = `"${fnv1aHash(body).toString(36)}-${body.length.toString(36)}"`;
  const ifNoneMatch = request.headers["if-none-match"];
  if (ifNoneMatch === etag) {
    addCorsHeaders(response);
    response.statusCode = 304;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("ETag", etag);
    response.end();
    return;
  }
  addCorsHeaders(response);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("ETag", etag);
  response.end(body);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InvalidJsonBodyError();
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const VALID_INCIDENT_SEVERITIES = ["critical", "high", "medium", "low", "info"];
const VALID_INCIDENT_STATUSES = ["open", "active", "resolved", "closed", "archived"];

function validateIncidentPayload(
  body: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  if (typeof body.title === "string" && body.title.trim().length === 0) {
    return { ok: false, error: "title must be a non-empty string" };
  }
  if (body.start_at !== undefined) {
    const startTs = Date.parse(String(body.start_at));
    if (!Number.isFinite(startTs)) {
      return { ok: false, error: "start_at must be a valid ISO-8601 date-time" };
    }
  }
  if (body.end_at !== undefined) {
    const endTs = Date.parse(String(body.end_at));
    if (!Number.isFinite(endTs)) {
      return { ok: false, error: "end_at must be a valid ISO-8601 date-time" };
    }
  }
  if (typeof body.start_at === "string" && typeof body.end_at === "string") {
    if (Date.parse(body.start_at) > Date.parse(body.end_at)) {
      return { ok: false, error: "start_at must be less than or equal to end_at" };
    }
  }
  if (body.severity !== undefined && !VALID_INCIDENT_SEVERITIES.includes(String(body.severity))) {
    return {
      ok: false,
      error: `severity must be one of: ${VALID_INCIDENT_SEVERITIES.join(", ")}`,
    };
  }
  if (body.status !== undefined && !VALID_INCIDENT_STATUSES.includes(String(body.status))) {
    return {
      ok: false,
      error: `status must be one of: ${VALID_INCIDENT_STATUSES.join(", ")}`,
    };
  }
  return { ok: true };
}

function parseBoundsFromSearchParams(
  url: URL,
): { west: number; south: number; east: number; north: number } | null {
  const west = url.searchParams.get("west");
  const south = url.searchParams.get("south");
  const east = url.searchParams.get("east");
  const north = url.searchParams.get("north");

  if (!west && !south && !east && !north) {
    return null;
  }

  const parsed = {
    west: Number.parseFloat(west ?? ""),
    south: Number.parseFloat(south ?? ""),
    east: Number.parseFloat(east ?? ""),
    north: Number.parseFloat(north ?? ""),
  };

  if (Object.values(parsed).some((value) => !Number.isFinite(value))) {
    return null;
  }

  return parsed;
}

async function materializeLiveEventForStream(
  event: LiveEvent,
  persistence: PostgresPersistenceGateway,
  bounds?: { west: number; south: number; east: number; north: number } | null,
  previousLayerSnapshots?: Map<string, Map<string, string>>,
): Promise<LiveEvent> {
  if (event.type !== "external_layer_update") {
    return event;
  }

  const payload = event.payload as {
    layer_id: string;
    status: "real" | "degraded" | "unavailable";
    count: number;
    last_update: string;
    error_message: string | null;
  };

  const events = await persistence.fetchExternalDataEvents(payload.layer_id, bounds ?? undefined);
  const currentSnapshot = new Map<string, string>();
  for (const item of events) {
    const key = String(item.external_id || item.event_id);
    currentSnapshot.set(key, JSON.stringify(item));
  }

  const previousSnapshot = previousLayerSnapshots?.get(payload.layer_id);
  if (previousSnapshot) {
    const upserts = events.filter((item) => {
      const key = String(item.external_id || item.event_id);
      return previousSnapshot.get(key) !== currentSnapshot.get(key);
    });
    const removedExternalIds = Array.from(previousSnapshot.keys()).filter(
      (key) => !currentSnapshot.has(key),
    );

    previousLayerSnapshots?.set(payload.layer_id, currentSnapshot);

    return {
      type: "external_layer_delta_update",
      timestamp: event.timestamp,
      sequence: event.sequence,
      payload: {
        layer_id: payload.layer_id,
        status: payload.status,
        count: events.length,
        total_count: payload.count,
        last_update: payload.last_update,
        error_message: payload.error_message,
        upserts,
        removed_external_ids: removedExternalIds,
      },
    };
  }

  previousLayerSnapshots?.set(payload.layer_id, currentSnapshot);

  return {
    type: "external_layer_snapshot_update",
    timestamp: event.timestamp,
    sequence: event.sequence,
    payload: {
      layer_id: payload.layer_id,
      status: payload.status,
      count: events.length,
      total_count: payload.count,
      last_update: payload.last_update,
      error_message: payload.error_message,
      events,
    },
  };
}

function resolveClientSessionId(
  request: IncomingMessage,
  url: URL,
  body?: Record<string, unknown>,
): string | null {
  const headerValue = request.headers["x-client-session-id"];
  if (typeof headerValue === "string" && headerValue.trim() !== "") {
    return headerValue.trim();
  }

  const queryValue = url.searchParams.get("client_session_id");
  if (typeof queryValue === "string" && queryValue.trim() !== "") {
    return queryValue.trim();
  }

  const bodyValue = body?.client_session_id;
  if (typeof bodyValue === "string" && bodyValue.trim() !== "") {
    return bodyValue.trim();
  }

  return null;
}

function buildSwanContext(
  base: Record<string, unknown>,
  extras?: { route?: unknown; mode?: unknown },
): Record<string, unknown> {
  const nextContext = { ...base };
  if (typeof extras?.route === "string") {
    nextContext.route = extras.route;
  }
  if (extras?.mode === "live" || extras?.mode === "replay") {
    nextContext.mode = extras.mode;
  }
  return nextContext;
}

async function getMissingSwanTables(persistence: PostgresPersistenceGateway): Promise<string[]> {
  const expectedTables = [
    "swan_sessions",
    "swan_activity_events",
    "swan_threads",
    "swan_findings",
    "swan_artifacts",
  ];

  const result = await persistence.getDatabase().pool.query<{
    table_name: string;
    table_exists: boolean;
  }>(
    `
      SELECT
        expected.table_name,
        EXISTS (
          SELECT 1
          FROM information_schema.tables actual
          WHERE actual.table_schema = 'public'
            AND actual.table_name = expected.table_name
        ) AS table_exists
      FROM unnest($1::text[]) AS expected(table_name)
    `,
    [expectedTables],
  );

  return result.rows.filter((row) => !row.table_exists).map((row) => row.table_name);
}

function writeSwanUnavailable(response: ServerResponse, missingTables?: string[]): void {
  writeJson(response, 503, {
    error: "swan_unavailable",
    message: "SWAN schema is not initialized",
    missing_tables: missingTables ?? [],
  });
}

export async function createApiServer(options: ApiServerOptions): Promise<RunningApiServer> {
  const logger = createLogger("api-server");
  const incidentIntelligenceLogger = createLogger("incident-intelligence");
  const persistence = PostgresPersistenceGateway.fromConnectionString(options.connection_string);
  const universalDataGateway = new UniversalDataGateway(persistence.getDatabase());
  const universalDataRegistry = new UniversalDataRegistry(createUniversalDataEnvConfig());
  const clock = options.clock ?? systemClock;
  const config = getConfigFromEnv();

  // Simple event-loop lag monitor
  let eventLoopLagMs = 0;
  const lagMonitorInterval = setInterval(() => {
    const start = performance.now();
    setImmediate(() => {
      eventLoopLagMs = performance.now() - start;
    });
  }, 1000);
  const closing = false;
  let activeRequestCount = 0;
  let activeRequestsDrainedResolver: (() => void) | null = null;

  // Simple in-memory rate limiter for public endpoints
  const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
  function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = rateLimitStore.get(key);
    if (!entry || now > entry.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= maxRequests) {
      return false;
    }
    entry.count += 1;
    return true;
  }
  const missingSwanTables = await getMissingSwanTables(persistence);
  const swanService =
    missingSwanTables.length === 0
      ? new SwanProtocolService(
          persistence.getDatabase(),
          logger,
          {
            artifactRoot: config.swanArtifactRoot,
            maxThreadsPerSession: config.swanMaxThreadsPerSession,
            maxGlobalThreads: config.swanMaxGlobalThreads,
            sessionIdleTtlMs: config.swanSessionIdleTtlMs,
            watchIntervalMs: config.swanWatchIntervalMs,
            providerAllowlist: config.swanProviderAllowlist,
            externalResearchFeeds: (process.env.SWAN_EXTERNAL_RESEARCH_FEEDS || "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          },
          (event) => liveEventBus.publish(event as LiveEvent),
        )
      : null;

  logger.info("Starting API server", {
    connection_string: options.connection_string.replace(/:[^:@]+@/, ":***@"),
  });

  if (missingSwanTables.length > 0) {
    logger.warn("SWAN service disabled because required tables are missing", {
      missing_tables: missingSwanTables,
    });
  }

  setObjectStateUpdateCallback((state) => {
    liveEventBus.publish({
      type: "object_state_update",
      timestamp: new Date().toISOString(),
      payload: state,
    });
  });

  const liveWorldService = options.disableLiveWorldService
    ? {
        async start() {},
        async close() {},
        async getLatestStates() {
          const states = await persistence.fetchLatestStateForAllObjects();
          return {
            states,
            generated_at: null,
            source: "database" as const,
            status: null,
            auth_mode: null,
          };
        },
        async getTrack(objectId: string, limit: number = 24) {
          return {
            source: "database" as const,
            points: await persistence.fetchRecentTrackForObject(objectId, limit),
          };
        },
      }
    : await createLiveWorldService({
        persistence,
        logger: createLogger("live-world"),
        publishLiveEvent: (event) => liveEventBus.publish(event),
        redisUrl: config.redisUrl,
        openSkyClientId: config.openSkyClientId,
        openSkyClientSecret: config.openSkyClientSecret,
        flightsRefreshMs: config.liveFlightsRefreshMs,
        flightsCacheTtlMs: config.liveFlightsCacheTtlMs,
        flightHistoryPoints: config.liveFlightHistoryPoints,
        flightLimit: config.liveFlightLimit,
        autoRefreshExternalLayers: config.autoRefreshExternalLayers,
      });
  await liveWorldService.start();
  let incidentIntelligenceInterval: NodeJS.Timeout | null = null;

  async function publishIncidentIntelligenceUpdate(input: {
    incident_id: string;
    artifact_count: number;
    widget_count: number;
    run_count: number;
    updated_at: string;
  }): Promise<void> {
    liveEventBus.publish({
      type: "incident_intelligence_update",
      timestamp: input.updated_at,
      payload: input,
    });
  }

  if (config.autoRefreshIncidentIntelligence) {
    const runIncidentSweep = async () => {
      try {
        const sweep = await refreshOpenIncidentIntelligence({
          persistence,
          logger: incidentIntelligenceLogger,
          collectors: options.incidentIntelligenceCollectors,
          youtubeApiKey: config.youtubeApiKey,
          limit: config.incidentIntelligenceMaxIncidentsPerSweep,
        });

        for (const result of sweep.refreshed) {
          await publishIncidentIntelligenceUpdate(result);
        }
      } catch (error) {
        incidentIntelligenceLogger.warn("Incident intelligence sweep failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    incidentIntelligenceInterval = setInterval(
      runIncidentSweep,
      config.incidentIntelligenceRefreshMs,
    );
  }

  const REALTIME_NEWS_POLL_MS = 60000;
  let _realtimeNewsInterval: NodeJS.Timeout | null = null;

  async function startRealtimeNewsPolling(): Promise<void> {
    const { addRealtimeUpdate, detectBreakingFromNews, getRealtimeState } = await import(
      "../../../packages/intelligence/src/news-clips.js"
    );

    const state = getRealtimeState();
    if (state.activeSubscriptions === 0) {
      return;
    }

    try {
      const newsIntelligence = await fetchAllNewsIntelligence({ maxItemsPerFeed: 20 });
      const newUpdates = detectBreakingFromNews(
        newsIntelligence.items.map((i) => ({
          title: i.title,
          source_tier: i.source_tier,
          threat_level: i.threat_level,
        })),
      );

      for (const update of newUpdates) {
        addRealtimeUpdate(update);
        liveEventBus.publish({
          type: "news_realtime_update",
          timestamp: update.published_at,
          payload: update,
        });
      }
    } catch (error) {
      logger.warn("Realtime news polling failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const { getSubscriptionCount } = await import("../../../packages/intelligence/src/news-clips.js");
  if (getSubscriptionCount() > 0) {
    _realtimeNewsInterval = setInterval(startRealtimeNewsPolling, REALTIME_NEWS_POLL_MS);
  }

  // Background universal data fetch loop
  let universalDataInterval: NodeJS.Timeout | null = null;
  async function runUniversalDataFetch(): Promise<void> {
    const activeSources = universalDataRegistry.getActiveSources();
    for (const source of activeSources) {
      try {
        const result = await universalDataRegistry.fetchSource(source.sourceId);
        if (result.success) {
          await universalDataGateway.updateDataSourceRegistryStatus(source.sourceId, "active");
          logger.debug("Universal data fetch succeeded", {
            source: source.sourceId,
            count: result.data.length,
          });
        } else {
          await universalDataGateway.updateDataSourceRegistryStatus(
            source.sourceId,
            "error",
            result.error,
          );
          logger.warn("Universal data fetch failed", {
            source: source.sourceId,
            error: result.error,
          });
        }
      } catch (error) {
        await universalDataGateway.updateDataSourceRegistryStatus(
          source.sourceId,
          "error",
          String(error),
        );
        logger.error("Universal data fetch error", {
          source: source.sourceId,
          error: String(error),
        });
      }
    }
  }
  if (universalDataRegistry.getActiveSources().length > 0) {
    universalDataInterval = setInterval(runUniversalDataFetch, 60000);
    runUniversalDataFetch().catch((err) =>
      logger.warn("Initial universal data fetch failed", { error: String(err) }),
    );
  }

  async function waitForActiveRequestsToDrain(timeoutMs = 30000): Promise<void> {
    if (activeRequestCount === 0) {
      return;
    }

    await Promise.race([
      new Promise<void>((resolve) => {
        activeRequestsDrainedResolver = resolve;
      }),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  const server = createServer(
    { IncomingMessage: IncomingMessage, ServerResponse: ServerResponse },
    async (request, response) => {
      activeRequestCount += 1;

      try {
        addCorsHeaders(response);

        if (closing) {
          writeJson(response, 503, {
            error: "server_shutting_down",
            message: "API server is shutting down",
          });
          return;
        }

        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }

        if (!request.url) {
          writeJson(response, 404, {
            error: "not_found",
            message: "Route not found",
          });
          return;
        }

        const url = new URL(request.url, "http://127.0.0.1");

        const rawAuthHeader = request.headers.authorization;
        const authHeader = typeof rawAuthHeader === "string" ? rawAuthHeader : null;
        const authContext = !config.authEnabled
          ? {
              user: {
                user_id: "anonymous",
                username: "anonymous",
                role: "admin" as const,
                created_at: new Date().toISOString(),
              },
              isAuthenticated: true,
            }
          : authHeader?.startsWith("Bearer ")
            ? validateToken(authHeader.substring(7))
            : { user: null, isAuthenticated: false };

        logger.debug("Incoming request", { method: request.method, pathname: url.pathname });

        if (request.method === "GET" && url.pathname === "/health") {
          await persistence.ping();
          writeJson(response, 200, {
            status: "ok",
            service: "api",
            database: "ok",
          });
          return;
        }

        if (request.method === "GET" && url.pathname === "/ready") {
          try {
            await persistence.ping();
            writeJson(response, 200, {
              status: "ready",
              service: "api",
              database: "connected",
            });
          } catch {
            writeJson(response, 503, {
              status: "not_ready",
              service: "api",
              database: "disconnected",
            });
          }
          return;
        }

        // Detailed health check with component status
        if (request.method === "GET" && url.pathname === "/health/detailed") {
          if (config.authEnabled && !authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const health = {
            status: "ok",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            components: {
              database: { status: "unknown" as "ok" | "error", latency_ms: null as number | null },
              memory: { status: "ok" as "ok" | "warning" | "error", used_mb: 0, total_mb: 0 },
              external_sources: {} as Record<
                string,
                { status: string; last_update: string | null }
              >,
            },
          };

          // Check database
          const dbStart = Date.now();
          try {
            await persistence.ping();
            health.components.database = { status: "ok", latency_ms: Date.now() - dbStart };
          } catch {
            health.components.database = { status: "error", latency_ms: Date.now() - dbStart };
            health.status = "degraded";
          }

          // Check memory
          const memUsage = process.memoryUsage();
          const totalMemoryMB = memUsage.heapTotal / 1024 / 1024;
          const usedMemoryMB = memUsage.heapUsed / 1024 / 1024;
          const memoryPercent = (usedMemoryMB / totalMemoryMB) * 100;
          health.components.memory = {
            status: memoryPercent > 90 ? "error" : memoryPercent > 70 ? "warning" : "ok",
            used_mb: Math.round(usedMemoryMB),
            total_mb: Math.round(totalMemoryMB),
          };

          // Check external sources
          try {
            const sources = await persistence.fetchAllSourceHealth();
            for (const source of sources) {
              health.components.external_sources[source.source_id] = {
                status: source.status,
                last_update: source.last_seen_at,
              };
            }
          } catch {
            // Ignore errors for external source health
          }

          writeJson(response, 200, health);
          return;
        }

        // Basic metrics endpoint
        if (request.method === "GET" && url.pathname === "/metrics") {
          if (config.authEnabled && !authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const memUsage = process.memoryUsage();
          const cpuUsage = process.cpuUsage();

          const metrics = {
            timestamp: new Date().toISOString(),
            uptime_seconds: process.uptime(),
            memory: {
              heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
              heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
              rss_mb: Math.round(memUsage.rss / 1024 / 1024),
              external_mb: Math.round(memUsage.external / 1024 / 1024),
            },
            cpu: {
              user_ms: cpuUsage.user,
              system_ms: cpuUsage.system,
            },
            event_loop: {
              lag_ms: Math.round(eventLoopLagMs),
            },
          };

          writeJson(response, 200, metrics);
          return;
        }

        // Log streaming endpoint (SSE)
        if (request.method === "GET" && url.pathname === "/logs") {
          if (config.authEnabled && !authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const urlParams = url.searchParams;
          const levelFilter = urlParams.get("level")?.split(",") || [];
          const limit = Math.min(parseInt(urlParams.get("limit") || "100", 10), 1000);

          response.setHeader("Content-Type", "text/event-stream");
          response.setHeader("Cache-Control", "no-cache");
          response.setHeader("Connection", "keep-alive");
          response.writeHead(200);

          // Send log history from logger
          const logs = logger.getRecentLogs ? logger.getRecentLogs(limit, levelFilter) : [];
          for (const log of logs) {
            response.write(`data: ${JSON.stringify(log)}\n\n`);
          }

          // Keep connection alive with heartbeat
          const heartbeat = setInterval(() => {
            response.write(`: heartbeat\n\n`);
          }, 30000);

          request.on("close", () => {
            clearInterval(heartbeat);
          });

          return;
        }

        if (request.method === "POST" && url.pathname === "/auth/login") {
          const clientIp = request.socket.remoteAddress ?? "unknown";
          if (!checkRateLimit(`login:${clientIp}`, 5, 60000)) {
            writeJson(response, 429, { error: "rate_limited", message: "Too many login attempts" });
            return;
          }

          const startTime = Date.now();
          const body = (await readJsonBody(request)) as { username: string; password: string };
          const result = authenticate(body.username, body.password);

          logger.info("Auth login attempt", {
            username: body.username,
            success: result.success,
            duration_ms: Date.now() - startTime,
          });

          if (!result.success) {
            writeJson(response, 401, { error: "unauthorized", message: result.error });
            return;
          }

          writeJson(response, 200, {
            token: result.token,
            user: {
              user_id: result.user?.user_id,
              username: result.user?.username,
              role: result.user?.role,
            },
          });
          return;
        }

        if (request.method === "POST" && url.pathname === "/auth/validate") {
          const body = (await readJsonBody(request)) as { token: string };
          const validation = validateToken(body.token);

          if (!validation.isAuthenticated || !validation.user) {
            writeJson(response, 401, { error: "invalid or expired token" });
            return;
          }

          writeJson(response, 200, {
            user: {
              user_id: validation.user.user_id,
              username: validation.user.username,
              role: validation.user.role,
            },
          });
          return;
        }

        if (request.method === "POST" && url.pathname === "/auth/logout") {
          const body = (await readJsonBody(request)) as { token: string };
          if (body?.token) {
            logout(body.token);
          }
          writeJson(response, 200, { success: true, message: "Logged out successfully" });
          return;
        }

        if (request.method === "POST" && url.pathname === "/ingest/fixture-telemetry") {
          if (!authContext.isAuthenticated) {
            logger.warn("Unauthorized ingest attempt", { pathname: url.pathname });
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const startTime = Date.now();
          const body = await readJsonBody(request);
          const validation = validateFixtureTelemetryIngestionInput(body);

          if (!validation.ok) {
            writeJson(response, 400, {
              error: "invalid_fixture_ingest_request",
              issues: validation.issues,
            });
            return;
          }

          logger.info("Ingesting fixture telemetry", {
            source: validation.value.source?.source_id,
          });

          const result = await ingestFixtureTelemetryBatch({
            command: validation.value,
            persistence,
            clock,
          });

          if (result.latest_state_by_object_id) {
            const now = clock.now();
            const nowTs = Date.parse(now);
            if (!Number.isFinite(nowTs)) {
              writeJson(response, 500, {
                error: "clock_error",
                message: "System clock returned an unparseable timestamp",
              });
              return;
            }
            const windowStart = new Date(nowTs - 60000).toISOString();
            for (const [objectId, state] of Object.entries(result.latest_state_by_object_id)) {
              const events = await persistence.fetchCanonicalEvents({
                start_at: windowStart,
                end_at: now,
                object_id: objectId,
              });
              const latestEvent = events[events.length - 1];
              if (latestEvent) {
                const alerts = evaluateEventForAlerts(latestEvent, state);
                for (const evaluation of alerts) {
                  const alertId = createAlertRuleId(evaluation.severity, latestEvent.observed_at);
                  await persistence.persistAlert({
                    alert_id: alertId,
                    rule_id: "position_observed",
                    severity: evaluation.severity,
                    evidence_event_ids: evaluation.evidence_event_ids,
                    evidence_object_ids: evaluation.evidence_object_ids,
                    summary: evaluation.summary,
                    explanation: evaluation.explanation,
                    confidence: evaluation.confidence,
                  });
                }
              }
            }
          }

          logger.info("Ingest complete", {
            duration_ms: Date.now() - startTime,
            status: result.status,
          });

          if (result.status === "rejected") {
            writeJson(response, 400, {
              status: result.status,
              trace_id: result.trace_id,
              quarantined_records: result.quarantined_records,
            });
            return;
          }

          writeJson(response, 200, { status: result.status, trace_id: result.trace_id });
          return;
        }

        if (request.method === "POST" && url.pathname === "/ingest/camera-observation") {
          if (!authContext.isAuthenticated) {
            logger.warn("Unauthorized ingest attempt", { pathname: url.pathname });
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const startTime = Date.now();
          const body = await readJsonBody(request);
          const validation = validateCameraObservationIngestionInput(body);

          if (!validation.ok) {
            writeJson(response, 400, {
              error: "invalid_camera_observation_request",
              issues: validation.issues,
            });
            return;
          }

          logger.info("Ingesting camera observation", {
            source: validation.value.source?.source_id,
          });

          const result = await ingestCameraObservationBatch({
            command: validation.value,
            persistence,
            clock,
          });

          logger.info("Ingest complete", {
            duration_ms: Date.now() - startTime,
            status: result.status,
          });

          if (result.status === "rejected") {
            writeJson(response, 400, {
              status: result.status,
              trace_id: result.trace_id,
              quarantined_records: result.quarantined_records,
            });
            return;
          }

          writeJson(response, 200, { status: result.status, trace_id: result.trace_id });
          return;
        }

        if (request.method === "GET" && url.pathname === "/health/sources") {
          const sources = await persistence.fetchAllSourceHealth();
          writeJson(response, 200, { sources });
          return;
        }

        if (request.method === "GET" && url.pathname.startsWith("/health/sources/")) {
          const sourceId = url.pathname.replace("/health/sources/", "");
          const source = await persistence.fetchSourceHealth(sourceId);

          if (!source) {
            writeJson(response, 404, { error: "source not found" });
            return;
          }

          writeJson(response, 200, source);
          return;
        }

        if (request.method === "GET" && url.pathname === "/state/latest") {
          if (!authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }
          const snapshot = await liveWorldService.getLatestStates();
          writeJsonWithEtag(response, request, 200, snapshot);
          return;
        }

        if (request.method === "GET" && url.pathname.match(/^\/state\/tracks\/[^/]+$/)) {
          if (!authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const objectId = decodeURIComponent(url.pathname.replace("/state/tracks/", ""));
          const limit = Number.parseInt(url.searchParams.get("limit") ?? "24", 10);
          const track = await liveWorldService.getTrack(objectId, limit);
          writeJson(response, 200, {
            object_id: objectId,
            source: track.source,
            points: track.points,
          });
          return;
        }

        if (request.method === "GET" && url.pathname === "/alerts") {
          if (!authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const status = url.searchParams.get("status") ?? undefined;
          const severity = url.searchParams.get("severity") ?? undefined;
          const objectId = url.searchParams.get("object_id") ?? undefined;
          const limitParam = url.searchParams.get("limit");
          const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;

          const alerts = await persistence.fetchAlerts({
            status,
            severity,
            object_id: objectId,
            limit,
          });
          writeJsonWithEtag(response, request, 200, { alerts });
          return;
        }

        if (request.method === "GET" && url.pathname.startsWith("/alerts/")) {
          if (!authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const alertId = url.pathname.replace("/alerts/", "");
          const alert = await persistence.fetchAlert(alertId);

          if (!alert) {
            writeJson(response, 404, { error: "alert not found" });
            return;
          }

          writeJson(response, 200, alert);
          return;
        }

        if (request.method === "PATCH" && url.pathname.startsWith("/alerts/")) {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const roleHierarchy: Record<string, number> = { viewer: 1, operator: 2, admin: 3 };
          if (roleHierarchy[authContext.user.role] < 2) {
            logger.warn("Forbidden alert update attempt", {
              user: authContext.user.user_id,
              role: authContext.user.role,
            });
            writeJson(response, 403, { error: "forbidden", message: "operator role required" });
            return;
          }

          const alertId = url.pathname.replace("/alerts/", "");
          const body = (await readJsonBody(request)) as {
            status: string;
            acknowledged_by?: string;
          };

          if (!body || typeof body.status !== "string") {
            writeJson(response, 400, { error: "status is required" });
            return;
          }

          logger.info("Alert status update", {
            alert_id: alertId,
            new_status: body.status,
            user: authContext.user.user_id,
          });

          const previousAlert = await persistence.fetchAlert(alertId);

          await persistence.updateAlertStatus({
            alert_id: alertId,
            status: body.status,
            acknowledged_by: body.acknowledged_by,
          });

          await persistence.recordAuditLog({
            actor_id: authContext.user.user_id,
            actor_type: "user",
            operation: "alert_status_change",
            target_type: "alert",
            target_id: alertId,
            trace_id: crypto.randomUUID(),
            occurred_at: new Date().toISOString(),
            result: "success",
            metadata: {
              previous_status: previousAlert?.status,
              new_status: body.status,
              acknowledged_by: body.acknowledged_by,
            },
          });

          const updated = await persistence.fetchAlert(alertId);
          writeJson(response, 200, updated);
          return;
        }

        if (request.method === "GET" && url.pathname.startsWith("/events/")) {
          if (config.authEnabled && !authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const eventId = url.pathname.replace("/events/", "");
          const event = await persistence.fetchCanonicalEventById(eventId);

          if (!event) {
            writeJson(response, 404, { error: "not_found", message: "Event not found" });
            return;
          }

          writeJson(response, 200, event);
          return;
        }

        if (request.method === "POST" && url.pathname === "/replay/query") {
          const clientIp = request.socket.remoteAddress ?? "unknown";
          if (!checkRateLimit(`replay:${clientIp}`, 10, 60000)) {
            writeJson(response, 429, { error: "rate_limited", message: "Too many replay queries" });
            return;
          }

          const startTime = Date.now();
          const body = await readJsonBody(request);
          const validation = validateReplayQueryRequest(body);

          if (!validation.ok) {
            writeJson(response, 400, {
              error: "invalid_replay_query_request",
              issues: validation.issues,
            });
            return;
          }

          const maxWindowMs = 7 * 24 * 60 * 60 * 1000; // 7 days
          const windowStart = Date.parse(validation.value.start_at);
          const windowEnd = Date.parse(validation.value.end_at);
          if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) {
            writeJson(response, 400, {
              error: "invalid_replay_query_request",
              message: "Invalid date format",
            });
            return;
          }
          if (windowEnd - windowStart > maxWindowMs) {
            writeJson(response, 400, {
              error: "invalid_replay_query_request",
              message: "Query window exceeds maximum of 7 days",
            });
            return;
          }

          logger.info("Replay query", { request: validation.value });

          const events = await persistence.fetchCanonicalEvents(validation.value);

          const currentStateByObjectId = new Map();
          const orderedEvents = [...events].sort(
            (a, b) => new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime(),
          );

          const items = orderedEvents.map((event, index) => {
            const currentState = currentStateByObjectId.get(event.object_id) ?? null;
            const nextState = applyCanonicalEventToObjectState(currentState, event);
            currentStateByObjectId.set(event.object_id, nextState);

            return {
              sequence: index + 1,
              event,
              state_after_event: nextState,
            };
          });

          const result = {
            response_version: "1.0.0",
            mode: "replay",
            requested_window: {
              start_at: validation.value.start_at,
              end_at: validation.value.end_at,
              object_id: validation.value.object_id ?? null,
            },
            item_count: items.length,
            items: items.map((item) => ({
              sequence: item.sequence,
              event: {
                event_id: item.event.event_id,
                object_id: item.event.object_id,
                event_type: item.event.event_type,
                observed_at: item.event.observed_at,
              },
              state_after_event: item.state_after_event,
            })),
          };

          logger.info("Replay query complete", {
            duration_ms: Date.now() - startTime,
            event_count: events.length,
          });

          writeJson(response, 200, result as unknown as Record<string, unknown>);
          return;
        }

        if (request.method === "GET" && url.pathname === "/live/events") {
          response.setHeader("Content-Type", "text/event-stream");
          response.setHeader("Cache-Control", "no-cache");
          response.setHeader("Connection", "keep-alive");
          response.writeHead(200);

          const sinceSequence = Number.parseInt(url.searchParams.get("since_sequence") ?? "0", 10);
          const bounds = parseBoundsFromSearchParams(url);
          let closed = false;
          const previousLayerSnapshots = new Map<string, Map<string, string>>();

          const writeEvent = async (event: LiveEvent) => {
            if (closed) {
              return;
            }
            const outgoing = await materializeLiveEventForStream(
              event,
              persistence,
              bounds,
              previousLayerSnapshots,
            );
            if (!closed) {
              response.write(`data: ${JSON.stringify(outgoing)}\n\n`);
            }
          };

          if (sinceSequence > 0) {
            const missedEvents = liveEventBus.getRecentEvents(sinceSequence);
            for (const event of missedEvents) {
              await writeEvent(event);
            }
          }

          const connectionInfo = liveEventBus.getConnectionInfo();
          response.write(`data: ${JSON.stringify(connectionInfo)}\n\n`);

          let pendingWrite = Promise.resolve();
          const listener = (event: LiveEvent) => {
            pendingWrite = pendingWrite
              .then(async () => {
                await writeEvent(event);
              })
              .catch((err) => {
                logger.debug("SSE write error", {
                  error: err instanceof Error ? err.message : String(err),
                });
              });
          };

          const unsubscribe = liveEventBus.subscribe(listener);

          request.on("close", () => {
            closed = true;
            unsubscribe();
          });

          return;
        }

        if (request.method === "POST" && url.pathname === "/swan/session") {
          if (!swanService) {
            writeSwanUnavailable(response, missingSwanTables);
            return;
          }

          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const body = asRecord(await readJsonBody(request));
          const clientSessionId = resolveClientSessionId(request, url, body);
          if (!clientSessionId) {
            writeJson(response, 400, { error: "client_session_id is required" });
            return;
          }

          const result = await swanService.enableSession({
            user_id: authContext.user.user_id,
            client_session_id: clientSessionId,
            context: buildSwanContext(asRecord(body.context), {
              route: body.route,
              mode: body.mode,
            }),
          });

          writeJson(response, 201, result);
          return;
        }

        if (request.method === "GET" && url.pathname === "/swan/session") {
          if (!swanService) {
            writeSwanUnavailable(response, missingSwanTables);
            return;
          }

          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const clientSessionId = resolveClientSessionId(request, url);
          if (!clientSessionId) {
            writeJson(response, 400, { error: "client_session_id is required" });
            return;
          }

          const result = await swanService.getSessionByClient(
            authContext.user.user_id,
            clientSessionId,
          );

          writeJson(response, 200, result ?? { session: null });
          return;
        }

        if (request.method === "DELETE" && url.pathname === "/swan/session") {
          if (!swanService) {
            writeSwanUnavailable(response, missingSwanTables);
            return;
          }

          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const clientSessionId = resolveClientSessionId(request, url);
          if (!clientSessionId) {
            writeJson(response, 400, { error: "client_session_id is required" });
            return;
          }

          await swanService.disableSession(authContext.user.user_id, clientSessionId);
          writeJson(response, 200, { success: true });
          return;
        }

        if (request.method === "POST" && url.pathname === "/swan/activity") {
          if (!swanService) {
            writeSwanUnavailable(response, missingSwanTables);
            return;
          }

          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const body = asRecord(await readJsonBody(request));
          const clientSessionId = resolveClientSessionId(request, url, body);
          if (!clientSessionId) {
            writeJson(response, 400, { error: "client_session_id is required" });
            return;
          }

          if (typeof body.activity_type !== "string") {
            writeJson(response, 400, { error: "activity_type is required" });
            return;
          }

          const result = await swanService.recordActivity({
            user_id: authContext.user.user_id,
            client_session_id: clientSessionId,
            activity_type: body.activity_type as SwanActivityEvent["activity_type"],
            target_type:
              typeof body.target_type === "string"
                ? (body.target_type as SwanActivityEvent["target_type"])
                : null,
            target_id: typeof body.target_id === "string" ? body.target_id : null,
            route: typeof body.route === "string" ? body.route : null,
            mode:
              body.mode === "live" || body.mode === "replay"
                ? (body.mode as SwanActivityEvent["mode"])
                : null,
            context: buildSwanContext(asRecord(body.context), {
              route: body.route,
              mode: body.mode,
            }),
          });

          writeJson(response, 202, result);
          return;
        }

        if (request.method === "GET" && url.pathname === "/swan/findings") {
          if (!swanService) {
            writeSwanUnavailable(response, missingSwanTables);
            return;
          }

          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const clientSessionId = resolveClientSessionId(request, url);
          if (!clientSessionId) {
            writeJson(response, 400, { error: "client_session_id is required" });
            return;
          }

          const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
          const findings = await swanService.listFindings({
            user_id: authContext.user.user_id,
            client_session_id: clientSessionId,
            target_type:
              (url.searchParams.get("target_type") as SwanFinding["target_type"] | null) ??
              undefined,
            target_id: url.searchParams.get("target_id") ?? undefined,
            verification_status:
              (url.searchParams.get("verification_status") as
                | SwanFinding["verification_status"]
                | null) ?? undefined,
            limit,
          });

          writeJson(response, 200, { findings });
          return;
        }

        if (request.method === "GET" && url.pathname.match(/^\/swan\/artifacts\/[^/]+\/.+$/)) {
          if (!swanService) {
            writeSwanUnavailable(response, missingSwanTables);
            return;
          }

          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const prefix = "/swan/artifacts/";
          const remainder = url.pathname.slice(prefix.length);
          const firstSlash = remainder.indexOf("/");
          const sessionId = remainder.slice(0, firstSlash);
          const artifactKey = remainder.slice(firstSlash + 1);

          const artifact = await swanService.readArtifact(
            authContext.user.user_id,
            sessionId,
            artifactKey,
          );

          if (!artifact) {
            writeJson(response, 404, { error: "artifact not found" });
            return;
          }

          writeJson(response, 200, artifact);
          return;
        }

        // ============ EXTERNAL DATA LAYER ENDPOINTS ============

        if (request.method === "GET" && url.pathname === "/layers") {
          const layers = await persistence.fetchExternalDataLayers();
          writeJsonWithEtag(
            response,
            request,
            200,
            layers.map((layer) => ({
              layer_id: layer.layer_id,
              label: getLayerLabel(layer.layer_id),
              provider: layer.source_name,
              license: layer.license,
              status: layer.status,
              count: layer.record_count,
              last_update: layer.last_fetch_at,
              update_cadence_seconds: layer.update_cadence_seconds,
              toggleable: layer.status !== "unavailable",
              enabled: false, // Frontend manages this
            })),
          );
          return;
        }

        // Handle /layers/:layerId routes (both GET and POST)
        if (url.pathname.startsWith("/layers/")) {
          const pathParts = url.pathname.replace("/layers/", "").split("/");
          const layerId = pathParts[0];
          const action = pathParts[1];

          if (!layerId) {
            writeJson(response, 400, { error: "layer_id required" });
            return;
          }

          // GET /layers/:layerId
          if (request.method === "GET" && !action) {
            const layer = await persistence.fetchExternalDataLayer(layerId);
            if (!layer) {
              writeJson(response, 404, { error: "layer not found" });
              return;
            }

            writeJsonWithEtag(response, request, 200, {
              layer_id: layer.layer_id,
              label: getLayerLabel(layer.layer_id),
              provider: layer.source_name,
              license: layer.license,
              status: layer.status,
              count: layer.record_count,
              last_update: layer.last_fetch_at,
              error_message: layer.error_message,
            });
            return;
          }

          // GET /layers/:layerId/data
          if (request.method === "GET" && action === "data") {
            const layer = await persistence.fetchExternalDataLayer(layerId);
            if (!layer) {
              writeJson(response, 404, { error: "layer not found" });
              return;
            }

            if (layer.status === "unavailable") {
              writeJson(response, 503, {
                error: "layer unavailable",
                message: layer.error_message || "This data layer is currently unavailable",
              });
              return;
            }

            const bounds = parseBoundsFromSearchParams(url);
            const events = await persistence.fetchExternalDataEvents(layerId, bounds ?? undefined);

            writeJsonWithEtag(response, request, 200, {
              layer_id: layerId,
              status: layer.status,
              count: events.length,
              last_update: layer.last_fetch_at,
              events: events.map((e) => ({
                event_id: e.event_id,
                external_id: e.external_id,
                event_type: e.event_type,
                observed_at: e.observed_at,
                lat: e.lat,
                lon: e.lon,
                altitude_m: e.altitude_m,
                payload: e.payload,
              })),
            });
            return;
          }

          // POST /layers/:layerId/refresh
          if (request.method === "POST" && action === "refresh") {
            if (!authContext.isAuthenticated) {
              writeJson(response, 401, { error: "unauthorized" });
              return;
            }

            const result = await refreshExternalDataLayer(layerId, persistence, logger, (event) =>
              liveEventBus.publish(event),
            );
            writeJson(response, result.success ? 200 : 503, result);
            return;
          }

          // Handle method not allowed for other paths
          if (action) {
            writeJson(response, 404, { error: "layer action not found" });
            return;
          }
        }

        // ============ INCIDENT ENDPOINTS ============

        // GET /incidents
        if (request.method === "GET" && url.pathname === "/incidents") {
          const status = url.searchParams.get("status") ?? undefined;
          const severity = url.searchParams.get("severity") ?? undefined;
          const limitParam = url.searchParams.get("limit");
          const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;

          const incidents = await persistence.fetchIncidents({ status, severity, limit });
          writeJsonWithEtag(response, request, 200, { incidents });
          return;
        }

        // POST /incidents
        if (request.method === "POST" && url.pathname === "/incidents") {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const body = (await readJsonBody(request)) as {
            title: string;
            description?: string;
            start_at: string;
            end_at: string;
            aoi?: Record<string, unknown>;
            severity: string;
            tags?: string[];
          };

          if (!body.title || !body.start_at || !body.end_at || !body.severity) {
            writeJson(response, 400, {
              error: "title, start_at, end_at, and severity are required",
            });
            return;
          }

          const validation = validateIncidentPayload(body as Record<string, unknown>);
          if (!validation.ok) {
            writeJson(response, 400, { error: validation.error });
            return;
          }

          const incidentId = `inc_${crypto.randomUUID().replace(/-/g, "").substring(0, 12)}`;

          await persistence.createIncident({
            incident_id: incidentId,
            title: body.title,
            description: body.description,
            start_at: body.start_at,
            end_at: body.end_at,
            aoi: body.aoi,
            status: "open",
            severity: body.severity,
            created_by: authContext.user.user_id,
            tags: body.tags,
          });

          const incident = await persistence.fetchIncident(incidentId);
          writeJson(response, 201, incident);
          return;
        }

        // GET /incidents/:id
        if (
          request.method === "GET" &&
          url.pathname.startsWith("/incidents/") &&
          !url.pathname.includes("/timeline") &&
          !url.pathname.includes("/chapters") &&
          !url.pathname.includes("/links") &&
          !url.pathname.includes("/capture-jobs") &&
          !url.pathname.includes("/evidence") &&
          !url.pathname.includes("/intelligence") &&
          !url.pathname.includes("/capture-status")
        ) {
          const incidentId = url.pathname.replace("/incidents/", "");
          const incident = await persistence.fetchIncident(incidentId);

          if (!incident) {
            writeJson(response, 404, { error: "incident not found" });
            return;
          }

          writeJson(response, 200, incident);
          return;
        }

        // PATCH /incidents/:id
        if (request.method === "PATCH" && url.pathname.startsWith("/incidents/")) {
          if (!authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const incidentId = url.pathname.replace("/incidents/", "");
          const existing = await persistence.fetchIncident(incidentId);

          if (!existing) {
            writeJson(response, 404, { error: "incident not found" });
            return;
          }

          const body = (await readJsonBody(request)) as {
            title?: string;
            description?: string;
            start_at?: string;
            end_at?: string;
            aoi?: Record<string, unknown>;
            status?: string;
            severity?: string;
            tags?: string[];
          };

          const validation = validateIncidentPayload(body as Record<string, unknown>);
          if (!validation.ok) {
            writeJson(response, 400, { error: validation.error });
            return;
          }

          await persistence.updateIncident({
            incident_id: incidentId,
            ...body,
          });

          const updated = await persistence.fetchIncident(incidentId);
          writeJson(response, 200, updated);
          return;
        }

        // GET /incidents/:id/timeline
        if (request.method === "GET" && url.pathname.match(/^\/incidents\/[^/]+\/timeline$/)) {
          const incidentId = url.pathname.split("/")[2];
          const timeline = await persistence.fetchIncidentTimeline(incidentId);

          if (!timeline) {
            writeJson(response, 404, { error: "incident not found" });
            return;
          }

          writeJson(response, 200, timeline);
          return;
        }

        // GET /incidents/:id/chapters
        if (request.method === "GET" && url.pathname.match(/^\/incidents\/[^/]+\/chapters$/)) {
          const incidentId = url.pathname.split("/")[2];
          const chapters = await persistence.fetchIncidentChapters(incidentId);
          writeJson(response, 200, { chapters });
          return;
        }

        // POST /incidents/:id/chapters
        if (request.method === "POST" && url.pathname.match(/^\/incidents\/[^/]+\/chapters$/)) {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const incidentId = url.pathname.split("/")[2];
          const existing = await persistence.fetchIncident(incidentId);

          if (!existing) {
            writeJson(response, 404, { error: "incident not found" });
            return;
          }

          const body = (await readJsonBody(request)) as {
            title: string;
            timestamp: string;
            description?: string;
            event_ids?: string[];
            alert_ids?: string[];
            lat?: number;
            lon?: number;
          };

          if (!body.title || !body.timestamp) {
            writeJson(response, 400, { error: "title and timestamp are required" });
            return;
          }

          const chapterId = `ch_${crypto.randomUUID().replace(/-/g, "").substring(0, 12)}`;

          await persistence.createIncidentChapter({
            chapter_id: chapterId,
            incident_id: incidentId,
            title: body.title,
            timestamp: body.timestamp,
            description: body.description,
            event_ids: body.event_ids,
            alert_ids: body.alert_ids,
            lat: body.lat,
            lon: body.lon,
          });

          const chapters = await persistence.fetchIncidentChapters(incidentId);
          writeJson(response, 201, { chapters });
          return;
        }

        // GET /incidents/:id/links
        if (request.method === "GET" && url.pathname.match(/^\/incidents\/[^/]+\/links$/)) {
          const incidentId = url.pathname.split("/")[2];
          const links = await persistence.fetchIncidentLinks(incidentId);
          writeJson(response, 200, { links });
          return;
        }

        // POST /incidents/:id/links
        if (request.method === "POST" && url.pathname.match(/^\/incidents\/[^/]+\/links$/)) {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const incidentId = url.pathname.split("/")[2];
          const existing = await persistence.fetchIncident(incidentId);

          if (!existing) {
            writeJson(response, 404, { error: "incident not found" });
            return;
          }

          const body = (await readJsonBody(request)) as {
            event_id?: string;
            alert_id?: string;
            external_event_id?: string;
            layer_id?: string;
          };

          if (!body.event_id && !body.alert_id && !body.external_event_id) {
            writeJson(response, 400, {
              error: "event_id, alert_id, or external_event_id is required",
            });
            return;
          }

          await persistence.createIncidentLink({
            incident_id: incidentId,
            event_id: body.event_id,
            alert_id: body.alert_id,
            external_event_id: body.external_event_id,
            layer_id: body.layer_id,
            linked_by: authContext.user.user_id,
          });

          const links = await persistence.fetchIncidentLinks(incidentId);
          writeJson(response, 201, { links });
          return;
        }

        // GET /incidents/:id/capture-jobs
        if (request.method === "GET" && url.pathname.match(/^\/incidents\/[^/]+\/capture-jobs$/)) {
          const incidentId = url.pathname.split("/")[2];
          const status = url.searchParams.get("status") ?? undefined;
          const jobs = await persistence.listCaptureJobs(incidentId, status);
          writeJson(response, 200, { capture_jobs: jobs });
          return;
        }

        // POST /incidents/:id/capture-jobs
        if (request.method === "POST" && url.pathname.match(/^\/incidents\/[^/]+\/capture-jobs$/)) {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const incidentId = url.pathname.split("/")[2];
          const existing = await persistence.fetchIncident(incidentId);

          if (!existing) {
            writeJson(response, 404, { error: "incident not found" });
            return;
          }

          const body = (await readJsonBody(request)) as { source_type: string };

          if (!body.source_type) {
            writeJson(response, 400, { error: "source_type is required" });
            return;
          }

          const validSourceTypes = [
            "flights",
            "earthquakes",
            "satellites",
            "weather",
            "bikeshare",
            "traffic",
            "cctv",
            "alerts",
            "events",
          ];
          if (!validSourceTypes.includes(body.source_type)) {
            writeJson(response, 400, {
              error: `source_type must be one of: ${validSourceTypes.join(", ")}`,
            });
            return;
          }

          const captureJobId = await persistence.createCaptureJob(
            incidentId,
            body.source_type,
            authContext.user.user_id,
          );

          const job = await persistence.getCaptureJob(captureJobId);
          writeJson(response, 201, { capture_job: job });
          return;
        }

        // GET /capture-jobs/:id
        if (
          request.method === "GET" &&
          url.pathname.match(/^\/capture-jobs\/[^/]+$/) &&
          !url.pathname.includes("/snapshots")
        ) {
          const captureJobId = url.pathname.replace("/capture-jobs/", "");
          const job = await persistence.getCaptureJob(captureJobId);

          if (!job) {
            writeJson(response, 404, { error: "capture job not found" });
            return;
          }

          const snapshots = await persistence.listCaptureSnapshots(captureJobId);
          const evidenceFreeze = await persistence.getEvidenceFreeze(captureJobId);

          writeJson(response, 200, {
            capture_job: {
              ...job,
              snapshots,
              evidence_freeze: evidenceFreeze,
            },
          });
          return;
        }

        // POST /capture-jobs/:id/start
        if (request.method === "POST" && url.pathname.match(/^\/capture-jobs\/[^/]+\/start$/)) {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const captureJobId = url.pathname.split("/")[2];
          const job = await persistence.getCaptureJob(captureJobId);

          if (!job) {
            writeJson(response, 404, { error: "capture job not found" });
            return;
          }

          if (job.status !== "pending") {
            writeJson(response, 400, { error: `cannot start job in ${job.status} status` });
            return;
          }

          await persistence.startCaptureJob(captureJobId);
          const updatedJob = await persistence.getCaptureJob(captureJobId);
          writeJson(response, 200, { capture_job: updatedJob });
          return;
        }

        // POST /capture-jobs/:id/run - start and execute the capture job
        if (request.method === "POST" && url.pathname.match(/^\/capture-jobs\/[^/]+\/run$/)) {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const captureJobId = url.pathname.split("/")[2];
          const job = await persistence.getCaptureJob(captureJobId);

          if (!job) {
            writeJson(response, 404, { error: "capture job not found" });
            return;
          }

          if (job.status !== "pending") {
            writeJson(response, 400, { error: `cannot run job in ${job.status} status` });
            return;
          }

          await persistence.startCaptureJob(captureJobId);
          await runCaptureJob(persistence, captureJobId, logger);
          const updatedJob = await persistence.getCaptureJob(captureJobId);

          writeJson(response, 200, {
            capture_job: updatedJob,
          });
          return;
        }

        // GET /insights - list recent insights
        if (request.method === "GET" && url.pathname === "/insights") {
          const urlParams = url.searchParams;
          const limit = Math.min(parseInt(urlParams.get("limit") || "50", 10), 200);
          const severity = urlParams.get("severity")?.split(",").filter(Boolean);
          const publishedOnly = urlParams.get("published") !== "false";

          const insights = await persistence.listAgentInsights({
            limit,
            severity: severity as string[] | undefined,
            publishedOnly,
          });

          writeJson(response, 200, { insights });
          return;
        }

        // GET /insights/stream - SSE stream for live insights
        if (request.method === "GET" && url.pathname === "/insights/stream") {
          if (config.authEnabled && !authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          response.setHeader("Content-Type", "text/event-stream");
          response.setHeader("Cache-Control", "no-cache");
          response.setHeader("Connection", "keep-alive");
          response.writeHead(200);

          const heartbeat = setInterval(() => {
            response.write(`: heartbeat\n\n`);
          }, 30000);

          const unsubscribe = liveEventBus.subscribe((event) => {
            response.write(`data: ${JSON.stringify(event)}\n\n`);
          });

          request.on("close", () => {
            clearInterval(heartbeat);
            unsubscribe();
          });

          return;
        }

        // POST /insights/:id/acknowledge
        if (request.method === "POST" && url.pathname.match(/^\/insights\/[^/]+\/acknowledge$/)) {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const insightId = url.pathname.split("/")[2];
          await persistence.acknowledgeInsight(insightId, authContext.user.user_id);
          writeJson(response, 200, { success: true, insightId });
          return;
        }

        // POST /insights/:id/dismiss
        if (request.method === "POST" && url.pathname.match(/^\/insights\/[^/]+\/dismiss$/)) {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const insightId = url.pathname.split("/")[2];
          await persistence.dismissInsight(insightId, authContext.user.user_id);
          writeJson(response, 200, { success: true, insightId });
          return;
        }

        // POST /insights/:id/resolve
        if (request.method === "POST" && url.pathname.match(/^\/insights\/[^/]+\/resolve$/)) {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const insightId = url.pathname.split("/")[2];
          const body = (await readJsonBody(request)) as { resolution?: string };
          await persistence.resolveInsight(insightId, authContext.user.user_id, body.resolution);
          writeJson(response, 200, { success: true, insightId });
          return;
        }

        // POST /insights/:id/snooze
        if (request.method === "POST" && url.pathname.match(/^\/insights\/[^/]+\/snooze$/)) {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const insightId = url.pathname.split("/")[2];
          const body = (await readJsonBody(request)) as { durationMs?: number };
          const durationMs = body.durationMs ?? 3600000;
          await persistence.snoozeSimilarInsights(insightId, durationMs);
          writeJson(response, 200, {
            success: true,
            insightId,
            snoozedUntil: new Date(Date.now() + durationMs).toISOString(),
          });
          return;
        }

        // GET /metrics/agents - agent system metrics
        if (request.method === "GET" && url.pathname === "/metrics/agents") {
          const metrics = await persistence.getAgentMetrics();
          writeJson(response, 200, metrics);
          return;
        }

        // POST /capture-jobs/:id/complete
        if (request.method === "POST" && url.pathname.match(/^\/capture-jobs\/[^/]+\/complete$/)) {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const captureJobId = url.pathname.split("/")[2];
          const job = await persistence.getCaptureJob(captureJobId);

          if (!job) {
            writeJson(response, 404, { error: "capture job not found" });
            return;
          }

          if (job.status !== "running") {
            writeJson(response, 400, { error: `cannot complete job in ${job.status} status` });
            return;
          }

          const body = (await readJsonBody(request)) as {
            error_code?: string;
            error_message?: string;
          };

          await persistence.completeCaptureJob(captureJobId, body.error_code, body.error_message);

          const updatedJob = await persistence.getCaptureJob(captureJobId);
          writeJson(response, 200, { capture_job: updatedJob });
          return;
        }

        // GET /capture-jobs/:id/snapshots
        if (request.method === "GET" && url.pathname.match(/^\/capture-jobs\/[^/]+\/snapshots$/)) {
          const captureJobId = url.pathname.split("/")[2];
          const job = await persistence.getCaptureJob(captureJobId);

          if (!job) {
            writeJson(response, 404, { error: "capture job not found" });
            return;
          }

          const snapshots = await persistence.listCaptureSnapshots(captureJobId);
          writeJson(response, 200, { snapshots });
          return;
        }

        // POST /capture-jobs/:id/freeze
        if (request.method === "POST" && url.pathname.match(/^\/capture-jobs\/[^/]+\/freeze$/)) {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const captureJobId = url.pathname.split("/")[2];
          const job = await persistence.getCaptureJob(captureJobId);

          if (!job) {
            writeJson(response, 404, { error: "capture job not found" });
            return;
          }

          if (job.status !== "completed") {
            writeJson(response, 400, { error: "can only freeze completed capture jobs" });
            return;
          }

          const body = (await readJsonBody(request)) as { notes?: string };

          const frozenCount = await persistence.freezeSnapshots(captureJobId);

          if (frozenCount === 0) {
            await persistence.updateCaptureJobFreezeStatus(captureJobId, "frozen");
          }

          const freezeId = await persistence.createEvidenceFreeze(
            captureJobId,
            job.incident_id,
            job.source_type,
            getSourceDisplayName(job.source_type),
            authContext.user.user_id,
            body.notes,
          );

          const evidenceFreeze = await persistence.getEvidenceFreeze(captureJobId);
          const updatedJob = await persistence.getCaptureJob(captureJobId);

          writeJson(response, 200, {
            freeze_id: freezeId,
            snapshots_frozen: frozenCount,
            capture_job: updatedJob,
            evidence_freeze: evidenceFreeze,
          });
          return;
        }

        // GET /incidents/:id/evidence
        if (request.method === "GET" && url.pathname.match(/^\/incidents\/[^/]+\/evidence$/)) {
          const incidentId = url.pathname.split("/")[2];
          const evidenceList = await persistence.listEvidenceFreeze(incidentId);
          const captureStatus = await persistence.getIncidentCaptureStatus(incidentId);

          writeJson(response, 200, {
            evidence: evidenceList,
            capture_status: captureStatus,
          });
          return;
        }

        // GET /incidents/:id/intelligence
        if (request.method === "GET" && url.pathname.match(/^\/incidents\/[^/]+\/intelligence$/)) {
          const incidentId = url.pathname.split("/")[2];
          const incident = await persistence.fetchIncident(incidentId);

          if (!incident) {
            writeJson(response, 404, { error: "incident not found" });
            return;
          }

          const intelligence = await persistence.getIncidentIntelligenceBundle(incidentId);
          writeJson(response, 200, intelligence);
          return;
        }

        // POST /incidents/:id/intelligence/refresh
        if (
          request.method === "POST" &&
          url.pathname.match(/^\/incidents\/[^/]+\/intelligence\/refresh$/)
        ) {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const incidentId = url.pathname.split("/")[2];
          const incident = await persistence.fetchIncident(incidentId);

          if (!incident) {
            writeJson(response, 404, { error: "incident not found" });
            return;
          }

          const result = await refreshIncidentIntelligence({
            incident,
            persistence,
            logger: incidentIntelligenceLogger,
            collectors: options.incidentIntelligenceCollectors,
            youtubeApiKey: config.youtubeApiKey,
          });

          await publishIncidentIntelligenceUpdate(result);
          writeJson(response, 200, result);
          return;
        }

        // GET /incidents/:id/capture-status
        if (
          request.method === "GET" &&
          url.pathname.match(/^\/incidents\/[^/]+\/capture-status$/)
        ) {
          const incidentId = url.pathname.split("/")[2];
          const captureStatus = await persistence.getIncidentCaptureStatus(incidentId);

          if (!captureStatus) {
            writeJson(response, 200, {
              incident_id: incidentId,
              total_jobs: 0,
              completed_jobs: 0,
              active_jobs: 0,
              failed_jobs: 0,
              total_snapshots: 0,
              has_frozen_evidence: false,
              sources_captured: [],
              sources_frozen: [],
            });
            return;
          }

          writeJson(response, 200, captureStatus);
          return;
        }

        // GET /inferences
        if (request.method === "GET" && url.pathname === "/inferences") {
          const inferenceType = url.searchParams.get("type") ?? undefined;
          const status = url.searchParams.get("status") ?? undefined;
          const startTime = url.searchParams.get("start_time") ?? undefined;
          const endTime = url.searchParams.get("end_time") ?? undefined;

          const inferences = await persistence.listInferredEvents({
            inference_type: inferenceType,
            status,
            start_time: startTime,
            end_time: endTime,
          });

          writeJsonWithEtag(response, request, 200, { inferences });
          return;
        }

        // GET /correlations
        if (request.method === "GET" && url.pathname === "/correlations") {
          if (!authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }
          const severity = url.searchParams.get("severity") ?? undefined;
          const status = url.searchParams.get("status") ?? undefined;
          const limitParam = url.searchParams.get("limit");
          const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;

          const signals = await persistence.fetchCorrelationSignals({ severity, status, limit });
          writeJsonWithEtag(response, request, 200, { signals });
          return;
        }

        // POST /inferences
        if (request.method === "POST" && url.pathname === "/inferences") {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const body = (await readJsonBody(request)) as {
            inference_type: string;
            time_window_start: string;
            time_window_end: string;
            aoi?: Record<string, unknown>;
            related_source_ids?: string[];
            related_object_ids?: string[];
            related_event_ids?: string[];
            evidence_summary: string;
            details: Record<string, unknown>;
          };

          if (
            !body.inference_type ||
            !body.evidence_summary ||
            !body.time_window_start ||
            !body.time_window_end
          ) {
            writeJson(response, 400, {
              error:
                "inference_type, evidence_summary, time_window_start, and time_window_end are required",
            });
            return;
          }

          const validTypes = [
            "nav_degradation",
            "route_redirection",
            "holding_pattern",
            "absence_signal",
            "anomaly",
          ];
          if (!validTypes.includes(body.inference_type)) {
            writeJson(response, 400, {
              error: `inference_type must be one of: ${validTypes.join(", ")}`,
            });
            return;
          }

          const confidence =
            typeof body.details?.confidence === "number" ? body.details.confidence : 0.5;
          const confidenceLevel =
            confidence >= 0.9
              ? "very_high"
              : confidence >= 0.7
                ? "high"
                : confidence >= 0.5
                  ? "medium"
                  : "low";

          const inferenceId = await persistence.createInferredEvent({
            inference_type: body.inference_type,
            confidence,
            confidence_level: confidenceLevel,
            time_window_start: body.time_window_start,
            time_window_end: body.time_window_end,
            aoi: body.aoi,
            related_source_ids: body.related_source_ids,
            related_object_ids: body.related_object_ids,
            related_event_ids: body.related_event_ids,
            evidence_summary: body.evidence_summary,
            details: body.details,
          });

          const inference = await persistence.getInferredEvent(inferenceId);
          writeJson(response, 201, { inference });
          return;
        }

        // GET /inferences/timeline (must come before /inferences/:id)
        if (request.method === "GET" && url.pathname === "/inferences/timeline") {
          if (config.authEnabled && !authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const incidentId = url.searchParams.get("incident_id") ?? undefined;
          const markers = await persistence.listInferenceTimelineMarkers(incidentId);

          writeJson(response, 200, { markers });
          return;
        }

        // GET /inferences/:id
        if (request.method === "GET" && url.pathname.match(/^\/inferences\/[^/]+$/)) {
          if (config.authEnabled && !authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const inferenceId = url.pathname.replace("/inferences/", "");
          const inference = await persistence.getInferredEvent(inferenceId);

          if (!inference) {
            writeJson(response, 404, { error: "inference not found" });
            return;
          }

          writeJson(response, 200, { inference });
          return;
        }

        // PATCH /inferences/:id
        if (request.method === "PATCH" && url.pathname.match(/^\/inferences\/[^/]+$/)) {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const inferenceId = url.pathname.replace("/inferences/", "");
          const existing = await persistence.getInferredEvent(inferenceId);

          if (!existing) {
            writeJson(response, 404, { error: "inference not found" });
            return;
          }

          const body = (await readJsonBody(request)) as { status?: string };

          if (body.status) {
            const validStatuses = ["active", "resolved", "expired", "invalidated"];
            if (!validStatuses.includes(body.status)) {
              writeJson(response, 400, {
                error: `status must be one of: ${validStatuses.join(", ")}`,
              });
              return;
            }

            await persistence.updateInferenceStatus(inferenceId, body.status);
          }

          const inference = await persistence.getInferredEvent(inferenceId);
          writeJson(response, 200, { inference });
          return;
        }

        // GET /degradation-zones
        if (request.method === "GET" && url.pathname === "/degradation-zones") {
          if (config.authEnabled && !authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const zones = await persistence.listActiveDegradationZones();

          writeJson(response, 200, {
            zones,
            generated_at: new Date().toISOString(),
          });
          return;
        }

        if (request.method === "GET" && url.pathname === "/news") {
          if (!authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }
          const category = url.searchParams.get("category") ?? undefined;
          const threat = url.searchParams.get("threat") ?? undefined;
          const country = url.searchParams.get("country") ?? undefined;
          const limitParam = url.searchParams.get("limit");
          const limit = limitParam ? Number.parseInt(limitParam, 10) : 100;

          try {
            const intelligence = await fetchAllNewsIntelligence();

            let items = intelligence.items;
            if (category) items = items.filter((i) => i.category === category);
            if (threat) items = items.filter((i) => i.threat_level === threat);
            if (country) items = items.filter((i) => i.country_codes.includes(country));
            items = items.slice(0, limit);

            const clusters = intelligence.clusters
              .filter((c) => !category || c.category === category)
              .slice(0, Math.max(5, Math.floor(limit / 10)));

            writeJsonWithEtag(response, request, 200, {
              items,
              clusters,
              feeds: intelligence.feeds,
              fetched_at: intelligence.fetched_at,
              total_count: intelligence.total_count,
              critical_count: intelligence.critical_count,
              active_feeds: intelligence.active_feeds,
            });
          } catch (error) {
            writeJson(response, 503, {
              error: "news_service_unavailable",
              message: String(error),
            });
          }
          return;
        }

        if (request.method === "GET" && url.pathname === "/news/feeds") {
          if (config.authEnabled && !authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          writeJsonWithEtag(response, request, 200, { feeds: DEFAULT_NEWS_FEEDS });
          return;
        }

        if (request.method === "GET" && url.pathname === "/intelligence/sources") {
          if (config.authEnabled && !authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          writeJsonWithEtag(response, request, 200, getIntelligenceSourceCatalog());
          return;
        }

        // ============ WEBCAM CHANNELS ENDPOINT ============

        if (request.method === "GET" && url.pathname === "/webcams") {
          if (config.authEnabled && !authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const region = url.searchParams.get("region") ?? undefined;
          const tag = url.searchParams.get("tag") ?? undefined;
          const priority = url.searchParams.get("priority") ?? undefined;

          let channels: typeof GEOPOLITICAL_WEBCAM_CHANNELS;
          if (tag) {
            channels = getWebcamChannelsByTag(tag);
          } else if (region) {
            channels = getWebcamChannelsByRegion(region);
          } else {
            channels = GEOPOLITICAL_WEBCAM_CHANNELS;
          }

          if (priority === "high") channels = channels.filter((c) => c.priority === "high");
          else if (priority === "medium")
            channels = channels.filter((c) => c.priority === "medium");

          writeJsonWithEtag(response, request, 200, {
            channels,
            regions: [...new Set(GEOPOLITICAL_WEBCAM_CHANNELS.map((c) => c.region))],
            total_count: GEOPOLITICAL_WEBCAM_CHANNELS.length,
          });
          return;
        }

        // ============ TV CHANNELS ENDPOINT ============

        if (request.method === "GET" && url.pathname === "/tv-channels") {
          if (config.authEnabled && !authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const region = url.searchParams.get("region") ?? undefined;
          const tag = url.searchParams.get("tag") ?? undefined;
          const priority = url.searchParams.get("priority") ?? undefined;
          const liveOnly = url.searchParams.get("live") === "true";
          const source = url.searchParams.get("source") ?? undefined;

          let channels = [...TV_NEWS_CHANNELS, ...NEWS_NETWORK_FEEDS];
          if (tag) {
            channels = getTVChannelsByTag(tag);
          } else if (region) {
            channels = getTVChannelsByRegion(region);
          }

          if (liveOnly) channels = channels.filter((c) => c.is_live);
          if (source) channels = channels.filter((c) => c.source === source);
          if (priority === "high") channels = channels.filter((c) => c.priority === "high");
          else if (priority === "medium")
            channels = channels.filter((c) => c.priority === "medium");

          writeJsonWithEtag(response, request, 200, {
            channels,
            regions: [...new Set(channels.map((c) => c.region))],
            total_count: channels.length,
            youtube_count: channels.filter((c) => c.source === "youtube").length,
            news_network_count: channels.filter((c) => c.source === "news_network").length,
          });
          return;
        }

        // ============ REAL-TIME NEWS ENDPOINTS ============

        if (request.method === "GET" && url.pathname === "/news/realtime") {
          const since = url.searchParams.get("since") ?? undefined;
          const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
          const severity = url.searchParams.get("severity") ?? undefined;

          const { getRealtimeUpdates } = await import(
            "../../../packages/intelligence/src/news-clips.js"
          );

          let updates = getRealtimeUpdates(since, limit);
          if (severity) {
            updates = updates.filter((u) => u.severity === severity);
          }

          writeJsonWithEtag(response, request, 200, {
            updates,
            fetched_at: new Date().toISOString(),
            total_count: updates.length,
          });
          return;
        }

        if (request.method === "GET" && url.pathname === "/news/realtime/stream") {
          response.setHeader("Content-Type", "text/event-stream");
          response.setHeader("Cache-Control", "no-cache");
          response.setHeader("Connection", "keep-alive");
          response.writeHead(200);

          const { getRealtimeUpdates, incrementSubscriptions, decrementSubscriptions } =
            await import("../../../packages/intelligence/src/news-clips.js");

          incrementSubscriptions();
          const initialUpdates = getRealtimeUpdates(undefined, 50);
          for (const update of initialUpdates) {
            response.write(`data: ${JSON.stringify(update)}\n\n`);
          }

          const connectionInfo = liveEventBus.getConnectionInfo();
          response.write(`data: ${JSON.stringify(connectionInfo)}\n\n`);

          const listener = (event: LiveEvent) => {
            if (event.type === "news_realtime_update" || event.type === "news_clip_update") {
              response.write(`data: ${JSON.stringify(event)}\n\n`);
            }
          };

          const unsubscribe = liveEventBus.subscribe(listener);

          const heartbeat = setInterval(() => {
            response.write(`: heartbeat\n\n`);
          }, 30000);

          request.on("close", () => {
            clearInterval(heartbeat);
            unsubscribe();
            decrementSubscriptions();
          });

          return;
        }

        // ============ NEWS CLIPS ENDPOINT ============

        if (request.method === "GET" && url.pathname === "/news/clips") {
          if (config.authEnabled && !authContext.isAuthenticated) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const topic = url.searchParams.get("topic") ?? undefined;
          const channelId = url.searchParams.get("channel_id") ?? undefined;
          const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 50);

          try {
            const { fetchBreakingNewsClips, fetchLatestClipsByTopic, fetchYouTubeClips } =
              await import("../../../packages/intelligence/src/news-clips.js");

            let clips: Awaited<ReturnType<typeof fetchBreakingNewsClips>> = [];
            if (channelId) {
              clips = await fetchYouTubeClips(channelId, limit);
            } else if (topic) {
              clips = await fetchLatestClipsByTopic(topic, limit);
            } else {
              clips = await fetchBreakingNewsClips(limit);
            }

            writeJsonWithEtag(response, request, 200, {
              clips,
              fetched_at: new Date().toISOString(),
              total_count: clips.length,
            });
          } catch (error) {
            writeJson(response, 503, {
              error: "clips_unavailable",
              message: String(error),
            });
          }
          return;
        }

        // ============ SOURCE REGISTRY ENDPOINTS ============

        // GET /sources
        if (request.method === "GET" && url.pathname === "/sources") {
          const sources = await persistence.listSourceRegistry();
          writeJsonWithEtag(response, request, 200, { sources });
          return;
        }

        // GET /sources/nearest-to-point
        if (request.method === "GET" && url.pathname === "/sources/nearest-to-point") {
          const latParam = url.searchParams.get("lat");
          const lonParam = url.searchParams.get("lon");

          if (!latParam || !lonParam) {
            writeJson(response, 400, { error: "lat and lon query parameters are required" });
            return;
          }

          const lat = Number.parseFloat(latParam);
          const lon = Number.parseFloat(lonParam);

          if (Number.isNaN(lat) || Number.isNaN(lon)) {
            writeJson(response, 400, { error: "lat and lon must be valid numbers" });
            return;
          }

          const source = await persistence.getNearestSourceToPoint(lat, lon);

          if (!source) {
            writeJson(response, 404, { error: "no sources found" });
            return;
          }

          writeJson(response, 200, source);
          return;
        }

        // GET /sources/linked/:targetType/:targetId
        if (request.method === "GET" && url.pathname.match(/^\/sources\/linked\/[^/]+\/[^/]+$/)) {
          const pathParts = url.pathname.replace("/sources/linked/", "").split("/");
          const targetType = pathParts[0] as "object" | "alert" | "incident";
          const targetId = pathParts[1];

          if (!targetType || !targetId) {
            writeJson(response, 400, { error: "target_type and target_id are required" });
            return;
          }

          const links = await persistence.getSourceLinksForTarget({
            target_type: targetType,
            target_id: targetId,
          });
          writeJson(response, 200, { links });
          return;
        }

        // GET /sources/:sourceId (catch-all — must NOT match /sources/nearest-to-point or /sources/linked)
        if (
          request.method === "GET" &&
          url.pathname.match(/^\/sources\/[^/]+$/) &&
          url.pathname !== "/sources/nearest-to-point"
        ) {
          const sourceId = url.pathname.replace("/sources/", "");
          const source = await persistence.getSourceRegistry(sourceId);

          if (!source) {
            writeJson(response, 404, { error: "source not found" });
            return;
          }

          writeJson(response, 200, source);
          return;
        }

        // POST /inferences/:id/link-incident
        if (
          request.method === "POST" &&
          url.pathname.match(/^\/inferences\/[^/]+\/link-incident$/)
        ) {
          if (!authContext.isAuthenticated || !authContext.user) {
            writeJson(response, 401, { error: "unauthorized" });
            return;
          }

          const inferenceId = url.pathname.split("/")[2];
          const body = (await readJsonBody(request)) as { incident_id: string };

          if (!body.incident_id) {
            writeJson(response, 400, { error: "incident_id is required" });
            return;
          }

          await persistence.linkInferenceToIncident(
            inferenceId,
            body.incident_id,
            authContext.user.user_id,
          );

          writeJson(response, 200, { linked: true });
          return;
        }

        const handled = registerUniversalDataRoutes(
          request,
          response,
          url,
          universalDataGateway,
          universalDataRegistry,
          logger,
        );
        if (handled) {
          return;
        }

        logger.warn("Route not found", { pathname: url.pathname, method: request.method });

        writeJson(response, 404, {
          error: "not_found",
          message: "Route not found",
        });
      } catch (error) {
        if (error instanceof InvalidJsonBodyError) {
          writeJson(response, 400, {
            error: "invalid_json",
            message: error.message,
          });
          return;
        }

        const message = error instanceof Error ? error.message : "Unexpected API failure";
        logger.error("Request error", { error: message });
        writeJson(response, 500, {
          error: "internal_error",
          message,
        });
      } finally {
        activeRequestCount = Math.max(0, activeRequestCount - 1);
        if (closing && activeRequestCount === 0) {
          activeRequestsDrainedResolver?.();
          activeRequestsDrainedResolver = null;
        }
      }
    },
  );

  return {
    server,
    persistence,
    async close() {
      await waitForActiveRequestsToDrain();
      if (incidentIntelligenceInterval) {
        clearInterval(incidentIntelligenceInterval);
      }
      if (_realtimeNewsInterval) {
        clearInterval(_realtimeNewsInterval);
      }
      if (universalDataInterval) {
        clearInterval(universalDataInterval);
      }
      if (lagMonitorInterval) {
        clearInterval(lagMonitorInterval);
      }
      await liveWorldService.close();
      await persistence.close();
      server.close();
    },
  };
}

export async function startApiServer(options: {
  connection_string: string;
  port?: number;
  clock?: Clock;
  skipConfigValidation?: boolean;
  incidentIntelligenceCollectors?: IncidentIntelligenceCollector[];
}): Promise<RunningApiServer & { port: number }> {
  if (!options.skipConfigValidation) {
    const config = getConfigFromEnv();
    const validation = validateConfig(config);

    if (!validation.valid) {
      console.error("Configuration validation failed:");
      for (const err of validation.errors) {
        console.error(`  - ${err}`);
      }
      throw new Error("Invalid configuration");
    }
  }

  const runningServer = await createApiServer({
    ...options,
    disableLiveWorldService:
      options.skipConfigValidation === true && process.env.ENABLE_LIVE_WORLD_SERVICE !== "true",
  });

  await new Promise<void>((resolve, reject) => {
    runningServer.server.once("error", reject);
    runningServer.server.listen(options.port ?? 0, "0.0.0.0", () => resolve());
  });

  const address = runningServer.server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to determine API server address");
  }

  return {
    ...runningServer,
    port: address.port,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL must be set to start the API server");
  }

  const port = process.env.API_PORT
    ? Number.parseInt(process.env.API_PORT, 10)
    : process.env.PORT
      ? Number.parseInt(process.env.PORT, 10)
      : 3000;

  startApiServer({ connection_string: connectionString, port }).then(
    async ({ port: boundPort, persistence }) => {
      console.log(`API server listening on http://0.0.0.0:${boundPort}`);

      try {
        await maybeBootstrapDevelopmentDemoData({
          persistence,
          logger: createLogger("api-bootstrap"),
          clock: systemClock,
        });
      } catch (error) {
        createLogger("api-bootstrap").warn("Development demo bootstrap failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}
