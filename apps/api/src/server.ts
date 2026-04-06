import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { createAlertRuleId, evaluateEventForAlerts } from "../../../packages/alerts/src/index.js";
import { authenticate, validateToken } from "../../../packages/auth/src/index.js";
import { getConfigFromEnv, validateConfig } from "../../../packages/config/src/index.js";
import { applyCanonicalEventToObjectState } from "../../../packages/domain/src/index.js";
import {
  createCelesTrakAdapter,
  createCityBikesAdapter,
  createMilitaryFlightsAdapter,
  createNOAAWeatherAdapter,
  createStreetTrafficAdapter,
  createUSGSEarthquakeAdapter,
  type ExternalDataEvent,
} from "../../../packages/external-data/src/index.js";
import {
  type Clock,
  ingestCameraObservationBatch,
  ingestFixtureTelemetryBatch,
  systemClock,
  validateCameraObservationIngestionInput,
  validateFixtureTelemetryIngestionInput,
} from "../../../packages/ingestion/src/index.js";
import type { Logger } from "../../../packages/logging/src/index.js";
import { createLogger } from "../../../packages/logging/src/index.js";
import {
  PostgresPersistenceGateway,
  setObjectStateUpdateCallback,
} from "../../../packages/persistence/src/index.js";
import {
  type ReplayQueryRequest,
  validateReplayQueryRequest,
} from "../../../packages/replay/src/index.js";
import { type LiveEvent, liveEventBus } from "./live-event-bus.js";

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

// Refresh external data layer from source
async function refreshExternalDataLayer(
  layerId: string,
  persistence: PostgresPersistenceGateway,
  logger: Logger,
): Promise<{ success: boolean; message: string; count?: number; error?: string }> {
  const startTime = Date.now();
  logger.info("Refreshing external data layer", { layer_id: layerId });

  try {
    let result: { success: boolean; events: ExternalDataEvent[]; error?: string };

    switch (layerId) {
      case "earthquakes": {
        const adapter = createUSGSEarthquakeAdapter();
        result = await adapter.fetch();
        break;
      }
      case "satellites": {
        const adapter = createCelesTrakAdapter();
        result = await adapter.fetchTLEs("visual");
        break;
      }
      case "weather": {
        const adapter = createNOAAWeatherAdapter();
        result = await adapter.fetchAlerts();
        break;
      }
      case "bikeshare": {
        const adapter = createCityBikesAdapter();
        result = await adapter.fetchMajorCities();
        break;
      }
      case "traffic": {
        const apiKey = process.env.TRAFFIC_API_KEY;
        const adapter = createStreetTrafficAdapter(apiKey);
        result = await adapter.fetchIncidents();
        break;
      }
      case "military": {
        const adapter = createMilitaryFlightsAdapter();
        result = await adapter.fetch();
        break;
      }
      default:
        return { success: false, message: "Unknown layer", error: `Unknown layer_id: ${layerId}` };
    }

    const duration = Date.now() - startTime;

    if (result.success) {
      // Persist events to database
      await persistence.persistExternalDataEvents(
        layerId,
        result.events.map((e) => ({
          event_id: e.eventId,
          external_id: e.externalId,
          event_type: e.eventType,
          observed_at: e.observedAt,
          lat: e.lat,
          lon: e.lon,
          altitude_m: e.altitudeM,
          payload: e.payload,
        })),
      );

      // Update layer metadata
      await persistence.updateExternalDataLayer({
        layer_id: layerId,
        status: result.events.length > 0 ? "real" : "degraded",
        record_count: result.events.length,
        error_message: undefined,
        raw_data: { refreshed_at: new Date().toISOString(), duration_ms: duration },
      });

      logger.info("External data layer refreshed", {
        layer_id: layerId,
        count: result.events.length,
        duration_ms: duration,
      });

      return {
        success: true,
        message: `Layer ${layerId} refreshed successfully`,
        count: result.events.length,
      };
    } else {
      // Update layer metadata with error
      await persistence.updateExternalDataLayer({
        layer_id: layerId,
        status: "degraded",
        record_count: 0,
        error_message: result.error,
        raw_data: { error_at: new Date().toISOString(), duration_ms: duration },
      });

      logger.warn("External data layer refresh failed", {
        layer_id: layerId,
        error: result.error,
        duration_ms: duration,
      });

      return {
        success: false,
        message: `Layer ${layerId} refresh failed`,
        error: result.error,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("External data layer refresh error", {
      layer_id: layerId,
      error: errorMessage,
    });

    await persistence.updateExternalDataLayer({
      layer_id: layerId,
      status: "degraded",
      record_count: 0,
      error_message: errorMessage,
    });

    return {
      success: false,
      message: `Layer ${layerId} refresh error`,
      error: errorMessage,
    };
  }
}

interface ApiServerOptions {
  connection_string: string;
  clock?: Clock;
}

export interface RunningApiServer {
  readonly server: Server;
  readonly persistence: PostgresPersistenceGateway;
  close(): Promise<void>;
}

function addCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "content-type,authorization");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,PATCH,DELETE");
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  addCorsHeaders(response);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createApiServer(options: ApiServerOptions): RunningApiServer {
  const logger = createLogger("api-server");
  const persistence = PostgresPersistenceGateway.fromConnectionString(options.connection_string);
  const clock = options.clock ?? systemClock;

  logger.info("Starting API server", {
    connection_string: options.connection_string.replace(/:[^:@]+@/, ":***@"),
  });

  setObjectStateUpdateCallback((state) => {
    liveEventBus.publish({
      type: "object_state_update",
      timestamp: new Date().toISOString(),
      payload: state,
    });
  });

  const server = createServer(async (request, response) => {
    addCorsHeaders(response);

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
    const authContext = authHeader?.startsWith("Bearer ")
      ? validateToken(authHeader.substring(7))
      : { user: null, isAuthenticated: false };

    try {
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

      if (request.method === "POST" && url.pathname === "/auth/login") {
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
        // Read body to consume the request, but we don't need the data
        await readJsonBody(request);
        // In a real app, we would invalidate the token server-side
        // For this implementation, we just acknowledge the logout
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

        logger.info("Ingesting fixture telemetry", { source: validation.value.source?.source_id });

        const result = await ingestFixtureTelemetryBatch({
          command: validation.value,
          persistence,
          clock,
        });

        if (result.latest_state_by_object_id) {
          for (const [objectId, state] of Object.entries(result.latest_state_by_object_id)) {
            const events = await persistence.fetchCanonicalEvents({
              start_at: clock.now(),
              end_at: clock.now(),
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

        logger.info("Ingesting camera observation", { source: validation.value.source?.source_id });

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
        const states = await persistence.fetchLatestStateForAllObjects();
        writeJson(response, 200, { states });
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
        writeJson(response, 200, { alerts });
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
        const body = (await readJsonBody(request)) as { status: string; acknowledged_by?: string };

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
        const eventId = url.pathname.replace("/events/", "");

        const query: ReplayQueryRequest = {
          start_at: "2020-01-01T00:00:00Z",
          end_at: "2030-12-31T23:59:59Z",
        };
        const events = await persistence.fetchCanonicalEvents(query);

        const event = events.find((e) => e.event_id === eventId);

        if (!event) {
          writeJson(response, 404, { error: "not_found", message: "Event not found" });
          return;
        }

        writeJson(response, 200, event);
        return;
      }

      if (request.method === "POST" && url.pathname === "/replay/query") {
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
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });

        const sinceSequence = Number.parseInt(url.searchParams.get("since_sequence") ?? "0", 10);

        if (sinceSequence > 0) {
          const missedEvents = liveEventBus.getRecentEvents(sinceSequence);
          for (const event of missedEvents) {
            response.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        }

        const connectionInfo = liveEventBus.getConnectionInfo();
        response.write(`data: ${JSON.stringify(connectionInfo)}\n\n`);

        const listener = (event: LiveEvent) => {
          response.write(`data: ${JSON.stringify(event)}\n\n`);
        };

        const unsubscribe = liveEventBus.subscribe(listener);

        request.on("close", () => {
          unsubscribe();
        });

        return;
      }

      // ============ EXTERNAL DATA LAYER ENDPOINTS ============

      if (request.method === "GET" && url.pathname === "/layers") {
        const layers = await persistence.fetchExternalDataLayers();
        writeJson(
          response,
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

          writeJson(response, 200, {
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

          const events = await persistence.fetchExternalDataEvents(layerId);

          writeJson(response, 200, {
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

          const result = await refreshExternalDataLayer(layerId, persistence, logger);
          writeJson(response, result.success ? 200 : 503, result);
          return;
        }

        // Handle method not allowed for other paths
        if (action) {
          writeJson(response, 404, { error: "layer action not found" });
          return;
        }
      }

      logger.warn("Route not found", { pathname: url.pathname, method: request.method });

      writeJson(response, 404, {
        error: "not_found",
        message: "Route not found",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected API failure";
      logger.error("Request error", { error: message });
      writeJson(response, 500, {
        error: "internal_error",
        message,
      });
    }
  });

  return {
    server,
    persistence,
    async close() {
      logger.info("Shutting down API server");
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      await persistence.close();
      logger.info("API server shut down");
    },
  };
}

export async function startApiServer(options: {
  connection_string: string;
  port?: number;
  clock?: Clock;
  skipConfigValidation?: boolean;
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

  const runningServer = createApiServer(options);

  await new Promise<void>((resolve, reject) => {
    runningServer.server.once("error", reject);
    runningServer.server.listen(options.port ?? 0, "127.0.0.1", () => resolve());
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

  const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3001;

  startApiServer({ connection_string: connectionString, port }).then(({ port: boundPort }) => {
    console.log(`API server listening on http://127.0.0.1:${boundPort}`);
  });
}
